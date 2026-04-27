/**
 * DCMA Engine — orchestrates all 14 checks and assembles the full violation dataset.
 *
 * Output contract:
 *  - violation_dataset:      every single violating activity, with risk_contribution_pct
 *  - violations_by_check:    violations grouped by check, with subtotals
 *  - violations_by_severity: grouped Critical / High / Medium / Low
 *  - violations_by_wbs:      grouped by top-level WBS code, with risk % per area
 *
 * NO aggregated metric is returned without its full backing activity-level dataset.
 */
import type { IFrameworkEngine, EngineInput, EngineDescriptor } from "../core/interface";
import type {
  EngineOutput,
  ValidationResult,
  ExecutionContext,
  ActivityIssue,
  RiskContribution,
  DCMAThresholds,
} from "../core/types";
import { DEFAULT_DCMA_THRESHOLDS } from "../core/types";
import {
  checkLogic,
  checkLeads,
  checkLags,
  checkRelTypes,
  checkHardConstraints,
  checkHighFloat,
  checkNegativeFloat,
  checkHighDuration,
  checkInvalidDates,
  checkResources,
  checkMissedActivities,
  checkCriticalPathTest,
  checkCPLI,
  checkBEI,
  type CheckResult,
} from "./checks";

// ─── Extended violation record ────────────────────────────────────────────────

/**
 * One record per violating activity. Extends ActivityIssue with:
 *  - risk_contribution_pct: this activity's share of total DCMA schedule risk
 *  - risk_rank:             1 = highest risk contributor
 *  - check_code / check_name: which check produced this violation
 */
export interface DCMAViolationRecord extends ActivityIssue {
  risk_contribution_pct: number;   // 0–100, share of total impact
  risk_rank:             number;   // ascending from 1
  check_code:            string;
  check_name:            string;
}

// ─── Grouped violation views ──────────────────────────────────────────────────

export interface ViolationsByCheck {
  check_code:                  string;
  check_name:                  string;
  check_description:           string;
  severity_weight:             number;
  status:                      "Pass" | "Fail" | "Warning" | "N/A";
  pass_rate_pct:               number;
  violation_count:             number;
  subtotal_schedule_impact_days: number;
  subtotal_risk_pct:           number;
  violations:                  DCMAViolationRecord[];
}

export interface ViolationsByWBS {
  wbs_prefix:              string;   // e.g. "3" (top-level segment)
  violation_count:         number;
  risk_contribution_pct:   number;
  total_schedule_impact_days: number;
  severity_counts: {
    Critical: number;
    High:     number;
    Medium:   number;
    Low:      number;
  };
  violations:              DCMAViolationRecord[];
}

// ─── Score breakdown ──────────────────────────────────────────────────────────

interface ScoreBreakdown {
  earned_points: number;
  max_points:    number;   // 27 for standard 14-check DCMA
  by_check:      Record<string, { pass_rate: number; weight: number; earned: number; status: string }>;
}

// ─── Full output ──────────────────────────────────────────────────────────────

export interface DCMAOutput extends EngineOutput {
  engine_id: "DCMA";
  detail: {
    // ── Raw check results (one row per check) ──
    check_results:               CheckResult[];

    // ── Full violation dataset ──
    // Every violating activity across all 14 checks, sorted by risk_contribution_pct desc.
    // Each record carries risk_contribution_pct so consumers can build their own views.
    violation_dataset:           DCMAViolationRecord[];
    total_violations:            number;
    total_schedule_impact_days:  number;
    violations_with_owner:       number;   // violations where responsible_party is known

    // ── Grouped views ──
    violations_by_check:         Record<string, ViolationsByCheck>;
    violations_by_severity: {
      Critical: DCMAViolationRecord[];
      High:     DCMAViolationRecord[];
      Medium:   DCMAViolationRecord[];
      Low:      DCMAViolationRecord[];
    };
    violations_by_wbs:           Record<string, ViolationsByWBS>;

    // ── Top risk contributors ──
    // Top 20 activities by cumulative risk_contribution_pct across ALL checks
    top_risk_activities:         Array<{
      activity_id:         string;
      external_id:         string;
      name:                string;
      wbs_code:            string;
      responsible_party:   string | null;
      violation_count:     number;
      checks_failed:       string[];
      cumulative_impact:   number;
      risk_contribution_pct: number;
      total_schedule_impact_days: number;
    }>;

    // ── Project-level indices ──
    overall_score:     number;
    overall_pass:      boolean;
    critical_failures: string[];     // check_codes with Critical severity that failed
    cpli:              number;
    bei:               number;
    total_activities:  number;
    task_count:        number;
    score_breakdown:   ScoreBreakdown;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DCMAEngine
// ─────────────────────────────────────────────────────────────────────────────

export class DCMAEngine implements IFrameworkEngine<EngineInput, DCMAOutput> {
  readonly engineId = "DCMA" as const;
  readonly version  = "2.0.0";

  validate(input: EngineInput): ValidationResult {
    const errors: string[] = [];
    if (!input.activities?.length)  errors.push("activities array is required");
    if (!input.project_finish_id)   errors.push("project_finish_id is required");
    if (!input.data_date)           errors.push("data_date is required");
    return { valid: errors.length === 0, errors };
  }

  async execute(input: EngineInput, ctx: ExecutionContext): Promise<DCMAOutput> {
    const t0 = Date.now();
    const thresholds: DCMAThresholds = {
      ...DEFAULT_DCMA_THRESHOLDS,
      ...input.options.dcma_thresholds,
    };

    // ── Run all 14 checks ───────────────────────────────────────────────────
    const checks: CheckResult[] = [
      // Check 1 — uses actual relationships (not adapter-patched flags)
      checkLogic(
        input.activities,
        input.relationships,
        input.project_start_id,
        input.project_finish_id,
        thresholds,
      ),
      checkLeads(input.activities, input.relationships, thresholds),
      checkLags(input.activities, input.relationships, thresholds),
      checkRelTypes(input.activities, input.relationships, thresholds),
      checkHardConstraints(input.activities, input.data_date, thresholds),
      checkHighFloat(input.activities, thresholds),
      checkNegativeFloat(input.activities, thresholds),
      checkHighDuration(input.activities, thresholds),
      checkInvalidDates(input.activities, input.data_date, thresholds),
      checkResources(input.activities, thresholds),
      checkMissedActivities(input.activities, input.data_date, thresholds),
      checkCriticalPathTest(
        input.activities,
        input.relationships,
        input.project_finish_id,
        thresholds,
      ),
      checkCPLI(input.activities, input.project_finish_id, thresholds),
      checkBEI(input.activities, input.data_date, thresholds),
    ];

    // ── Score ───────────────────────────────────────────────────────────────
    // Score = Σ(weight × passRate%) / maxPoints × 100
    // Weights: Critical=3, High=2, Medium=1 → max = 4×3 + 5×2 + 5×1 = 27
    const maxPoints = checks.reduce((s, c) => s + c.severity_weight, 0);
    let earnedPoints = 0;
    const byCheck: ScoreBreakdown["by_check"] = {};

    for (const c of checks) {
      const earned = c.severity_weight * (c.pass_rate_pct / 100);
      earnedPoints += earned;
      byCheck[c.check_code] = {
        pass_rate: c.pass_rate_pct,
        weight:    c.severity_weight,
        earned:    parseFloat(earned.toFixed(3)),
        status:    c.status,
      };
    }

    const score       = Math.round((earnedPoints / maxPoints) * 100);
    const overallPass = checks.every((c) => c.status === "Pass" || c.status === "N/A");
    const criticalFailures = checks
      .filter((c) => c.status === "Fail" && c.severity_weight === 3)
      .map((c) => c.check_code);

    // ── Flatten all raw issues ──────────────────────────────────────────────
    const rawIssues: Array<ActivityIssue & { check_code: string; check_name: string }> =
      checks.flatMap((c) =>
        c.issues.map((iss) => ({ ...iss, check_code: c.check_code, check_name: c.check_name })),
      );

    // ── Compute risk_contribution_pct per issue ─────────────────────────────
    // Risk is proportional to each issue's `impact` value (0–1).
    const totalImpact = rawIssues.reduce((s, i) => s + i.impact, 0) || 1;

    // Sort by impact desc to assign risk_rank
    const sortedByImpact = [...rawIssues].sort((a, b) => b.impact - a.impact);

    const violationDataset: DCMAViolationRecord[] = sortedByImpact.map((iss, idx) => ({
      ...iss,
      risk_contribution_pct: parseFloat(((iss.impact / totalImpact) * 100).toFixed(2)),
      risk_rank:             idx + 1,
    }));

    // ── violations_by_check ─────────────────────────────────────────────────
    const violationsByCheck: Record<string, ViolationsByCheck> = {};
    for (const c of checks) {
      const checkViolations = violationDataset.filter((v) => v.check_code === c.check_code);
      const subRisk = checkViolations.reduce((s, v) => s + v.risk_contribution_pct, 0);
      const subImpact = checkViolations.reduce((s, v) => s + v.schedule_impact_days, 0);

      violationsByCheck[c.check_code] = {
        check_code:                  c.check_code,
        check_name:                  c.check_name,
        check_description:           c.description,
        severity_weight:             c.severity_weight,
        status:                      c.status,
        pass_rate_pct:               c.pass_rate_pct,
        violation_count:             checkViolations.length,
        subtotal_schedule_impact_days: subImpact,
        subtotal_risk_pct:           parseFloat(subRisk.toFixed(2)),
        violations:                  checkViolations,
      };
    }

    // ── violations_by_severity ─────────────────────────────────────────────
    const bySeverity: DCMAOutput["detail"]["violations_by_severity"] = {
      Critical: violationDataset.filter((v) => v.severity === "Critical"),
      High:     violationDataset.filter((v) => v.severity === "High"),
      Medium:   violationDataset.filter((v) => v.severity === "Medium"),
      Low:      violationDataset.filter((v) => v.severity === "Low"),
    };

    // ── violations_by_wbs ──────────────────────────────────────────────────
    // Group by top-level WBS segment (e.g. "3" from "3.2.1", "0" from "0.0")
    const wbsMap = new Map<string, DCMAViolationRecord[]>();
    for (const v of violationDataset) {
      const prefix = v.wbs_code.split(".")[0] || "0";
      if (!wbsMap.has(prefix)) wbsMap.set(prefix, []);
      wbsMap.get(prefix)!.push(v);
    }
    const violationsByWBS: Record<string, ViolationsByWBS> = {};
    for (const [prefix, vlist] of wbsMap) {
      const totalRisk   = vlist.reduce((s, v) => s + v.risk_contribution_pct, 0);
      const totalImpactDays = vlist.reduce((s, v) => s + v.schedule_impact_days, 0);
      violationsByWBS[prefix] = {
        wbs_prefix:              prefix,
        violation_count:         vlist.length,
        risk_contribution_pct:   parseFloat(totalRisk.toFixed(2)),
        total_schedule_impact_days: totalImpactDays,
        severity_counts: {
          Critical: vlist.filter((v) => v.severity === "Critical").length,
          High:     vlist.filter((v) => v.severity === "High").length,
          Medium:   vlist.filter((v) => v.severity === "Medium").length,
          Low:      vlist.filter((v) => v.severity === "Low").length,
        },
        violations: vlist,
      };
    }

    // ── Top 20 risk activities (aggregated across all checks) ──────────────
    const actRiskMap = new Map<string, {
      activity_id: string; external_id: string; name: string; wbs_code: string;
      responsible_party: string | null;
      cumulativeImpact: number; checksFailed: Set<string>;
      totalScheduleImpact: number;
    }>();

    for (const v of violationDataset) {
      const existing = actRiskMap.get(v.activity_id);
      if (existing) {
        existing.cumulativeImpact    += v.impact;
        existing.checksFailed.add(v.check_code);
        existing.totalScheduleImpact += v.schedule_impact_days;
      } else {
        actRiskMap.set(v.activity_id, {
          activity_id:         v.activity_id,
          external_id:         v.external_id,
          name:                v.name,
          wbs_code:            v.wbs_code,
          responsible_party:   (v.evidence as Record<string, unknown>)["responsible_party"] as string | null ?? null,
          cumulativeImpact:    v.impact,
          checksFailed:        new Set([v.check_code]),
          totalScheduleImpact: v.schedule_impact_days,
        });
      }
    }

    const topRiskActivities = [...actRiskMap.values()]
      .sort((a, b) => b.cumulativeImpact - a.cumulativeImpact)
      .slice(0, 20)
      .map((a, idx) => ({
        activity_id:              a.activity_id,
        external_id:              a.external_id,
        name:                     a.name,
        wbs_code:                 a.wbs_code,
        responsible_party:        a.responsible_party,
        violation_count:          a.checksFailed.size,
        checks_failed:            [...a.checksFailed].sort(),
        cumulative_impact:        parseFloat(a.cumulativeImpact.toFixed(3)),
        risk_contribution_pct:    parseFloat(((a.cumulativeImpact / totalImpact) * 100).toFixed(2)),
        total_schedule_impact_days: a.totalScheduleImpact,
      }));

    // ── Risk contributions for base EngineOutput ───────────────────────────
    const riskContributions: RiskContribution[] = topRiskActivities.map((a) => ({
      activity_id:      a.activity_id,
      name:             a.name,
      risk_factor:      `dcma_findings:${a.checks_failed.join("+")}`,
      contribution_pct: a.risk_contribution_pct,
      absolute_value:   a.total_schedule_impact_days,
      unit:             "days",
      direction:        "increases_risk" as const,
      engine_id:        "DCMA" as const,
    }));

    // ── CPLI and BEI scalar values for summary ─────────────────────────────
    const cpliCheck    = checks.find((c) => c.check_code === "CPLI");
    const cpliIssue    = cpliCheck?.issues.find((i) => i.issue_code === "DCMA_CPLI_LOW");
    const cpliVal      = cpliIssue
      ? parseFloat((1 - cpliIssue.impact).toFixed(3))
      : 1.0;

    const beiCheck  = checks.find((c) => c.check_code === "BEI");
    const beiVal    = beiCheck
      ? parseFloat((beiCheck.pass_rate_pct / 100).toFixed(3))
      : 1.0;

    // ── Summary aggregates ─────────────────────────────────────────────────
    const totalViolations           = violationDataset.length;
    const totalScheduleImpactDays   = violationDataset.reduce((s, v) => s + v.schedule_impact_days, 0);
    const violationsWithOwner       = violationDataset.filter(
      (v) => (v.evidence as Record<string, unknown>)["responsible_party"],
    ).length;
    const taskCount                 = input.activities.filter((a) => a.activity_type === "Task").length;

    // ── Headline ───────────────────────────────────────────────────────────
    const failingChecks = checks.filter((c) => c.status === "Fail");
    const headline = overallPass
      ? `${score}/100 — All 14 DCMA checks passing`
      : `${score}/100 — ${failingChecks.length} check${failingChecks.length !== 1 ? "s" : ""} failing` +
        ` · ${totalViolations} violations · ${totalScheduleImpactDays}d schedule at risk` +
        (criticalFailures.length ? ` · Critical: ${criticalFailures.join(", ")}` : "");

    return {
      engine_id:    "DCMA",
      version:      this.version,
      execution_id: ctx.execution_id,
      project_id:   ctx.project_id,
      update_id:    ctx.update_id,
      computed_at:  new Date().toISOString(),
      duration_ms:  Date.now() - t0,
      status:       "success",

      summary: {
        score,
        pass: overallPass,
        headline,
        key_metrics: [
          {
            key: "dcma_score", label: "DCMA Score",
            value: score, unit: "/100",
            status: score >= 80 ? "ok" : score >= 60 ? "warn" : "critical",
            formula: "Σ(weight × passRate%) / 27 × 100",
          },
          {
            key: "total_violations", label: "Total Violations",
            value: totalViolations, unit: "activities",
            status: totalViolations === 0 ? "ok" : totalViolations < 10 ? "warn" : "critical",
            formula: "count of all violating activities across 14 checks",
          },
          {
            key: "neg_float_count", label: "Negative Float",
            value: bySeverity.Critical.filter((v) => v.issue_code === "DCMA_NEG_FLOAT").length,
            unit: "activities",
            status: bySeverity.Critical.filter((v) => v.issue_code === "DCMA_NEG_FLOAT").length === 0 ? "ok" : "critical",
            formula: "count(tasks where total_float < 0)",
          },
          {
            key: "missed_activities", label: "Missed Activities",
            value: checks.find((c) => c.check_code === "MISSED_ACT")?.failed_count ?? 0,
            unit: "activities",
            status: (checks.find((c) => c.check_code === "MISSED_ACT")?.failed_count ?? 0) === 0 ? "ok"
                  : (checks.find((c) => c.check_code === "MISSED_ACT")?.status === "Warning")    ? "warn"
                  : "critical",
            formula: "count(incomplete tasks where planned_finish < data_date)",
          },
          {
            key: "cpli", label: "CPLI",
            value: cpliVal, unit: "index",
            status: cpliVal >= 0.95 ? "ok" : cpliVal >= 0.85 ? "warn" : "critical",
            formula: "(Project Float + Total Critical Remaining) / Total Critical Remaining",
          },
          {
            key: "bei", label: "BEI",
            value: beiVal, unit: "index",
            status: beiVal >= 0.95 ? "ok" : beiVal >= 0.85 ? "warn" : "critical",
            formula: "Completed Activities / Activities That Should Be Complete by Data Date",
          },
        ],
        formula_inputs: {
          score,
          maxPoints,
          earnedPoints:    parseFloat(earnedPoints.toFixed(2)),
          totalViolations,
          totalScheduleImpactDays,
          byCheck,
        },
      },

      activity_issues:    rawIssues,
      risk_contributions: riskContributions,

      detail: {
        // Raw check results
        check_results:              checks,

        // Full violation dataset — every record has risk_contribution_pct
        violation_dataset:          violationDataset,
        total_violations:           totalViolations,
        total_schedule_impact_days: totalScheduleImpactDays,
        violations_with_owner:      violationsWithOwner,

        // Grouped views
        violations_by_check:    violationsByCheck,
        violations_by_severity: bySeverity,
        violations_by_wbs:      violationsByWBS,

        // Top 20 risk activities
        top_risk_activities: topRiskActivities,

        // Project-level indices
        overall_score:     score,
        overall_pass:      overallPass,
        critical_failures: criticalFailures,
        cpli:              cpliVal,
        bei:               beiVal,
        total_activities:  input.activities.length,
        task_count:        taskCount,
        score_breakdown: {
          earned_points: parseFloat(earnedPoints.toFixed(2)),
          max_points:    maxPoints,
          by_check:      byCheck,
        },
      },
    };
  }

  describe(): EngineDescriptor {
    return {
      engineId:    "DCMA",
      version:     this.version,
      name:        "DCMA 14-Point Schedule Assessment",
      description:
        "Validates schedule quality against the DCMA 14-point framework. " +
        "Every metric is backed by a full activity-level violation dataset with " +
        "risk_contribution_pct per activity. Outputs: violation_dataset (all violations sorted by risk), " +
        "violations_by_check, violations_by_severity, violations_by_wbs, top_risk_activities.",
      inputs:  ["activities", "relationships", "data_date", "project_start_id", "project_finish_id"],
      outputs: [
        "score/100",
        "violation_dataset (all violations, risk_contribution_pct per record)",
        "violations_by_check (14 checks with subtotals)",
        "violations_by_severity (Critical/High/Medium/Low)",
        "violations_by_wbs (by WBS area)",
        "top_risk_activities (top 20 by cumulative impact)",
        "CPLI (per-critical-activity)",
        "BEI (per-overdue-activity)",
      ],
    };
  }
}
