import type { IFrameworkEngine, EngineInput, EngineDescriptor } from "../core/interface";
import type { EngineOutput, ValidationResult, ExecutionContext, ActivityIssue, RiskContribution, ScheduleActivity, ActivityRelationship } from "../core/types";

export interface FloatRecord {
  activity_id:    string;
  external_id:    string;
  name:           string;
  wbs_code:       string;
  total_float:    number;
  free_float:     number;
  is_critical:    boolean;
  float_category: "Negative" | "Zero" | "Near-Critical" | "Normal" | "High";
  es: number; ef: number; ls: number; lf: number;
}

export interface CPMOutput extends EngineOutput {
  engine_id: "CPM";
  detail: {
    critical_path:             string[];        // activity_ids in order
    critical_path_duration:    number;          // working days
    project_finish_forecast:   string;          // ISO date
    finish_variance_days:      number;          // vs planned_finish (positive = late)
    cpli:                      number;
    float_records:             FloatRecord[];
    near_critical_count:       number;          // float 1–14 days
    negative_float_count:      number;
    open_ends:                 number;          // activities with no pred or no succ
    network_density:           number;          // relationships / activities
  };
}

// ─── Topological sort (Kahn's algorithm) ─────────────────────────────────────

function topoSort(
  activities: ScheduleActivity[],
  relationships: ActivityRelationship[],
): ScheduleActivity[] {
  const inDegree = new Map<string, number>(activities.map((a) => [a.activity_id, 0]));
  const succMap  = new Map<string, string[]>();

  for (const r of relationships) {
    inDegree.set(r.successor_id, (inDegree.get(r.successor_id) ?? 0) + 1);
    if (!succMap.has(r.predecessor_id)) succMap.set(r.predecessor_id, []);
    succMap.get(r.predecessor_id)!.push(r.successor_id);
  }

  const queue  = activities.filter((a) => (inDegree.get(a.activity_id) ?? 0) === 0);
  const sorted: ScheduleActivity[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const succId of succMap.get(node.activity_id) ?? []) {
      const deg = (inDegree.get(succId) ?? 1) - 1;
      inDegree.set(succId, deg);
      if (deg === 0) {
        const s = activities.find((a) => a.activity_id === succId);
        if (s) queue.push(s);
      }
    }
  }

  // If sorted < activities, there's a cycle — include remaining in order
  const sortedIds = new Set(sorted.map((a) => a.activity_id));
  for (const a of activities) {
    if (!sortedIds.has(a.activity_id)) sorted.push(a);
  }

  return sorted;
}

// ─── Forward pass: compute ES / EF ───────────────────────────────────────────

function forwardPass(
  sorted:        ScheduleActivity[],
  relationships: ActivityRelationship[],
): Map<string, { es: number; ef: number }> {
  const result = new Map<string, { es: number; ef: number }>();

  // Build predecessor index: successor → [{predecessor_id, type, lag}]
  const predIndex = new Map<string, { pred_id: string; type: string; lag: number }[]>();
  for (const r of relationships) {
    if (!predIndex.has(r.successor_id)) predIndex.set(r.successor_id, []);
    predIndex.get(r.successor_id)!.push({ pred_id: r.predecessor_id, type: r.type, lag: r.lag_days });
  }

  for (const a of sorted) {
    const preds = predIndex.get(a.activity_id) ?? [];
    let es = 0;

    for (const { pred_id, type, lag } of preds) {
      const pred = result.get(pred_id);
      if (!pred) continue;
      const dur = a.remaining_duration;
      let candidate: number;
      switch (type) {
        case "SS": candidate = pred.es + lag;         break;
        case "FF": candidate = pred.ef + lag - dur;   break;
        case "SF": candidate = pred.es + lag - dur;   break;
        default:   candidate = pred.ef + lag;         break; // FS
      }
      es = Math.max(es, candidate);
    }

    const ef = es + a.remaining_duration;
    result.set(a.activity_id, { es, ef });
  }

  return result;
}

// ─── Backward pass: compute LS / LF ─────────────────────────────────────────

function backwardPass(
  sorted:          ScheduleActivity[],
  relationships:   ActivityRelationship[],
  forward:         Map<string, { es: number; ef: number }>,
  projectDuration: number,
): Map<string, { ls: number; lf: number }> {
  const result = new Map<string, { ls: number; lf: number }>();

  const succIndex = new Map<string, { succ_id: string; type: string; lag: number }[]>();
  for (const r of relationships) {
    if (!succIndex.has(r.predecessor_id)) succIndex.set(r.predecessor_id, []);
    succIndex.get(r.predecessor_id)!.push({ succ_id: r.successor_id, type: r.type, lag: r.lag_days });
  }

  for (const a of [...sorted].reverse()) {
    const succs = succIndex.get(a.activity_id) ?? [];
    let lf = projectDuration;

    for (const { succ_id, type, lag } of succs) {
      const succ = result.get(succ_id);
      if (!succ) continue;
      const dur = a.remaining_duration;
      let candidate: number;
      switch (type) {
        case "SS": candidate = succ.ls - lag + dur;  break;
        case "FF": candidate = succ.lf - lag;        break;
        case "SF": candidate = succ.lf - lag + dur;  break;
        default:   candidate = succ.ls - lag;        break; // FS
      }
      lf = Math.min(lf, candidate);
    }

    const ls = lf - a.remaining_duration;
    result.set(a.activity_id, { ls, lf });
  }

  return result;
}

// ─── Add working days to a date ───────────────────────────────────────────────

function addWorkDays(startDate: string, days: number): string {
  const d = new Date(startDate);
  let added = 0;
  while (added < Math.abs(days)) {
    d.setDate(d.getDate() + (days >= 0 ? 1 : -1));
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day !== 5 && day !== 6) added++; // skip Fri/Sat for Gulf calendar
  }
  return d.toISOString().split("T")[0];
}

// ─── Engine class ─────────────────────────────────────────────────────────────

export class CPMEngine implements IFrameworkEngine<EngineInput, CPMOutput> {
  readonly engineId = "CPM" as const;
  readonly version  = "1.0.0";

  validate(input: EngineInput): ValidationResult {
    const errors: string[] = [];
    if (!input.activities?.length)  errors.push("activities array is required");
    if (!input.relationships)       errors.push("relationships array is required");
    if (!input.data_date)           errors.push("data_date is required");
    return { valid: errors.length === 0, errors };
  }

  // Also exposed as sync for Monte Carlo to call
  executeSync(input: EngineInput): CPMOutput {
    return this._compute(input, {
      execution_id: "sync", project_id: input.project_id,
      update_id: input.update_id, triggered_by: "internal", dry_run: true,
    });
  }

  async execute(input: EngineInput, ctx: ExecutionContext): Promise<CPMOutput> {
    return this._compute(input, ctx);
  }

  private _compute(input: EngineInput, ctx: ExecutionContext): CPMOutput {
    const t0 = Date.now();
    const { activities, relationships, planned_finish, data_date } = input;

    const sorted   = topoSort(activities, relationships);
    const forward  = forwardPass(sorted, relationships);

    // Project duration = max EF across all activities
    const projectDuration = Math.max(...[...forward.values()].map((v) => v.ef));
    const backward = backwardPass(sorted, relationships, forward, projectDuration);

    // Build successor index for free float
    const succIndex = new Map<string, string[]>();
    for (const r of relationships) {
      if (!succIndex.has(r.predecessor_id)) succIndex.set(r.predecessor_id, []);
      succIndex.get(r.predecessor_id)!.push(r.successor_id);
    }

    // Float per activity
    const floatRecords: FloatRecord[] = [];
    for (const a of activities) {
      const fwd  = forward.get(a.activity_id)  ?? { es: 0, ef: 0 };
      const bwd  = backward.get(a.activity_id) ?? { ls: 0, lf: 0 };
      const tf   = bwd.ls - fwd.es;
      const succs = succIndex.get(a.activity_id) ?? [];
      const ff = succs.length === 0
        ? tf
        : Math.min(...succs.map((sid) => (forward.get(sid)?.es ?? 0) - fwd.ef));

      const category =
        tf < 0             ? "Negative"
        : tf === 0         ? "Zero"
        : tf <= 14         ? "Near-Critical"
        : tf <= 44         ? "Normal"
        : "High";

      floatRecords.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code,
        total_float: tf, free_float: ff,
        is_critical: tf <= 0,
        float_category: category,
        es: fwd.es, ef: fwd.ef, ls: bwd.ls, lf: bwd.lf,
      });
    }

    // Critical path: activities with float ≤ 0 in topological order
    const criticalSet = new Set(floatRecords.filter((f) => f.is_critical).map((f) => f.activity_id));
    const criticalPath = sorted
      .filter((a) => criticalSet.has(a.activity_id))
      .map((a) => a.activity_id);

    // Project finish forecast
    const forecastFinish = addWorkDays(data_date, projectDuration);
    const finishVariance = Math.round(
      (new Date(forecastFinish).getTime() - new Date(planned_finish).getTime()) / 86_400_000
    );

    // CPLI
    const criticalActivities = activities.filter((a) => criticalSet.has(a.activity_id) && a.percent_complete < 100);
    const remainingDuration   = criticalActivities.reduce((s, a) => s + a.remaining_duration, 0);
    const projectFinishFloat  = floatRecords.find((f) => f.activity_id === input.project_finish_id)?.total_float ?? 0;
    const cpli = remainingDuration > 0 ? (projectFinishFloat + remainingDuration) / remainingDuration : 1;

    // Issues — activities with negative float
    const issues: ActivityIssue[] = floatRecords
      .filter((f) => f.total_float < 0)
      .map((f) => ({
        activity_id: f.activity_id, external_id: f.external_id,
        name: f.name, wbs_code: f.wbs_code, engine_id: "CPM" as const,
        issue_code:   "CPM_NEG_FLOAT",
        issue_type:   "Negative Float",
        severity:     "Critical" as const,
        impact:       Math.min(1, Math.abs(f.total_float) / 30),
        schedule_impact_days: Math.abs(f.total_float),
        cost_impact_aed: 0,
        description:  `${f.external_id} has ${f.total_float} days total float. Critical path already exceeded.`,
        evidence:     { total_float: f.total_float, es: f.es, ef: f.ef, ls: f.ls, lf: f.lf },
        recommended_action: "Compress remaining duration or re-sequence work to recover float.",
      }));

    // Near-critical issues
    floatRecords
      .filter((f) => f.total_float > 0 && f.total_float <= 14)
      .forEach((f) => issues.push({
        activity_id: f.activity_id, external_id: f.external_id,
        name: f.name, wbs_code: f.wbs_code, engine_id: "CPM" as const,
        issue_code:   "CPM_NEAR_CRITICAL",
        issue_type:   "Near-Critical Float",
        severity:     "High" as const,
        impact:       (14 - f.total_float) / 14 * 0.7,
        schedule_impact_days: 0,
        cost_impact_aed: 0,
        description:  `${f.external_id} has only ${f.total_float} days float — near-critical. Any further delay will push this onto the critical path.`,
        evidence:     { total_float: f.total_float },
        recommended_action: "Monitor closely. Build a float buffer through compression or resource augmentation.",
      }));

    // Risk contributions — proportion of critical path owned by each activity
    const totalCritDur = criticalActivities.reduce((s, a) => s + a.remaining_duration, 0) || 1;
    const riskContributions: RiskContribution[] = criticalActivities
      .sort((a, b) => b.remaining_duration - a.remaining_duration)
      .slice(0, 20)
      .map((a) => ({
        activity_id:      a.activity_id,
        name:             a.name,
        risk_factor:      "critical_path_duration",
        contribution_pct: parseFloat(((a.remaining_duration / totalCritDur) * 100).toFixed(1)),
        absolute_value:   a.remaining_duration,
        unit:             "days",
        direction:        "increases_risk" as const,
        engine_id:        "CPM" as const,
      }));

    const negCount  = floatRecords.filter((f) => f.total_float < 0).length;
    const nearCount = floatRecords.filter((f) => f.total_float > 0 && f.total_float <= 14).length;
    const score     = Math.max(0, Math.min(100,
      100 - (negCount * 10) - (nearCount * 3) - Math.max(0, finishVariance / 2)
    ));

    return {
      engine_id: "CPM", version: this.version,
      execution_id: ctx.execution_id, project_id: ctx.project_id,
      update_id: ctx.update_id, computed_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, status: "success",

      summary: {
        score: Math.round(score),
        pass:  finishVariance <= 0 && negCount === 0,
        headline: `${criticalPath.length} critical activities · ${finishVariance > 0 ? `+${finishVariance}d overrun` : "on time"} · CPLI ${cpli.toFixed(2)}`,
        key_metrics: [
          { key: "critical_path_count", label: "Critical Activities", value: criticalPath.length,   unit: "activities", status: negCount > 0 ? "critical" : "warn",  formula: "Activities where Total Float ≤ 0" },
          { key: "finish_variance",     label: "Finish Variance",     value: finishVariance,         unit: "days",       status: finishVariance <= 0 ? "ok" : finishVariance <= 30 ? "warn" : "critical", formula: "Forecast Finish − Planned Finish" },
          { key: "neg_float_count",     label: "Negative Float",      value: negCount,               unit: "activities", status: negCount === 0 ? "ok" : "critical", formula: "count(Total Float < 0)" },
          { key: "near_critical",       label: "Near-Critical",       value: nearCount,              unit: "activities", status: nearCount <= 5 ? "ok" : "warn",      formula: "count(0 < Total Float ≤ 14d)" },
          { key: "cpli",                label: "CPLI",                value: parseFloat(cpli.toFixed(3)), unit: "index",  status: cpli >= 0.95 ? "ok" : cpli >= 0.85 ? "warn" : "critical", formula: "(Float + Remaining Duration) / Remaining Duration" },
        ],
        formula_inputs: { projectDuration, cpli, negCount, nearCount, finishVariance },
      },

      activity_issues:    issues,
      risk_contributions: riskContributions,

      detail: {
        critical_path:           criticalPath,
        critical_path_duration:  projectDuration,
        project_finish_forecast: forecastFinish,
        finish_variance_days:    finishVariance,
        cpli:                    parseFloat(cpli.toFixed(4)),
        float_records:           floatRecords,
        near_critical_count:     nearCount,
        negative_float_count:    negCount,
        open_ends:               activities.filter((a) => !a.has_predecessor || !a.has_successor).length,
        network_density:         parseFloat((relationships.length / activities.length).toFixed(2)),
      },
    };
  }

  describe(): EngineDescriptor {
    return {
      engineId:    "CPM",
      version:     this.version,
      name:        "Critical Path Method",
      description: "Executes a full forward and backward pass to compute Early Start, Early Finish, Late Start, Late Finish, Total Float, and Free Float per activity. Identifies the critical path, CPLI, and float consumption trends.",
      inputs:      ["activities", "relationships", "data_date", "planned_finish"],
      outputs:     ["critical_path[]", "float per activity", "CPLI", "finish forecast", "near-critical warnings"],
    };
  }
}
