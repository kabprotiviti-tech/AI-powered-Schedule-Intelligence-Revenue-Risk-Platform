import type { IFrameworkEngine, EngineInput, EngineDescriptor } from "../core/interface";
import type { EngineOutput, ValidationResult, ExecutionContext, ActivityIssue, RiskContribution, DCMAThresholds } from "../core/types";
import { DEFAULT_DCMA_THRESHOLDS } from "../core/types";
import {
  checkLogic, checkLeads, checkLags, checkRelTypes, checkHardConstraints,
  checkHighFloat, checkNegativeFloat, checkHighDuration, checkInvalidDates,
  checkResources, checkMissedActivities, checkCriticalPathTest, checkCPLI, checkBEI,
  type CheckResult,
} from "./checks";

export interface DCMAOutput extends EngineOutput {
  engine_id: "DCMA";
  detail: {
    check_results:     CheckResult[];
    overall_score:     number;
    overall_pass:      boolean;
    critical_failures: string[];
    cpli:              number;
    bei:               number;
    total_activities:  number;
    score_breakdown:   ScoreBreakdown;
  };
}

interface ScoreBreakdown {
  earned_points: number;
  max_points:    number;
  by_check:      Record<string, { pass_rate: number; weight: number; earned: number }>;
}

export class DCMAEngine implements IFrameworkEngine<EngineInput, DCMAOutput> {
  readonly engineId = "DCMA" as const;
  readonly version  = "1.0.0";

  validate(input: EngineInput): ValidationResult {
    const errors: string[] = [];
    if (!input.activities?.length)    errors.push("activities array is required");
    if (!input.project_finish_id)     errors.push("project_finish_id is required");
    if (!input.data_date)             errors.push("data_date is required");
    return { valid: errors.length === 0, errors };
  }

  async execute(input: EngineInput, ctx: ExecutionContext): Promise<DCMAOutput> {
    const t0 = Date.now();
    const thresholds: DCMAThresholds = {
      ...DEFAULT_DCMA_THRESHOLDS,
      ...input.options.dcma_thresholds,
    };

    // Run all 14 checks
    const checks: CheckResult[] = [
      checkLogic(input.activities, thresholds),
      checkLeads(input.activities, input.relationships, thresholds),
      checkLags(input.activities, input.relationships, thresholds),
      checkRelTypes(input.activities, input.relationships, thresholds),
      checkHardConstraints(input.activities, thresholds),
      checkHighFloat(input.activities, thresholds),
      checkNegativeFloat(input.activities, thresholds),
      checkHighDuration(input.activities, thresholds),
      checkInvalidDates(input.activities, input.data_date, thresholds),
      checkResources(input.activities, thresholds),
      checkMissedActivities(input.activities, input.data_date, thresholds),
      checkCriticalPathTest(input.activities, input.relationships, input.project_finish_id, thresholds),
      checkCPLI(input.activities, input.project_finish_id, thresholds),
      checkBEI(input.activities, input.data_date, thresholds),
    ];

    // Score: sum(weight × passRate) / maxPoints × 100
    // maxPoints = 4×3 + 5×2 + 5×1 = 27
    const maxPoints = checks.reduce((s, c) => s + c.severity_weight, 0);
    let earnedPoints = 0;
    const byCheck: Record<string, { pass_rate: number; weight: number; earned: number }> = {};

    for (const c of checks) {
      const earned = c.severity_weight * (c.pass_rate_pct / 100);
      earnedPoints += earned;
      byCheck[c.check_code] = {
        pass_rate: c.pass_rate_pct,
        weight:    c.severity_weight,
        earned:    parseFloat(earned.toFixed(3)),
      };
    }

    const score         = Math.round((earnedPoints / maxPoints) * 100);
    const overallPass   = checks.every((c) => c.status === "Pass" || c.status === "N/A");
    const criticalFails = checks
      .filter((c) => c.status === "Fail" && c.severity_weight === 3)
      .map((c) => c.check_code);

    // Flatten all issues
    const allIssues: ActivityIssue[] = checks.flatMap((c) => c.issues);

    // CPLI and BEI values for summary
    const cpliResult = checks.find((c) => c.check_code === "CPLI");
    const cpliVal = cpliResult?.issues[0]
      ? parseFloat((cpliResult.issues[0].evidence as { cpli?: number }).cpli?.toFixed(3) ?? "1.000")
      : 1.0;
    const beiResult = checks.find((c) => c.check_code === "BEI");
    const beiVal = beiResult
      ? parseFloat((beiResult.pass_rate_pct / 100).toFixed(3))
      : 1.0;

    // Risk contributions — each failing activity contributes proportionally
    const totalImpact = allIssues.reduce((s, i) => s + i.impact, 0) || 1;
    const riskMap = new Map<string, number>();
    for (const issue of allIssues) {
      riskMap.set(issue.activity_id, (riskMap.get(issue.activity_id) ?? 0) + issue.impact);
    }
    const riskContributions: RiskContribution[] = [];
    for (const [actId, impact] of riskMap) {
      const act = input.activities.find((a) => a.activity_id === actId);
      if (!act) continue;
      riskContributions.push({
        activity_id:      actId,
        name:             act.name,
        risk_factor:      "dcma_findings",
        contribution_pct: parseFloat(((impact / totalImpact) * 100).toFixed(1)),
        absolute_value:   allIssues
          .filter((i) => i.activity_id === actId)
          .reduce((s, i) => s + i.schedule_impact_days, 0),
        unit:             "days",
        direction:        "increases_risk",
        engine_id:        "DCMA",
      });
    }
    riskContributions.sort((a, b) => b.contribution_pct - a.contribution_pct);

    const failingChecks = checks.filter((c) => c.status === "Fail");
    const headline = overallPass
      ? `${score}/100 — All DCMA checks passing`
      : `${score}/100 — ${failingChecks.length} check${failingChecks.length !== 1 ? "s" : ""} failing` +
        (criticalFails.length ? ` (${criticalFails.join(", ")} critical)` : "");

    return {
      engine_id:   "DCMA",
      version:     this.version,
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
          { key: "dcma_score",         label: "DCMA Score",        value: score,                                      unit: "/100",       status: score >= 80 ? "ok" : score >= 60 ? "warn" : "critical", formula: "Σ(weight × passRate) / 27 × 100" },
          { key: "logic_pass_rate",    label: "Logic Check",       value: parseFloat((100 - (checks[0].failed_count / checks[0].total_applicable) * 100).toFixed(1)), unit: "%", status: checks[0].status === "Pass" ? "ok" : "critical", formula: "(Tasks with pred+succ) / total tasks × 100" },
          { key: "neg_float_count",    label: "Negative Float",    value: checks[6].failed_count,                     unit: "activities", status: checks[6].failed_count === 0 ? "ok" : "critical",       formula: "count(activities where total_float < 0)" },
          { key: "missed_activities",  label: "Missed Activities", value: checks[10].failed_count,                    unit: "activities", status: checks[10].status === "Pass" ? "ok" : checks[10].status === "Warning" ? "warn" : "critical", formula: "count(incomplete activities where planned_finish < data_date)" },
          { key: "cpli",               label: "CPLI",              value: cpliVal,                                    unit: "index",      status: cpliVal >= 0.95 ? "ok" : cpliVal >= 0.85 ? "warn" : "critical", formula: "(Total Float + Remaining Duration) / Remaining Duration" },
          { key: "bei",                label: "BEI",               value: beiVal,                                     unit: "index",      status: beiVal >= 0.95 ? "ok" : beiVal >= 0.85 ? "warn" : "critical", formula: "Completed Activities / Activities That Should Be Complete" },
        ],
        formula_inputs: { score, maxPoints, earnedPoints: parseFloat(earnedPoints.toFixed(2)), byCheck },
      },

      activity_issues:    allIssues,
      risk_contributions: riskContributions,

      detail: {
        check_results:    checks,
        overall_score:    score,
        overall_pass:     overallPass,
        critical_failures: criticalFails,
        cpli:             cpliVal,
        bei:              beiVal,
        total_activities: input.activities.length,
        score_breakdown:  { earned_points: parseFloat(earnedPoints.toFixed(2)), max_points: maxPoints, by_check: byCheck },
      },
    };
  }

  describe(): EngineDescriptor {
    return {
      engineId:    "DCMA",
      version:     this.version,
      name:        "DCMA 14-Point Schedule Assessment",
      description: "Validates schedule quality against the DCMA 14-point assessment framework. Flags logic gaps, constraint abuse, float anomalies, missed activities, and network integrity issues.",
      inputs:      ["activities", "relationships", "data_date", "project_finish_id"],
      outputs:     ["score/100", "14 check results", "per-activity findings", "CPLI", "BEI"],
    };
  }
}
