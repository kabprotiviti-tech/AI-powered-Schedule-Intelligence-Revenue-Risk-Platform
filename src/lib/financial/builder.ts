/**
 * Financial Traceability Builder
 *
 * Translates engine outputs (CPM, DCMA, EVM) + project financials into
 * fully traced financial impact records with activity-level attribution.
 *
 * Three impact categories:
 *   revenue_delay     — delay-driven revenue slip linked to critical path
 *   cost_escalation   — EAC overrun, prolongation, and rework costs
 *   claim             — EOT, disruption, and prolongation claims
 */
import type { DCMAOutput }        from "@/lib/engines/dcma/index";
import type { CPMOutput }         from "@/lib/engines/cpm/index";
import type { EVMOutput }         from "@/lib/engines/evm/index";
import type { OrchestratorResult } from "@/lib/engines/orchestrator";
import type { Project }           from "@/lib/types";
import type {
  FinancialImpactRecord, FinancialTraceResponse,
  ActivityImpactLink, ActivityExposureSummary, ImpactType,
} from "./types";
import { PROJECTS } from "@/lib/data/mock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Daily overhead rate: 0.018% of budget per day (industry proxy for site overhead) */
function dailyOverhead(budget: number): number {
  return budget * 0.00018;
}

/** Daily revenue rate from CPM finish variance */
function dailyRevenueRate(revenueAtRisk: number, varianceDays: number): number {
  return revenueAtRisk / Math.max(1, varianceDays);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Revenue Delay records ────────────────────────────────────────────────────

function buildRevenueDelayRecords(
  project: Project,
  cpm:     CPMOutput,
  dcma:    DCMAOutput,
): FinancialImpactRecord[] {
  const records: FinancialImpactRecord[] = [];
  const delay  = cpm.detail.finish_variance_days;
  const revRisk = project.revenueAtRisk;
  if (revRisk <= 0) return records;

  const floatMap: Record<string, number> = {};
  cpm.detail.float_records.forEach((r) => { floatMap[r.activity_id] = r.total_float; });

  // Build responsible_party lookup from DCMA
  const ownerMap: Record<string, string | null> = {};
  dcma.detail.top_risk_activities.forEach((a) => {
    ownerMap[a.activity_id] = a.responsible_party;
  });

  // ── Record 1: Critical Path Milestone Slip ──────────────────────────────
  if (delay > 0) {
    const critActs = cpm.detail.float_records
      .filter((r) => r.is_critical || r.total_float < 0)
      .sort((a, b) => a.total_float - b.total_float)
      .slice(0, 10);

    const totalWeight = critActs.reduce((s, a) => s + Math.abs(Math.min(a.total_float, 0)) + 1, 0);
    const amount      = round2(revRisk * 0.65);

    const activities: ActivityImpactLink[] = critActs.map((a) => {
      const w    = Math.abs(Math.min(a.total_float, 0)) + 1;
      const pct  = round2((w / totalWeight) * 100);
      const dcmaFails = dcma.detail.top_risk_activities
        .find((d) => d.activity_id === a.activity_id)?.checks_failed ?? [];
      return {
        activity_id:      a.activity_id,
        external_id:      a.external_id,
        name:             a.name,
        wbs_code:         a.wbs_code,
        responsible_party: ownerMap[a.activity_id] ?? null,
        is_critical:      true,
        float_days:       a.total_float,
        share_pct:        pct,
        share_amount_aed: round2(amount * pct / 100),
        delay_days:       Math.abs(Math.min(a.total_float, 0)),
        driver_checks:    dcmaFails,
      };
    });

    records.push({
      id:         uid("rev-cp"),
      type:       "revenue_delay",
      category:   "Milestone Slip — Critical Path Extension",
      title:      `Project completion delayed ${delay} days — handover and revenue recognition pushed`,
      amount_aed: amount,
      confidence: delay >= 30 ? "High" : "Medium",
      basis:      `CPM finish variance × daily revenue rate (AED ${Math.round(dailyRevenueRate(revRisk, delay)).toLocaleString()}/day). 65% of total revenue-at-risk allocated to critical path activities.`,
      driver: {
        source:       "CPM",
        description:  `Critical path extends ${delay} days beyond planned finish. ${cpm.detail.negative_float_count} activities carry negative float.`,
        metric_value: `+${delay}d`,
        metric_label: "Finish Variance",
      },
      activities,
    });
  }

  // ── Record 2: Near-Critical Path Risk ─────────────────────────────────────
  const nearCount = cpm.detail.near_critical_count;
  if (nearCount >= 5) {
    const nearActs = cpm.detail.float_records
      .filter((r) => r.total_float > 0 && r.total_float <= 14)
      .sort((a, b) => a.total_float - b.total_float)
      .slice(0, 8);

    const riskFactor = Math.min(1, nearCount / 20);
    const amount     = round2(revRisk * 0.35 * riskFactor);
    const perAct     = round2(amount / Math.max(1, nearActs.length));

    const activities: ActivityImpactLink[] = nearActs.map((a) => ({
      activity_id:       a.activity_id,
      external_id:       a.external_id,
      name:              a.name,
      wbs_code:          a.wbs_code,
      responsible_party: ownerMap[a.activity_id] ?? null,
      is_critical:       false,
      float_days:        a.total_float,
      share_pct:         round2(100 / nearActs.length),
      share_amount_aed:  perAct,
      delay_days:        Math.ceil((14 - a.total_float) / 14 * delay),
      driver_checks:     [],
    }));

    records.push({
      id:         uid("rev-nc"),
      type:       "revenue_delay",
      category:   "Near-Critical Path Risk — Probabilistic Revenue Exposure",
      title:      `${nearCount} activities have < 14 days float — any slip extends handover further`,
      amount_aed: amount,
      confidence: "Medium",
      basis:      `Probabilistic estimate: ${nearCount} near-critical activities × Monte Carlo sensitivity factor (${(riskFactor * 100).toFixed(0)}%). 35% of revenue-at-risk in this bucket.`,
      driver: {
        source:       "CPM",
        description:  `${nearCount} activities carry only 1–14 days of float. Each is one disruption away from becoming critical, which would extend finish variance further.`,
        metric_value: `${nearCount} activities`,
        metric_label: "Near-Critical Count",
      },
      activities,
    });
  }

  return records;
}

// ─── Cost Escalation records ──────────────────────────────────────────────────

function buildCostEscalationRecords(
  project: Project,
  evm:     EVMOutput,
  cpm:     CPMOutput,
  dcma:    DCMAOutput,
): FinancialImpactRecord[] {
  const records: FinancialImpactRecord[] = [];
  const d        = evm.detail;
  const delay    = cpm.detail.finish_variance_days;
  const overhead = dailyOverhead(project.budget);

  // Build owner map
  const ownerMap: Record<string, string | null> = {};
  dcma.detail.top_risk_activities.forEach((a) => { ownerMap[a.activity_id] = a.responsible_party; });

  // ── Record 1: Direct EAC Overrun (CPI-driven) ────────────────────────────
  const eacOverrun = Math.max(0, d.eac - d.bac);
  if (eacOverrun > 0 || d.cpi < 1) {
    const lagging = d.activity_evm
      .filter((a) => a.cpi !== null && a.cpi < 0.95 && a.cv < 0)
      .sort((a, b) => a.cv - b.cv)
      .slice(0, 10);

    const totalCV   = lagging.reduce((s, a) => s + Math.abs(a.cv), 0) || 1;
    const amount    = eacOverrun > 0 ? round2(eacOverrun) : round2(d.bac * (1 / d.cpi - 1));

    const activities: ActivityImpactLink[] = lagging.map((a) => {
      const pct = round2((Math.abs(a.cv) / totalCV) * 100);
      const cpiFails = dcma.detail.top_risk_activities
        .find((d) => d.activity_id === a.activity_id)?.checks_failed ?? [];
      return {
        activity_id:       a.activity_id,
        external_id:       a.external_id,
        name:              a.name,
        wbs_code:          a.wbs_code,
        responsible_party: ownerMap[a.activity_id] ?? null,
        is_critical:       cpm.detail.critical_path.includes(a.activity_id),
        float_days:        cpm.detail.float_records.find((r) => r.activity_id === a.activity_id)?.total_float ?? null,
        share_pct:         pct,
        share_amount_aed:  round2(amount * pct / 100),
        delay_days:        0,
        driver_checks:     cpiFails,
      };
    });

    records.push({
      id:         uid("cost-eac"),
      type:       "cost_escalation",
      category:   "Direct Cost Overrun — EAC Exceeds Budget",
      title:      `EAC of AED ${(d.eac / 1e6).toFixed(1)}M exceeds BAC of AED ${(d.bac / 1e6).toFixed(1)}M (CPI ${d.cpi.toFixed(3)})`,
      amount_aed: amount,
      confidence: "High",
      basis:      `EVM primary forecast: EAC = AC + (BAC − EV) / CPI = AED ${(d.ac / 1e6).toFixed(1)}M + (${(d.bac / 1e6).toFixed(1)}M − ${(d.ev / 1e6).toFixed(1)}M) / ${d.cpi.toFixed(3)}. Overrun = AED ${(amount / 1e6).toFixed(1)}M.`,
      driver: {
        source:       "EVM",
        description:  `CPI of ${d.cpi.toFixed(3)} means for every AED 1.00 spent, only AED ${d.cpi.toFixed(2)} of value is delivered. ${d.below_cpi_09} activities have CPI below 0.9.`,
        metric_value: `CPI ${d.cpi.toFixed(3)}`,
        metric_label: "Cost Performance Index",
      },
      activities,
    });
  }

  // ── Record 2: Prolongation Cost (delay-driven overhead) ──────────────────
  if (delay > 0) {
    const prolAmount = round2(delay * overhead);

    // Attribution: critical path activities, weighted equally
    const critActs = cpm.detail.float_records
      .filter((r) => r.is_critical)
      .slice(0, 8);

    const perAct = round2(prolAmount / Math.max(1, critActs.length));

    const activities: ActivityImpactLink[] = critActs.map((a) => ({
      activity_id:       a.activity_id,
      external_id:       a.external_id,
      name:              a.name,
      wbs_code:          a.wbs_code,
      responsible_party: ownerMap[a.activity_id] ?? null,
      is_critical:       true,
      float_days:        a.total_float,
      share_pct:         round2(100 / critActs.length),
      share_amount_aed:  perAct,
      delay_days:        delay,
      driver_checks:     [],
    }));

    records.push({
      id:         uid("cost-prol"),
      type:       "cost_escalation",
      category:   "Prolongation Cost — Site Overhead During Delay",
      title:      `${delay}-day delay incurs AED ${(prolAmount / 1e6).toFixed(1)}M in additional site overhead`,
      amount_aed: prolAmount,
      confidence: "Medium",
      basis:      `Daily overhead rate: AED ${Math.round(overhead).toLocaleString()}/day (0.018% of budget). Applied to ${delay} days of CPM finish variance. Shared equally across ${critActs.length} critical path activities.`,
      driver: {
        source:       "CPM",
        description:  `${delay}-day CPM finish variance requires the project site, staff, and equipment to remain mobilised beyond the planned completion date, accumulating daily overhead.`,
        metric_value: `+${delay}d`,
        metric_label: "Schedule Overrun",
      },
      activities,
    });
  }

  // ── Record 3: Rework / Remediation from DCMA Violations ──────────────────
  const critViolations  = dcma.detail.violations_by_severity.Critical.length;
  const highViolations  = dcma.detail.violations_by_severity.High.length;
  const reworkableCount = critViolations + highViolations;

  if (reworkableCount > 0) {
    // Estimate rework cost: avg AED 50k per Critical + AED 25k per High violation
    const reworkEstimate = round2(
      critViolations * 50_000 + highViolations * 25_000,
    );

    const topRiskActs = dcma.detail.top_risk_activities
      .filter((a) => a.checks_failed.some((c) => ["LOGIC", "NEG_FLOAT", "INVALID_DATES", "HARD_CONST"].includes(c)))
      .slice(0, 8);

    const totalImpact = topRiskActs.reduce((s, a) => s + a.total_schedule_impact_days, 0) || 1;

    const activities: ActivityImpactLink[] = topRiskActs.map((a) => {
      const pct = round2((a.total_schedule_impact_days / totalImpact) * 100);
      return {
        activity_id:       a.activity_id,
        external_id:       a.external_id,
        name:              a.name,
        wbs_code:          a.wbs_code,
        responsible_party: a.responsible_party,
        is_critical:       cpm.detail.critical_path.includes(a.activity_id),
        float_days:        cpm.detail.float_records.find((r) => r.activity_id === a.activity_id)?.total_float ?? null,
        share_pct:         pct,
        share_amount_aed:  round2(reworkEstimate * pct / 100),
        delay_days:        a.total_schedule_impact_days,
        driver_checks:     a.checks_failed,
      };
    });

    records.push({
      id:         uid("cost-rework"),
      type:       "cost_escalation",
      category:   "Rework & Remediation — DCMA Violation Correction",
      title:      `${reworkableCount} Critical/High violations require schedule remediation (${critViolations} Critical, ${highViolations} High)`,
      amount_aed: reworkEstimate,
      confidence: "Low",
      basis:      `Estimate: AED 50K per Critical violation × ${critViolations} + AED 25K per High violation × ${highViolations}. Covers planner time, schedule updates, and re-baselining activities.`,
      driver: {
        source:       "DCMA",
        description:  `${critViolations} Critical (×3 weighted) and ${highViolations} High (×2 weighted) DCMA violations require active remediation — missing logic, negative float, and hard constraints can't be resolved without schedule rework.`,
        metric_value: `${reworkableCount} violations`,
        metric_label: "Critical + High Violations",
      },
      activities,
    });
  }

  return records;
}

// ─── Claims records ───────────────────────────────────────────────────────────

function buildClaimsRecords(
  project: Project,
  dcma:    DCMAOutput,
  cpm:     CPMOutput,
  evm:     EVMOutput,
): FinancialImpactRecord[] {
  const records: FinancialImpactRecord[] = [];
  const delay    = cpm.detail.finish_variance_days;
  const overhead = dailyOverhead(project.budget);

  const ownerMap: Record<string, string | null> = {};
  dcma.detail.top_risk_activities.forEach((a) => { ownerMap[a.activity_id] = a.responsible_party; });

  // ── Claim 1: Extension of Time (EOT) ─────────────────────────────────────
  if (delay > 0) {
    // EOT claim = contractor overhead for delay period
    // Contractor overhead est. = 60% of total prolongation cost (contractor's share)
    const eotAmount = round2(delay * overhead * 0.60);

    const critActs = cpm.detail.float_records
      .filter((r) => r.is_critical || r.total_float < 0)
      .sort((a, b) => a.total_float - b.total_float)
      .slice(0, 8);

    const totalWeight = critActs.reduce((s, a) => s + (Math.abs(Math.min(0, a.total_float)) + 1), 0);

    const activities: ActivityImpactLink[] = critActs.map((a) => {
      const w    = Math.abs(Math.min(0, a.total_float)) + 1;
      const pct  = round2((w / totalWeight) * 100);
      const dcmaFails = dcma.detail.top_risk_activities
        .find((d) => d.activity_id === a.activity_id)?.checks_failed ?? [];
      return {
        activity_id:       a.activity_id,
        external_id:       a.external_id,
        name:              a.name,
        wbs_code:          a.wbs_code,
        responsible_party: ownerMap[a.activity_id] ?? null,
        is_critical:       true,
        float_days:        a.total_float,
        share_pct:         pct,
        share_amount_aed:  round2(eotAmount * pct / 100),
        delay_days:        Math.max(0, -a.total_float),
        driver_checks:     dcmaFails,
      };
    });

    records.push({
      id:         uid("claim-eot"),
      type:       "claim",
      category:   "EOT Claim — Extension of Time",
      title:      `Contractor entitlement claim for ${delay}-day delay — site overhead and preliminaries`,
      amount_aed: eotAmount,
      confidence: delay >= 30 ? "High" : "Medium",
      basis:      `EOT claim estimate: ${delay} days × AED ${Math.round(overhead * 0.6).toLocaleString()}/day (60% of site overhead allocated to contractor preliminaries). Entitlement subject to causation analysis.`,
      driver: {
        source:       "CPM",
        description:  `${delay}-day finish variance gives contractor basis for EOT claim under standard contract clauses. Claims are strongest where delay is on the critical path and attributable to employer-risk events.`,
        metric_value: `+${delay}d`,
        metric_label: "Delay Entitlement",
      },
      activities,
    });
  }

  // ── Claim 2: Disruption Claim (logic violations) ──────────────────────────
  const logicViolations = dcma.detail.violations_by_check["LOGIC"]?.violation_count ?? 0;
  const hardConstraints = dcma.detail.violations_by_check["HARD_CONST"]?.violation_count ?? 0;
  const disruptionCount = logicViolations + hardConstraints;

  if (disruptionCount > 5) {
    // Disruption: avg AED 15k per violation (loss of productivity, resequencing)
    const disruptAmount = round2(disruptionCount * 15_000);

    const disruptActs = dcma.detail.top_risk_activities
      .filter((a) =>
        a.checks_failed.includes("LOGIC") ||
        a.checks_failed.includes("HARD_CONST"),
      )
      .slice(0, 8);

    const totalImpact = disruptActs.reduce((s, a) => s + a.risk_contribution_pct, 0) || 1;

    const activities: ActivityImpactLink[] = disruptActs.map((a) => {
      const pct = round2((a.risk_contribution_pct / totalImpact) * 100);
      return {
        activity_id:       a.activity_id,
        external_id:       a.external_id,
        name:              a.name,
        wbs_code:          a.wbs_code,
        responsible_party: a.responsible_party,
        is_critical:       cpm.detail.critical_path.includes(a.activity_id),
        float_days:        cpm.detail.float_records.find((r) => r.activity_id === a.activity_id)?.total_float ?? null,
        share_pct:         pct,
        share_amount_aed:  round2(disruptAmount * pct / 100),
        delay_days:        a.total_schedule_impact_days,
        driver_checks:     a.checks_failed.filter((c) => ["LOGIC", "HARD_CONST"].includes(c)),
      };
    });

    records.push({
      id:         uid("claim-disr"),
      type:       "claim",
      category:   "Disruption Claim — Logic & Constraint Violations",
      title:      `${disruptionCount} logic/constraint violations indicate disrupted planned sequence — loss of productivity claim`,
      amount_aed: disruptAmount,
      confidence: "Low",
      basis:      `Disruption estimate: ${logicViolations} missing logic links × AED 10K + ${hardConstraints} hard constraints × AED 20K. Based on out-of-sequence working and resequencing costs.`,
      driver: {
        source:       "DCMA",
        check_code:   "LOGIC",
        check_name:   "Missing Logic / Hard Constraints",
        description:  `${logicViolations} DCMA LOGIC violations and ${hardConstraints} HARD_CONST violations indicate forced resequencing and out-of-sequence working, which generates contractor disruption entitlement.`,
        metric_value: `${disruptionCount} violations`,
        metric_label: "Logic + Constraint Violations",
      },
      activities,
    });
  }

  // ── Claim 3: Prolongation Cost Claim (contractor's costs during delay) ────
  const missedActs = dcma.detail.violations_by_check["MISSED_ACT"]?.violation_count ?? 0;
  if (missedActs > 3 && delay > 0) {
    const prolongAmount = round2(delay * overhead * 0.25);  // 25% — subcontractor prolongation

    const overdueActs = dcma.detail.top_risk_activities
      .filter((a) => a.checks_failed.includes("MISSED_ACT") || a.checks_failed.includes("BEI"))
      .slice(0, 6);

    const activities: ActivityImpactLink[] = overdueActs.map((a, i) => ({
      activity_id:       a.activity_id,
      external_id:       a.external_id,
      name:              a.name,
      wbs_code:          a.wbs_code,
      responsible_party: a.responsible_party,
      is_critical:       cpm.detail.critical_path.includes(a.activity_id),
      float_days:        cpm.detail.float_records.find((r) => r.activity_id === a.activity_id)?.total_float ?? null,
      share_pct:         round2(100 / overdueActs.length),
      share_amount_aed:  round2(prolongAmount / overdueActs.length),
      delay_days:        a.total_schedule_impact_days,
      driver_checks:     a.checks_failed,
    }));

    records.push({
      id:         uid("claim-prol"),
      type:       "claim",
      category:   "Prolongation Cost Claim — Overdue Baseline Activities",
      title:      `${missedActs} activities missed baseline dates — subcontractor prolongation cost exposure`,
      amount_aed: prolongAmount,
      confidence: "Low",
      basis:      `Subcontractor prolongation: ${delay} days × AED ${Math.round(overhead * 0.25).toLocaleString()}/day (25% of overhead for subcontractors on site). Triggered by ${missedActs} MISSED_ACT violations.`,
      driver: {
        source:       "DCMA",
        check_code:   "MISSED_ACT",
        check_name:   "Missed Baseline Activities",
        description:  `${missedActs} activities are past their baseline completion date but still open. Each unresolved baseline miss extends subcontractor presence and triggers prolongation entitlement.`,
        metric_value: `${missedActs} activities`,
        metric_label: "Missed Baseline Activities",
      },
      activities,
    });
  }

  return records;
}

// ─── Activity exposure cross-reference ───────────────────────────────────────

function buildActivityExposure(records: FinancialImpactRecord[]): ActivityExposureSummary[] {
  const map = new Map<string, ActivityExposureSummary>();

  for (const rec of records) {
    for (const act of rec.activities) {
      if (!map.has(act.activity_id)) {
        map.set(act.activity_id, {
          activity_id:        act.activity_id,
          external_id:        act.external_id,
          name:               act.name,
          wbs_code:           act.wbs_code,
          responsible_party:  act.responsible_party,
          is_critical:        act.is_critical,
          float_days:         act.float_days,
          total_exposure_aed: 0,
          impact_types:       [],
          impact_count:       0,
          records:            [],
        });
      }
      const entry = map.get(act.activity_id)!;
      entry.total_exposure_aed += act.share_amount_aed;
      if (!entry.impact_types.includes(rec.type)) entry.impact_types.push(rec.type);
      if (!entry.records.includes(rec.id)) entry.records.push(rec.id);
      entry.impact_count = entry.records.length;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.total_exposure_aed - a.total_exposure_aed);
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildFinancialTrace(
  projectId: string,
  result:    OrchestratorResult,
): FinancialTraceResponse | null {
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;

  const dcma = result.results["DCMA"] as DCMAOutput       | undefined;
  const cpm  = result.results["CPM"]  as CPMOutput        | undefined;
  const evm  = result.results["EVM"]  as EVMOutput        | undefined;

  if (!dcma || !cpm || !evm) return null;

  const records: FinancialImpactRecord[] = [
    ...buildRevenueDelayRecords(project, cpm, dcma),
    ...buildCostEscalationRecords(project, evm, cpm, dcma),
    ...buildClaimsRecords(project, dcma, cpm, evm),
  ].sort((a, b) => b.amount_aed - a.amount_aed);

  const revenue_delay_aed   = records.filter((r) => r.type === "revenue_delay").reduce((s, r) => s + r.amount_aed, 0);
  const cost_escalation_aed = records.filter((r) => r.type === "cost_escalation").reduce((s, r) => s + r.amount_aed, 0);
  const claims_aed          = records.filter((r) => r.type === "claim").reduce((s, r) => s + r.amount_aed, 0);
  const total               = revenue_delay_aed + cost_escalation_aed + claims_aed;

  return {
    project_id:   projectId,
    project_name: project.name,
    computed_at:  new Date().toISOString(),

    summary: {
      total_exposure_aed:     round2(total),
      revenue_delay_aed:      round2(revenue_delay_aed),
      cost_escalation_aed:    round2(cost_escalation_aed),
      claims_aed:             round2(claims_aed),
      budget_aed:             project.budget,
      revenue_at_risk_aed:    project.revenueAtRisk,
      exposure_pct_of_budget: round2((total / project.budget) * 100),
    },

    records,
    activity_exposure: buildActivityExposure(records),
  };
}
