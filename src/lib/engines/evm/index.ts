import type { IFrameworkEngine, EngineInput, EngineDescriptor } from "../core/interface";
import type { EngineOutput, ValidationResult, ExecutionContext, ActivityIssue, RiskContribution } from "../core/types";

export interface ActivityEVMRecord {
  activity_id:  string;
  external_id:  string;
  name:         string;
  wbs_code:     string;
  bac:          number;
  pv:           number;
  ev:           number;
  ac:           number;
  sv:           number;   // EV - PV
  cv:           number;   // EV - AC
  spi:          number | null;
  cpi:          number | null;
  status:       "ahead" | "on_track" | "behind" | "critical" | "no_data";
}

export interface EVMOutput extends EngineOutput {
  engine_id: "EVM";
  detail: {
    // Project-level
    bac:    number;   pv:   number;   ev:   number;   ac:   number;
    sv:     number;   cv:   number;   sv_pct: number; cv_pct: number;
    spi:    number;   cpi:  number;
    eac:    number;                   // primary: AC + (BAC-EV)/CPI
    eac_budget:    number;            // AC + (BAC-EV)           — optimistic
    eac_composite: number;            // AC + (BAC-EV)/(SPI×CPI) — composite
    etc:    number;   vac:  number;   tcpi: number;
    ieac_t: number;                   // planned_duration / SPI
    schedule_overrun_days: number;

    percent_complete_physical: number;
    cost_efficiency_ratio:     number;  // CPI — how much value per AED spent

    // Per-activity
    activity_evm:  ActivityEVMRecord[];
    below_spi_09:  number;             // count of activities with SPI < 0.9
    below_cpi_09:  number;
  };
}

export class EVMEngine implements IFrameworkEngine<EngineInput, EVMOutput> {
  readonly engineId = "EVM" as const;
  readonly version  = "1.0.0";

  validate(input: EngineInput): ValidationResult {
    const errors: string[] = [];
    if (!input.activities?.length) errors.push("activities array is required");
    if (!input.project_budget)     errors.push("project_budget (BAC) is required");
    if (!input.planned_duration)   errors.push("planned_duration is required");
    return { valid: errors.length === 0, errors };
  }

  async execute(input: EngineInput, ctx: ExecutionContext): Promise<EVMOutput> {
    const t0 = Date.now();
    const { activities, project_budget: BAC, planned_duration, elapsed_duration } = input;

    // ── Project-level aggregates ────────────────────────────────────────────
    let PV = 0, EV = 0, AC = 0;
    for (const a of activities) {
      PV += a.planned_value  ?? 0;
      EV += a.earned_value   ?? 0;
      AC += a.actual_cost    ?? 0;
    }

    // If no EVM data loaded, estimate from progress and budget
    if (PV === 0 && EV === 0) {
      const avgPct = activities.reduce((s, a) => s + a.percent_complete, 0) / activities.length / 100;
      const elapsedPct = elapsed_duration / planned_duration;
      PV = BAC * elapsedPct;
      EV = BAC * avgPct;
      AC = EV * 1.05; // assume slight cost overrun for demo
    }

    const SPI = PV  > 0 ? EV / PV  : 1;
    const CPI = AC  > 0 ? EV / AC  : 1;
    const SV  = EV - PV;
    const CV  = EV - AC;
    const SV_pct = PV > 0 ? (SV / PV) * 100 : 0;
    const CV_pct = EV > 0 ? (CV / EV) * 100 : 0;

    // ── Forecasts ────────────────────────────────────────────────────────────
    // EAC — three methods
    const EAC_cpi      = CPI  > 0 ? AC + (BAC - EV) / CPI              : BAC;
    const EAC_budget   = AC + (BAC - EV);
    const EAC_composite= SPI > 0 && CPI > 0 ? AC + (BAC - EV) / (SPI * CPI) : EAC_cpi;

    const ETC  = EAC_cpi - AC;
    const VAC  = BAC - EAC_cpi;
    const TCPI = (BAC - EV) > 0 && (BAC - AC) > 0 ? (BAC - EV) / (BAC - AC) : 1;
    const IEAC_t = SPI > 0 ? planned_duration / SPI : planned_duration;
    const scheduleOverrun = Math.round(IEAC_t - planned_duration);

    // ── Per-activity EVM ─────────────────────────────────────────────────────
    const activityEVM: ActivityEVMRecord[] = activities
      .filter((a) => (a.budgeted_at_completion ?? 0) > 0 || (a.planned_value ?? 0) > 0)
      .map((a) => {
        const bac = a.budgeted_at_completion ?? a.planned_value ?? 0;
        const pv  = a.planned_value  ?? bac * (elapsed_duration / planned_duration);
        const ev  = a.earned_value   ?? bac * (a.percent_complete / 100);
        const ac  = a.actual_cost    ?? ev * 1.04;
        const spi = pv  > 0 ? ev / pv  : null;
        const cpi = ac  > 0 ? ev / ac  : null;
        const status = spi == null ? "no_data"
                     : spi >= 1.0  ? "ahead"
                     : spi >= 0.9  ? "on_track"
                     : spi >= 0.8  ? "behind"
                     : "critical";
        return {
          activity_id: a.activity_id, external_id: a.external_id,
          name: a.name, wbs_code: a.wbs_code,
          bac, pv, ev, ac,
          sv: ev - pv, cv: ev - ac,
          spi, cpi, status,
        };
      });

    const belowSPI09 = activityEVM.filter((a) => a.spi !== null && a.spi < 0.9).length;
    const belowCPI09 = activityEVM.filter((a) => a.cpi !== null && a.cpi < 0.9).length;

    // ── Issues ──────────────────────────────────────────────────────────────
    const issues: ActivityIssue[] = activityEVM
      .filter((a) => a.spi !== null && a.spi < 0.85)
      .map((a) => ({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "EVM" as const,
        issue_code:   "EVM_SPI_LOW",
        issue_type:   "Low Schedule Performance",
        severity:     (a.spi ?? 1) < 0.7 ? "Critical" as const : "High" as const,
        impact:       Math.min(1, Math.max(0, 1 - (a.spi ?? 1))),
        schedule_impact_days: Math.round(((1 / (a.spi ?? 1)) - 1) * (activities.find((x) => x.activity_id === a.activity_id)?.remaining_duration ?? 10)),
        cost_impact_aed: Math.abs(a.cv),
        description:  `${a.external_id} SPI = ${(a.spi ?? 0).toFixed(3)}: only ${((a.ev / a.pv) * 100).toFixed(1)}% of planned value earned for the period.`,
        evidence:     { spi: a.spi, cpi: a.cpi, pv: a.pv, ev: a.ev, ac: a.ac },
        recommended_action: "Investigate root cause of under-performance. Review resource productivity, rework, and scope creep.",
      }));

    // Low CPI issues
    activityEVM
      .filter((a) => a.cpi !== null && a.cpi < 0.85)
      .forEach((a) => issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "EVM" as const,
        issue_code:   "EVM_CPI_LOW",
        issue_type:   "Cost Overrun",
        severity:     (a.cpi ?? 1) < 0.7 ? "Critical" as const : "High" as const,
        impact:       Math.min(1, Math.max(0, 1 - (a.cpi ?? 1))),
        schedule_impact_days: 0,
        cost_impact_aed: Math.abs(a.cv),
        description:  `${a.external_id} CPI = ${(a.cpi ?? 0).toFixed(3)}: spending ${(1 / (a.cpi ?? 1)).toFixed(2)} AED for every 1 AED of earned value.`,
        evidence:     { spi: a.spi, cpi: a.cpi, cv: a.cv },
        recommended_action: "Review unit rates and productivity. Issue change order or invoke contract clause if costs are out of scope.",
      }));

    // ── Risk contributions — % of budget overrun from each activity ──────────
    const totalCV = Math.abs(activityEVM.filter((a) => a.cv < 0).reduce((s, a) => s + a.cv, 0)) || 1;
    const riskContributions: RiskContribution[] = activityEVM
      .filter((a) => a.cv < 0)
      .sort((a, b) => a.cv - b.cv)
      .slice(0, 15)
      .map((a) => ({
        activity_id:      a.activity_id,
        name:             a.name,
        risk_factor:      "cost_variance",
        contribution_pct: parseFloat(((Math.abs(a.cv) / totalCV) * 100).toFixed(1)),
        absolute_value:   Math.abs(a.cv),
        unit:             "AED",
        direction:        "increases_risk" as const,
        engine_id:        "EVM" as const,
      }));

    const spiStatus = SPI >= 1.0 ? "ok" : SPI >= 0.9 ? "warn" : "critical";
    const cpiStatus = CPI >= 1.0 ? "ok" : CPI >= 0.9 ? "warn" : "critical";
    const score = Math.round(Math.min(100, ((SPI + CPI) / 2) * 100 * (1 - Math.max(0, scheduleOverrun / planned_duration))));

    return {
      engine_id: "EVM", version: this.version,
      execution_id: ctx.execution_id, project_id: ctx.project_id,
      update_id: ctx.update_id, computed_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, status: "success",

      summary: {
        score: Math.max(0, score),
        pass:  SPI >= 0.95 && CPI >= 0.95,
        headline: `SPI ${SPI.toFixed(2)} · CPI ${CPI.toFixed(2)} · EAC ${(EAC_cpi / 1_000_000).toFixed(0)}M AED · ${scheduleOverrun > 0 ? `+${scheduleOverrun}d schedule overrun` : "on schedule"}`,
        key_metrics: [
          { key: "spi",        label: "SPI",           value: parseFloat(SPI.toFixed(3)),          unit: "index",      status: spiStatus,    formula: "Earned Value / Planned Value" },
          { key: "cpi",        label: "CPI",           value: parseFloat(CPI.toFixed(3)),          unit: "index",      status: cpiStatus,    formula: "Earned Value / Actual Cost" },
          { key: "sv",         label: "Schedule Var.", value: parseFloat((SV / 1_000_000).toFixed(1)), unit: "M AED",  status: SV >= 0 ? "ok" : "warn", formula: "EV − PV" },
          { key: "cv",         label: "Cost Variance", value: parseFloat((CV / 1_000_000).toFixed(1)), unit: "M AED",  status: CV >= 0 ? "ok" : "warn", formula: "EV − AC" },
          { key: "eac",        label: "EAC",           value: parseFloat((EAC_cpi / 1_000_000).toFixed(1)), unit: "M AED", status: EAC_cpi <= BAC ? "ok" : "critical", formula: "AC + (BAC − EV) / CPI" },
          { key: "tcpi",       label: "TCPI",          value: parseFloat(TCPI.toFixed(3)),         unit: "index",      status: TCPI <= 1.1 ? "ok" : TCPI <= 1.2 ? "warn" : "critical", formula: "(BAC − EV) / (BAC − AC)" },
        ],
        formula_inputs: { BAC, PV, EV, AC, SPI, CPI, SV, CV, EAC_cpi, ETC, VAC, TCPI, IEAC_t },
      },

      activity_issues:    issues,
      risk_contributions: riskContributions,

      detail: {
        bac: BAC, pv: PV, ev: EV, ac: AC,
        sv: SV, cv: CV, sv_pct: parseFloat(SV_pct.toFixed(2)), cv_pct: parseFloat(CV_pct.toFixed(2)),
        spi: parseFloat(SPI.toFixed(4)), cpi: parseFloat(CPI.toFixed(4)),
        eac: EAC_cpi, eac_budget: EAC_budget, eac_composite: EAC_composite,
        etc: ETC, vac: VAC, tcpi: parseFloat(TCPI.toFixed(4)),
        ieac_t: parseFloat(IEAC_t.toFixed(1)), schedule_overrun_days: scheduleOverrun,
        percent_complete_physical: parseFloat(((EV / BAC) * 100).toFixed(2)),
        cost_efficiency_ratio: parseFloat(CPI.toFixed(4)),
        activity_evm: activityEVM, below_spi_09: belowSPI09, below_cpi_09: belowCPI09,
      },
    };
  }

  describe(): EngineDescriptor {
    return {
      engineId:    "EVM",
      version:     this.version,
      name:        "Earned Value Management",
      description: "Computes SPI, CPI, SV, CV, EAC (three methods), ETC, VAC, TCPI, and IEAC(t) at project and activity level. Flags activities with SPI < 0.85 or CPI < 0.85.",
      inputs:      ["activities (BAC/PV/EV/AC)", "project_budget", "planned_duration", "elapsed_duration"],
      outputs:     ["SPI", "CPI", "EAC (3 methods)", "TCPI", "IEAC(t)", "activity-level SPI/CPI", "cost overrun warnings"],
    };
  }
}
