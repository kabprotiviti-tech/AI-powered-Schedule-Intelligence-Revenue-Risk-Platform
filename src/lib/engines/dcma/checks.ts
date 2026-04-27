/**
 * DCMA 14-Point Schedule Assessment — Check Functions
 *
 * Every check returns a CheckResult containing:
 *  - One ActivityIssue per VIOLATING ACTIVITY (never aggregate-only)
 *  - Rich evidence: exact field values that triggered the violation
 *  - Exact schedule_impact_days per activity
 *  - recommended_action with named responsible party where available
 */
import type {
  ScheduleActivity,
  ActivityRelationship,
  DCMAThresholds,
  ActivityIssue,
} from "../core/types";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface CheckResult {
  check_code:       string;
  check_name:       string;
  description:      string;       // what this check measures
  total_applicable: number;
  failed_count:     number;
  pass_rate_pct:    number;
  threshold_pct:    number;
  status:           "Pass" | "Fail" | "Warning" | "N/A";
  severity_weight:  3 | 2 | 1;   // Critical=3, High=2, Medium=1
  issues:           ActivityIssue[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const W = { Critical: 3 as const, High: 2 as const, Medium: 1 as const };

const HARD_CONSTRAINT_CODES = new Set(["MSO", "MFO", "FNET", "FNLT"]);
const CONSTRAINT_LABELS: Record<string, string> = {
  MSO:  "Must Start On",
  MFO:  "Must Finish On",
  FNET: "Finish No Earlier Than",
  FNLT: "Finish No Later Than",
  SNET: "Start No Earlier Than",
  SNLT: "Start No Later Than",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checkStatus(passRate: number, threshold: number): "Pass" | "Fail" | "Warning" {
  if (passRate >= 100 - threshold)        return "Pass";
  if (passRate >= 100 - threshold * 1.5)  return "Warning";
  return "Fail";
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function pct(failed: number, total: number): number {
  return total > 0 ? parseFloat(((failed / total) * 100).toFixed(2)) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1 — Missing Logic (Open Ends)
// Uses actual relationship data — NOT the has_predecessor/has_successor flags,
// which are patched by the adapter (every leaf gets a virtual finish link).
// Excludes: links from the virtual project-start and to the virtual project-finish.
// ─────────────────────────────────────────────────────────────────────────────

export function checkLogic(
  activities:      ScheduleActivity[],
  relationships:   ActivityRelationship[],
  projectStartId:  string,
  projectFinishId: string,
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");

  // Real predecessors: exclude links that originate from the virtual start milestone
  const realPredSet = new Set(
    relationships
      .filter((r) => r.predecessor_id !== projectStartId)
      .map((r) => r.successor_id),
  );

  // Real successors: exclude links that terminate at the virtual finish milestone
  const realSuccSet = new Set(
    relationships
      .filter((r) => r.successor_id !== projectFinishId)
      .map((r) => r.predecessor_id),
  );

  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    const hasPred = realPredSet.has(a.activity_id);
    const hasSucc = realSuccSet.has(a.activity_id);
    if (hasPred && hasSucc) continue;

    const missingDir = !hasPred && !hasSucc
      ? "predecessor and successor"
      : !hasPred ? "predecessor" : "successor";
    const openType  = !hasPred && !hasSucc ? "Both Ends Open"
                    : !hasPred             ? "Open Start"
                    :                        "Open End";

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           !hasPred && !hasSucc ? "DCMA_LOGIC_BOTH_OPEN"
                          : !hasPred             ? "DCMA_LOGIC_NO_PRED"
                          :                        "DCMA_LOGIC_NO_SUCC",
      issue_type:           `Missing Logic — ${openType}`,
      severity:             "Critical",
      impact:               !hasPred && !hasSucc ? 1.0 : 0.85,
      schedule_impact_days: Math.round(a.remaining_duration * 0.4),
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" is missing a ${missingDir} (${openType}). ` +
        `No real network links found outside the virtual start/finish milestones. ` +
        `CPM cannot compute float or critical path for this activity. ` +
        `WBS: ${a.wbs_code}. ` +
        `Remaining: ${a.remaining_duration}d at ${a.percent_complete}% complete. ` +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : "No responsible party assigned."),
      evidence: {
        has_real_predecessor:  hasPred,
        has_real_successor:    hasSucc,
        open_type:             openType,
        remaining_duration:    a.remaining_duration,
        percent_complete:      a.percent_complete,
        is_critical:           a.is_critical,
        planned_start:         a.planned_start,
        planned_finish:        a.planned_finish,
        responsible_party:     a.responsible_party,
      },
      recommended_action:
        `Add a logical ${missingDir} link to connect this activity to the network. ` +
        `Never substitute a date constraint for a missing logic link. ` +
        `If this is the first/last activity in a WBS section, link it to the section summary activity.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "LOGIC",
    check_name:       "Missing Logic (Open Ends)",
    description:      "Tasks with no real predecessor or no real successor in the network (virtual start/finish links excluded).",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.logic,
    status:           checkStatus(100 - failRate, t.logic),
    severity_weight:  W.Critical,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2 — Leads (Negative Lags)
// One issue per relationship with lag_days < 0.
// Records BOTH predecessor and successor for full context.
// ─────────────────────────────────────────────────────────────────────────────

export function checkLeads(
  activities:    ScheduleActivity[],
  relationships: ActivityRelationship[],
  t: DCMAThresholds,
): CheckResult {
  const actMap = new Map(activities.map((a) => [a.activity_id, a]));
  const issues: ActivityIssue[] = [];

  for (const r of relationships) {
    if (r.lag_days >= 0) continue;
    const pred = actMap.get(r.predecessor_id);
    const succ = actMap.get(r.successor_id);
    if (!pred) continue;

    const leadMagnitude = Math.abs(r.lag_days);

    issues.push({
      activity_id:          r.predecessor_id,
      external_id:          pred.external_id,
      name:                 pred.name,
      wbs_code:             pred.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_LEAD",
      issue_type:           "Lead (Negative Lag)",
      severity:             "High",
      impact:               Math.min(0.9, 0.5 + leadMagnitude / 30),
      schedule_impact_days: leadMagnitude,
      cost_impact_aed:      0,
      description:
        `Relationship ${pred.external_id} → ${succ?.external_id ?? r.successor_id} ` +
        `(${r.type}) has a ${r.lag_days}d lead. ` +
        `"${succ?.name ?? r.successor_id}" starts ${leadMagnitude} days BEFORE ` +
        `"${pred.name}" is logically complete. ` +
        `This artificially compresses the schedule, hides true float, and distorts the critical path. ` +
        (pred.is_critical || succ?.is_critical
          ? "⚠ One or both activities are on the critical path. "
          : "") +
        `Pred WBS: ${pred.wbs_code}. ` +
        (pred.responsible_party ? `Responsible: ${pred.responsible_party}.` : ""),
      evidence: {
        relationship_id:         r.relationship_id,
        rel_type:                r.type,
        lag_days:                r.lag_days,
        lead_magnitude_days:     leadMagnitude,
        predecessor_id:          r.predecessor_id,
        predecessor_name:        pred.name,
        predecessor_wbs:         pred.wbs_code,
        predecessor_is_critical: pred.is_critical,
        successor_id:            r.successor_id,
        successor_name:          succ?.name ?? "Unknown",
        successor_wbs:           succ?.wbs_code ?? "Unknown",
        successor_is_critical:   succ?.is_critical ?? false,
        responsible_party:       pred.responsible_party,
      },
      recommended_action:
        `Remove the ${leadMagnitude}-day lead. ` +
        `Split "${pred.name}" at the overlap point and create a separate activity ` +
        `for the overlapping scope, then link it FS to "${succ?.name ?? "successor"}". ` +
        `Each activity must represent discrete, non-overlapping scope.`,
    });
  }

  const failRate = pct(issues.length, relationships.length);
  return {
    check_code:       "LEADS",
    check_name:       "Leads (Negative Lags)",
    description:      "Relationships where lag_days < 0. Each lead compresses the schedule and hides true critical path logic.",
    total_applicable: relationships.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.leads,
    status:           checkStatus(100 - failRate, t.leads),
    severity_weight:  W.High,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3 — Lags (Positive)
// One issue per relationship with lag_days > 0.
// ─────────────────────────────────────────────────────────────────────────────

export function checkLags(
  activities:    ScheduleActivity[],
  relationships: ActivityRelationship[],
  t: DCMAThresholds,
): CheckResult {
  const actMap = new Map(activities.map((a) => [a.activity_id, a]));
  const issues: ActivityIssue[] = [];

  for (const r of relationships) {
    if (r.lag_days <= 0) continue;
    const pred = actMap.get(r.predecessor_id);
    const succ = actMap.get(r.successor_id);
    if (!pred) continue;

    issues.push({
      activity_id:          r.predecessor_id,
      external_id:          pred.external_id,
      name:                 pred.name,
      wbs_code:             pred.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_LAG",
      issue_type:           "Lag (Positive)",
      severity:             "Medium",
      impact:               Math.min(0.6, 0.3 + r.lag_days / 60),
      schedule_impact_days: r.lag_days,
      cost_impact_aed:      0,
      description:
        `Relationship ${pred.external_id} → ${succ?.external_id ?? r.successor_id} ` +
        `(${r.type}) has a +${r.lag_days}d lag. ` +
        `"${succ?.name ?? r.successor_id}" is delayed ${r.lag_days} days after "${pred.name}" finishes ` +
        `with no activity representing the work/wait that causes this delay. ` +
        `Positive lags mask missing scope in the WBS and make schedule recovery harder to model. ` +
        `Pred WBS: ${pred.wbs_code}. ` +
        (pred.responsible_party ? `Responsible: ${pred.responsible_party}.` : ""),
      evidence: {
        relationship_id:  r.relationship_id,
        rel_type:         r.type,
        lag_days:         r.lag_days,
        predecessor_id:   r.predecessor_id,
        predecessor_name: pred.name,
        successor_id:     r.successor_id,
        successor_name:   succ?.name ?? "Unknown",
        responsible_party: pred.responsible_party,
      },
      recommended_action:
        `Replace the ${r.lag_days}-day lag with a discrete "wait" or "cure time" activity. ` +
        `Link it FS from "${pred.name}" and FS to "${succ?.name ?? "successor"}". ` +
        `The wait activity must have a measurable completion criterion.`,
    });
  }

  const failRate = pct(issues.length, relationships.length);
  return {
    check_code:       "LAGS",
    check_name:       "Lags (Positive)",
    description:      "Relationships where lag_days > 0. Positive lags mask missing scope and hinder schedule compression analysis.",
    total_applicable: relationships.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.lags,
    status:           checkStatus(100 - failRate, t.lags),
    severity_weight:  W.Medium,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 4 — Non-FS Relationships
// One issue per non-FS relationship. SF flagged High (almost always an error).
// ─────────────────────────────────────────────────────────────────────────────

export function checkRelTypes(
  activities:    ScheduleActivity[],
  relationships: ActivityRelationship[],
  t: DCMAThresholds,
): CheckResult {
  const actMap = new Map(activities.map((a) => [a.activity_id, a]));
  const issues: ActivityIssue[] = [];

  const REL_DESC: Record<string, string> = {
    SS: "Start-to-Start: successor can start when predecessor starts",
    FF: "Finish-to-Finish: successor must finish when predecessor finishes",
    SF: "Start-to-Finish: almost always a modelling error — review immediately",
  };

  for (const r of relationships) {
    if (r.type === "FS") continue;
    const pred = actMap.get(r.predecessor_id);
    const succ = actMap.get(r.successor_id);
    if (!pred) continue;

    const isCriticalPair = (pred.is_critical ?? false) || (succ?.is_critical ?? false);
    const isSF = r.type === "SF";

    issues.push({
      activity_id:          r.predecessor_id,
      external_id:          pred.external_id,
      name:                 pred.name,
      wbs_code:             pred.wbs_code,
      engine_id:            "DCMA",
      issue_code:           `DCMA_REL_${r.type}`,
      issue_type:           `Non-FS Relationship (${r.type})`,
      severity:             isSF ? "High" : "Medium",
      impact:               isSF ? 0.6 : isCriticalPair ? 0.5 : 0.3,
      schedule_impact_days: 0,
      cost_impact_aed:      0,
      description:
        `Relationship ${pred.external_id} → ${succ?.external_id ?? r.successor_id}: ` +
        `${REL_DESC[r.type] ?? r.type}. ` +
        (r.lag_days !== 0 ? `Lag: ${r.lag_days}d. ` : "") +
        (isCriticalPair ? "⚠ One or both activities are on the critical path. " : "") +
        `Non-FS relationships require specific written justification — without it they are likely modelling shortcuts. ` +
        `Pred WBS: ${pred.wbs_code}.`,
      evidence: {
        relationship_id:         r.relationship_id,
        rel_type:                r.type,
        lag_days:                r.lag_days,
        predecessor_id:          r.predecessor_id,
        predecessor_name:        pred.name,
        predecessor_wbs:         pred.wbs_code,
        predecessor_is_critical: pred.is_critical,
        successor_id:            r.successor_id,
        successor_name:          succ?.name ?? "Unknown",
        successor_is_critical:   succ?.is_critical ?? false,
        on_critical_path_pair:   isCriticalPair,
      },
      recommended_action: isSF
        ? `Replace SF relationship with FS immediately. ` +
          `SF (Start-to-Finish) is almost always a modelling error. ` +
          `Discuss intent with the scheduler and restructure logic.`
        : `Verify ${r.type} relationship is intentional. ` +
          `Document justification in the schedule basis. ` +
          `Consider replacing with FS + discrete overlap activity for full transparency.`,
    });
  }

  const failRate = pct(issues.length, relationships.length);
  return {
    check_code:       "REL_TYPES",
    check_name:       "Non-FS Relationships",
    description:      "Relationships using SS, FF, or SF types. Non-FS relationships require specific justification; SF is almost always an error.",
    total_applicable: relationships.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.rel_types,
    status:           checkStatus(100 - failRate, t.rel_types),
    severity_weight:  W.Medium,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 5 — Hard Constraints
// One issue per task with a hard constraint type.
// ─────────────────────────────────────────────────────────────────────────────

export function checkHardConstraints(
  activities: ScheduleActivity[],
  dataDate:   string,
  t: DCMAThresholds,
): CheckResult {
  const tasks  = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (!a.constraint_type || !HARD_CONSTRAINT_CODES.has(a.constraint_type)) continue;

    const label = CONSTRAINT_LABELS[a.constraint_type] ?? a.constraint_type;
    const daysFromNow = a.constraint_date ? daysBetween(dataDate, a.constraint_date) : null;
    const constraintStatus =
      daysFromNow === null ? "date unspecified"
      : daysFromNow > 0   ? `${daysFromNow}d from now (${a.constraint_date})`
      :                      `${Math.abs(daysFromNow)}d ago (${a.constraint_date}) — PAST`;

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           `DCMA_HC_${a.constraint_type}`,
      issue_type:           `Hard Constraint (${a.constraint_type})`,
      severity:             "High",
      impact:               0.6,
      schedule_impact_days: 0,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has a hard constraint: ${label} = ${constraintStatus}. ` +
        `Hard constraints override CPM logic — the scheduler cannot move this activity even when network logic permits. ` +
        `This can hide float errors and prevents accurate schedule analysis. ` +
        `Float: ${a.total_float ?? "not computed"}d. ` +
        (a.is_critical ? "⚠ On critical path. " : "") +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : ""),
      evidence: {
        constraint_type:      a.constraint_type,
        constraint_label:     label,
        constraint_date:      a.constraint_date,
        days_from_data_date:  daysFromNow,
        constraint_in_past:   daysFromNow !== null && daysFromNow < 0,
        total_float:          a.total_float,
        is_critical:          a.is_critical,
        planned_start:        a.planned_start,
        planned_finish:       a.planned_finish,
        responsible_party:    a.responsible_party,
      },
      recommended_action:
        `Remove the ${a.constraint_type} constraint. ` +
        `Replace with logical predecessor relationships that drive the same date. ` +
        `Exception: if the constraint date is contractually mandated, retain it with a ` +
        `documented reference to the specific contract clause or regulatory requirement.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "HARD_CONST",
    check_name:       "Hard Constraints",
    description:      "Tasks with constraint types MSO, MFO, FNET, or FNLT. These override CPM logic and can hide float errors.",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.hard_constraints,
    status:           checkStatus(100 - failRate, t.hard_constraints),
    severity_weight:  W.High,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 6 — High Float (> threshold working days)
// One issue per task. Severity scales with how far above threshold.
// ─────────────────────────────────────────────────────────────────────────────

export function checkHighFloat(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter(
    (a) => a.activity_type === "Task" && a.total_float !== null,
  );
  const issues: ActivityIssue[] = [];

  const maxFloat = tasks.reduce((m, a) => Math.max(m, a.total_float ?? 0), 0);

  for (const a of tasks) {
    const tf = a.total_float ?? 0;
    if (tf <= t.high_float_days) continue;

    const excess = tf - t.high_float_days;
    const severity: "High" | "Medium" = excess > t.high_float_days * 2 ? "High" : "Medium";

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_HIGH_FLOAT",
      issue_type:           "High Total Float",
      severity,
      impact:               parseFloat(Math.min(0.8, 0.25 + (excess / Math.max(1, maxFloat)) * 0.55).toFixed(3)),
      schedule_impact_days: 0,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has ${tf}d total float — ` +
        `${excess}d above the ${t.high_float_days}d threshold. ` +
        `Free float: ${a.free_float ?? "n/a"}d. ` +
        `Status: ${a.status} at ${a.percent_complete}% complete. ` +
        `Abnormally high float almost always indicates a missing successor, ` +
        `a disconnected sub-network, or logic that has been deleted during schedule updates. ` +
        `WBS: ${a.wbs_code}. ` +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : ""),
      evidence: {
        total_float:        tf,
        free_float:         a.free_float,
        threshold_days:     t.high_float_days,
        excess_days:        excess,
        pct_above_threshold: parseFloat(((excess / t.high_float_days) * 100).toFixed(1)),
        status:             a.status,
        percent_complete:   a.percent_complete,
        planned_start:      a.planned_start,
        planned_finish:     a.planned_finish,
        forecast_finish:    a.forecast_finish,
        responsible_party:  a.responsible_party,
      },
      recommended_action:
        `Audit successor logic for "${a.name}". ` +
        `Check whether this activity was recently re-sequenced and lost its downstream links. ` +
        `If float is genuine (parallel path), document justification in the schedule basis narrative.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "HIGH_FLOAT",
    check_name:       `High Total Float (> ${t.high_float_days}d)`,
    description:      `Tasks with total float exceeding ${t.high_float_days} working days. Likely indicates missing successor logic or disconnected network.`,
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.high_float,
    status:           checkStatus(100 - failRate, t.high_float),
    severity_weight:  W.Medium,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 7 — Negative Float
// One issue per task. Sorted worst-first. Severity: < -14d = Critical.
// ─────────────────────────────────────────────────────────────────────────────

export function checkNegativeFloat(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter(
    (a) => a.activity_type === "Task" && a.total_float !== null,
  );

  const negTasks = tasks
    .filter((a) => (a.total_float ?? 0) < 0)
    .sort((a, b) => (a.total_float ?? 0) - (b.total_float ?? 0)); // worst first

  const worstFloat = negTasks[0]?.total_float ?? -1;
  const issues: ActivityIssue[] = [];

  for (const a of negTasks) {
    const tf         = a.total_float ?? 0;
    const overrunDays = Math.abs(tf);

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_NEG_FLOAT",
      issue_type:           "Negative Float",
      severity:             tf < -14 ? "Critical" : "High",
      impact:               parseFloat(Math.min(1.0, 0.7 + (overrunDays / Math.max(1, Math.abs(worstFloat))) * 0.3).toFixed(3)),
      schedule_impact_days: overrunDays,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has ${tf}d total float. ` +
        `Project finish date is already exceeded by ${overrunDays} days relative to this activity's baseline. ` +
        `${a.is_critical ? "⚠ ON CRITICAL PATH — overrun propagates directly to project completion. " : ""}` +
        `${a.percent_complete}% complete, ${a.remaining_duration}d remaining. ` +
        `Forecast finish: ${a.forecast_finish}. ` +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : "No responsible party assigned."),
      evidence: {
        total_float:        tf,
        overrun_days:       overrunDays,
        is_critical:        a.is_critical,
        percent_complete:   a.percent_complete,
        remaining_duration: a.remaining_duration,
        planned_finish:     a.planned_finish,
        forecast_finish:    a.forecast_finish,
        planned_start:      a.planned_start,
        status:             a.status,
        responsible_party:  a.responsible_party,
      },
      recommended_action:
        `Immediate action required for ${overrunDays}d overrun. ` +
        `Options: (1) add resources to compress remaining ${a.remaining_duration}d duration, ` +
        `(2) re-sequence parallel activities to run concurrently, ` +
        `(3) invoke acceleration clause with ${a.responsible_party ?? "contractor"}. ` +
        `Submit formal recovery programme to PMO within 5 working days.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "NEG_FLOAT",
    check_name:       "Negative Float",
    description:      "Tasks where total float < 0, meaning the planned completion date has already been exceeded.",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.neg_float,
    status:           issues.length === 0 ? "Pass" : "Fail",
    severity_weight:  W.Critical,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 8 — High Duration (> threshold working days)
// One issue per task. Includes decomposition guidance.
// ─────────────────────────────────────────────────────────────────────────────

export function checkHighDuration(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks   = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  const maxDur = tasks.reduce((m, a) => Math.max(m, a.planned_duration), 0);

  for (const a of tasks) {
    if (a.planned_duration <= t.high_duration_days) continue;

    const excess = a.planned_duration - t.high_duration_days;
    const targetSubActivities = Math.ceil(a.planned_duration / t.high_duration_days);

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_HIGH_DUR",
      issue_type:           "High Duration",
      severity:             a.planned_duration > t.high_duration_days * 2 ? "High" : "Medium",
      impact:               parseFloat(Math.min(0.7, 0.25 + (excess / Math.max(1, maxDur)) * 0.45).toFixed(3)),
      schedule_impact_days: 0,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has a ${a.planned_duration}d planned duration — ` +
        `${excess}d above the ${t.high_duration_days}d threshold. ` +
        `Remaining: ${a.remaining_duration}d at ${a.percent_complete}% complete. ` +
        `${a.is_critical ? "⚠ On critical path. " : ""}` +
        `High-duration activities hide delays until the activity is nearly finished, ` +
        `eliminating early warning capability. ` +
        `WBS: ${a.wbs_code}. ` +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : ""),
      evidence: {
        planned_duration:    a.planned_duration,
        remaining_duration:  a.remaining_duration,
        threshold_days:      t.high_duration_days,
        excess_days:         excess,
        percent_complete:    a.percent_complete,
        is_critical:         a.is_critical,
        target_sub_activities: targetSubActivities,
        responsible_party:   a.responsible_party,
      },
      recommended_action:
        `Decompose "${a.name}" into ${targetSubActivities} work packages of ` +
        `≤${t.high_duration_days}d each, each with a measurable completion criterion. ` +
        `For activities on the critical path, decomposition is mandatory — ` +
        `it enables early detection of delay and faster recovery intervention.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "HIGH_DUR",
    check_name:       `High Duration (> ${t.high_duration_days}d)`,
    description:      `Tasks with planned duration exceeding ${t.high_duration_days} working days. These obscure progress and delay risk detection.`,
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.high_duration,
    status:           checkStatus(100 - failRate, t.high_duration),
    severity_weight:  W.Medium,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 9 — Invalid Dates
// Detects up to 4 distinct date violations per activity.
// One issue per activity that has any violation (lists all violations found).
// ─────────────────────────────────────────────────────────────────────────────

export function checkInvalidDates(
  activities: ScheduleActivity[],
  dataDate:   string,
  t: DCMAThresholds,
): CheckResult {
  const tasks  = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    const violations: { code: string; detail: string }[] = [];
    const evidence: Record<string, unknown> = {
      planned_start:    a.planned_start,
      planned_finish:   a.planned_finish,
      actual_start:     a.actual_start,
      forecast_finish:  a.forecast_finish,
      data_date:        dataDate,
      percent_complete: a.percent_complete,
    };

    // V1: planned start after planned finish
    if (daysBetween(a.planned_start, a.planned_finish) < 0) {
      violations.push({
        code:   "START_AFTER_FINISH",
        detail: `Planned start (${a.planned_start}) is after planned finish (${a.planned_finish})`,
      });
      evidence["v1_start_after_finish"] = true;
    }

    // V2: actual start recorded in the future
    if (a.actual_start && daysBetween(dataDate, a.actual_start) > 0) {
      violations.push({
        code:   "ACTUAL_IN_FUTURE",
        detail: `Actual start (${a.actual_start}) is after data date (${dataDate})`,
      });
      evidence["v2_actual_start_future"] = true;
    }

    // V3: forecast finish in past but activity not 100% complete
    const staleDays = daysBetween(a.forecast_finish, dataDate);
    if (staleDays > 0 && a.percent_complete < 100) {
      violations.push({
        code:   "STALE_FORECAST",
        detail: `Forecast finish (${a.forecast_finish}) is ${staleDays}d in the past but only ${a.percent_complete}% complete`,
      });
      evidence["v3_stale_forecast_days"] = staleDays;
    }

    // V4: forecast finish before planned start
    if (daysBetween(a.planned_start, a.forecast_finish) < 0) {
      violations.push({
        code:   "FORECAST_BEFORE_START",
        detail: `Forecast finish (${a.forecast_finish}) precedes planned start (${a.planned_start})`,
      });
      evidence["v4_forecast_before_start"] = true;
    }

    if (violations.length === 0) continue;

    const staleImpact = typeof evidence["v3_stale_forecast_days"] === "number"
      ? (evidence["v3_stale_forecast_days"] as number)
      : 0;

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           `DCMA_DATES_${violations.map((v) => v.code).join("_")}`,
      issue_type:           `Invalid Date${violations.length > 1 ? "s" : ""} (${violations.length} violation${violations.length > 1 ? "s" : ""})`,
      severity:             "Critical",
      impact:               Math.min(1.0, 0.7 + violations.length * 0.1),
      schedule_impact_days: staleImpact,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has ${violations.length} date violation${violations.length > 1 ? "s" : ""}: ` +
        violations.map((v, i) => `(${i + 1}) ${v.detail}`).join("; ") + ". " +
        `Date errors corrupt CPM calculations, invalidate EVM figures, and produce unreliable forecasts. ` +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : ""),
      evidence: { ...evidence, violation_codes: violations.map((v) => v.code) },
      recommended_action:
        `Correct all date errors in the source scheduling tool before the next update submission. ` +
        `Violations: ${violations.map((v) => v.detail).join(" | ")}`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "INVALID_DATES",
    check_name:       "Invalid Dates",
    description:      "Tasks with date logic errors: start after finish, actual in future, stale forecast, or forecast before start.",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.invalid_dates,
    status:           issues.length === 0 ? "Pass" : "Fail",
    severity_weight:  W.Critical,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 10 — Missing Resource Assignments
// One issue per unloaded task.
// ─────────────────────────────────────────────────────────────────────────────

export function checkResources(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks  = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (a.resource_assigned) continue;

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_NO_RESOURCE",
      issue_type:           "Missing Resource Assignment",
      severity:             a.is_critical ? "High" : "Medium",
      impact:               a.is_critical ? 0.45 : 0.3,
      schedule_impact_days: 0,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has no resource assignment. ` +
        `Duration: ${a.planned_duration}d, ${a.percent_complete}% complete, status: ${a.status}. ` +
        `${a.is_critical ? "⚠ On critical path — unloaded critical activities produce unreliable EAC forecasts. " : ""}` +
        `Unloaded activities prevent accurate EVM reporting and resource capacity planning. ` +
        (a.responsible_party
          ? `${a.responsible_party} should confirm resource allocation.`
          : "No responsible party assigned."),
      evidence: {
        resource_assigned:  false,
        planned_duration:   a.planned_duration,
        remaining_duration: a.remaining_duration,
        percent_complete:   a.percent_complete,
        status:             a.status,
        is_critical:        a.is_critical,
        responsible_party:  a.responsible_party,
        wbs_code:           a.wbs_code,
      },
      recommended_action:
        `Assign at least one resource type (Labour, Equipment, or Subcontractor) in the scheduling tool. ` +
        `Resource loading is mandatory for EVM progress measurement. ` +
        `${a.responsible_party ? `Contact ${a.responsible_party} to confirm allocation.` : "Assign a responsible party first."}`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "RESOURCES",
    check_name:       "Missing Resource Assignments",
    description:      "Tasks with no resource assigned. Prevents accurate EVM reporting and resource capacity planning.",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.resources,
    status:           checkStatus(100 - failRate, t.resources),
    severity_weight:  W.Medium,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 11 — Missed Activities (Past Due, Incomplete)
// One issue PER OVERDUE ACTIVITY — never an aggregate.
// Sorted by most overdue first. Severity scales with overdue days.
// ─────────────────────────────────────────────────────────────────────────────

export function checkMissedActivities(
  activities: ScheduleActivity[],
  dataDate:   string,
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  const overdueList = tasks
    .map((a) => ({ a, overdueDays: daysBetween(a.planned_finish, dataDate) }))
    .filter(({ a, overdueDays }) => overdueDays > 0 && a.percent_complete < 100 && !a.actual_finish)
    .sort((x, y) => y.overdueDays - x.overdueDays); // worst first

  for (const { a, overdueDays } of overdueList) {
    const progressGap   = 100 - a.percent_complete;
    const projectedSlip = overdueDays + a.remaining_duration;

    const severity: "Critical" | "High" | "Medium" =
      (overdueDays > 30 || a.is_critical) ? "Critical"
      : overdueDays > 14                  ? "High"
      :                                     "Medium";

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_MISSED_ACTIVITY",
      issue_type:           "Missed Activity (Past Due)",
      severity,
      impact:               parseFloat(Math.min(1.0, 0.4 + (overdueDays / 90) * 0.6).toFixed(3)),
      schedule_impact_days: projectedSlip,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" is ${overdueDays}d overdue. ` +
        `Planned finish: ${a.planned_finish}. Only ${a.percent_complete}% complete ` +
        `(${progressGap}% remaining work = ${a.remaining_duration}d). ` +
        `Forecast finish: ${a.forecast_finish}. ` +
        `Total projected slip (overdue + remaining): ${projectedSlip}d. ` +
        `${a.is_critical ? "⚠ CRITICAL PATH — this delay propagates directly to project completion. " : ""}` +
        (a.responsible_party
          ? `Contractor/responsible party: ${a.responsible_party}.`
          : "No responsible party assigned — assign immediately."),
      evidence: {
        planned_finish:        a.planned_finish,
        forecast_finish:       a.forecast_finish,
        data_date:             dataDate,
        overdue_days:          overdueDays,
        percent_complete:      a.percent_complete,
        progress_gap_pct:      progressGap,
        remaining_duration:    a.remaining_duration,
        projected_total_slip:  projectedSlip,
        is_critical:           a.is_critical,
        total_float:           a.total_float,
        status:                a.status,
        responsible_party:     a.responsible_party,
      },
      recommended_action:
        `Issue formal delay notice to ${a.responsible_party ?? "contractor"} for "${a.name}". ` +
        `Require a ${overdueDays > 14 ? "formal recovery programme" : "revised completion plan"} ` +
        `within 5 working days showing recovery of the ${overdueDays}d overrun. ` +
        (a.is_critical
          ? "Invoke acceleration clause immediately — critical path impact affects project completion date. "
          : "") +
        `Update forecast finish date in the schedule to reflect current reality.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "MISSED_ACT",
    check_name:       "Missed Activities (Past Due)",
    description:      "Tasks whose planned finish has passed but are not 100% complete. One violation record per overdue activity.",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    t.missed_activities,
    status:           checkStatus(100 - failRate, t.missed_activities),
    severity_weight:  W.High,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 12 — Critical Path Test (Network Integrity)
// BFS backwards from project finish to find unreachable activities.
// One issue per task with no path to project finish.
// ─────────────────────────────────────────────────────────────────────────────

export function checkCriticalPathTest(
  activities:      ScheduleActivity[],
  relationships:   ActivityRelationship[],
  projectFinishId: string,
  t: DCMAThresholds,
): CheckResult {
  // Build predecessor map (reverse graph) for BFS from finish
  const predMap = new Map<string, string[]>();
  const succMap = new Map<string, string[]>();
  for (const r of relationships) {
    if (!predMap.has(r.successor_id))   predMap.set(r.successor_id,   []);
    if (!succMap.has(r.predecessor_id)) succMap.set(r.predecessor_id, []);
    predMap.get(r.successor_id)!.push(r.predecessor_id);
    succMap.get(r.predecessor_id)!.push(r.successor_id);
  }

  // BFS backwards from project finish — find all activities that CAN reach finish
  const reachable = new Set<string>();
  const queue: string[] = [projectFinishId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const pred of predMap.get(id) ?? []) queue.push(pred);
  }

  const tasks  = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (reachable.has(a.activity_id)) continue;

    const predCount = (predMap.get(a.activity_id) ?? []).length;
    const succCount = (succMap.get(a.activity_id) ?? []).length;
    const isIsland  = predCount === 0 && succCount === 0;

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           isIsland ? "DCMA_CP_ISLAND" : "DCMA_CP_OPEN_END",
      issue_type:           isIsland ? "Network Island (Zero Connections)" : "Critical Path Open End",
      severity:             "Critical",
      impact:               isIsland ? 1.0 : 0.9,
      schedule_impact_days: a.remaining_duration,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" has no path to project finish (${projectFinishId}). ` +
        (isIsland
          ? `This activity has ZERO network connections — it is a completely isolated island. `
          : `Network connections exist (${predCount} predecessor(s), ${succCount} successor(s)) but they do not lead to project finish. `) +
        `This activity is invisible to CPM analysis — its delays will NEVER surface in schedule reporting. ` +
        `Remaining: ${a.remaining_duration}d, ${a.percent_complete}% complete. ` +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : ""),
      evidence: {
        project_finish_id:   projectFinishId,
        predecessor_count:   predCount,
        successor_count:     succCount,
        is_completely_isolated: isIsland,
        remaining_duration:  a.remaining_duration,
        percent_complete:    a.percent_complete,
        status:              a.status,
        responsible_party:   a.responsible_party,
      },
      recommended_action:
        isIsland
          ? `Connect "${a.name}" to the network immediately with both a predecessor and a successor. ` +
            `If this is orphaned scope, confirm with PMO whether it belongs in this project.`
          : `Trace the successor chain from "${a.name}" and identify where the path terminates without reaching project finish. ` +
            `Add the missing successor link to reconnect this branch to the main network.`,
    });
  }

  const failRate = pct(issues.length, tasks.length);
  return {
    check_code:       "CP_TEST",
    check_name:       "Critical Path Test (Network Integrity)",
    description:      "Tasks with no forward path to the project finish milestone. These are invisible to CPM and their delays never surface in reports.",
    total_applicable: tasks.length,
    failed_count:     issues.length,
    pass_rate_pct:    100 - failRate,
    threshold_pct:    0,
    status:           issues.length === 0 ? "Pass" : "Fail",
    severity_weight:  W.Critical,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 13 — CPLI (Critical Path Length Index)
// Generates:
//   (1) Project-level CPLI summary issue (if failing)
//   (2) One issue per critical activity with zero or negative float
// ─────────────────────────────────────────────────────────────────────────────

export function checkCPLI(
  activities:      ScheduleActivity[],
  projectFinishId: string,
  t: DCMAThresholds,
): CheckResult {
  const projectFinish = activities.find((a) => a.activity_id === projectFinishId);
  const criticals = activities.filter(
    (a) => a.is_critical && a.percent_complete < 100 && a.activity_type === "Task",
  );

  if (!projectFinish || criticals.length === 0) {
    return {
      check_code: "CPLI", check_name: "Critical Path Length Index (CPLI)",
      description: "CPLI = (Project Float + Total Critical Remaining) / Total Critical Remaining. Threshold ≥ 0.95.",
      total_applicable: 0, failed_count: 0, pass_rate_pct: 100,
      threshold_pct: t.cpli_min * 100, status: "N/A",
      severity_weight: W.High, issues: [],
    };
  }

  const totalRemaining  = criticals.reduce((s, a) => s + a.remaining_duration, 0);
  const projectFloat    = projectFinish.total_float ?? 0;
  const cpli            = totalRemaining > 0
    ? (projectFloat + totalRemaining) / totalRemaining
    : 1.0;
  const cpliPass = cpli >= t.cpli_min;

  const issues: ActivityIssue[] = [];

  // (1) Project-level CPLI issue — always generated if failing
  if (!cpliPass) {
    const recoveryDays = Math.round(Math.max(0, (t.cpli_min - cpli) * totalRemaining));
    issues.push({
      activity_id:          projectFinishId,
      external_id:          "CPLI_PROJECT",
      name:                 "Project Finish — CPLI",
      wbs_code:             "0.0",
      engine_id:            "DCMA",
      issue_code:           "DCMA_CPLI_LOW",
      issue_type:           "Low CPLI (Project)",
      severity:             cpli < 0.85 ? "Critical" : "High",
      impact:               parseFloat(Math.max(0, 1 - cpli).toFixed(3)),
      schedule_impact_days: recoveryDays,
      cost_impact_aed:      0,
      description:
        `Project CPLI = ${cpli.toFixed(3)} (threshold ≥ ${t.cpli_min}). ` +
        `Formula: (${projectFloat}d project float + ${totalRemaining}d total critical remaining) ` +
        `/ ${totalRemaining}d = ${cpli.toFixed(3)}. ` +
        `${criticals.length} critical activities remain with ${totalRemaining}d of work. ` +
        `Any further slip on the critical path will directly delay project completion — ` +
        `there is insufficient float buffer. ` +
        `Recovery required: ${recoveryDays}d of schedule acceleration to reach CPLI ${t.cpli_min}.`,
      evidence: {
        cpli,
        project_float:             projectFloat,
        total_critical_remaining:  totalRemaining,
        critical_activity_count:   criticals.length,
        threshold:                 t.cpli_min,
        recovery_days_needed:      recoveryDays,
        formula: "(Project Float + Total Critical Remaining) / Total Critical Remaining",
      },
      recommended_action:
        `Accelerate ${recoveryDays}d of schedule recovery across critical activities. ` +
        `Review the per-activity critical path issues below for specific acceleration targets. ` +
        `Options: parallel working, additional resources, or scope re-sequencing.`,
    });
  }

  // (2) Per critical-activity issues — activities with zero or negative float
  const critAtRisk = criticals
    .filter((a) => (a.total_float ?? 0) <= 0)
    .sort((a, b) => (a.total_float ?? 0) - (b.total_float ?? 0)); // worst first

  for (const a of critAtRisk) {
    const tf = a.total_float ?? 0;
    const contributionPct = totalRemaining > 0
      ? parseFloat(((a.remaining_duration / totalRemaining) * 100).toFixed(1))
      : 0;

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           tf < 0 ? "DCMA_CPLI_NEG_FLOAT_CRITICAL" : "DCMA_CPLI_ZERO_FLOAT",
      issue_type:           `Critical Path Activity — ${tf < 0 ? "Negative" : "Zero"} Float`,
      severity:             tf < 0 ? "Critical" : "High",
      impact:               tf < 0 ? 0.95 : 0.75,
      schedule_impact_days: Math.abs(tf) + a.remaining_duration,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" is a critical path activity with ${tf}d float. ` +
        `Remaining: ${a.remaining_duration}d (${a.percent_complete}% complete). ` +
        `CPLI contribution: ${contributionPct}% of total critical remaining work ` +
        `(${a.remaining_duration}d of ${totalRemaining}d). ` +
        (tf < 0
          ? `NEGATIVE FLOAT — this activity has already exceeded its baseline by ${Math.abs(tf)} days. `
          : `Zero float — any delay here delays project completion with no buffer. `) +
        (a.responsible_party ? `Responsible: ${a.responsible_party}.` : ""),
      evidence: {
        total_float:              tf,
        remaining_duration:       a.remaining_duration,
        percent_complete:         a.percent_complete,
        cpli_contribution_pct:    contributionPct,
        total_critical_remaining: totalRemaining,
        project_cpli:             parseFloat(cpli.toFixed(4)),
        planned_finish:           a.planned_finish,
        forecast_finish:          a.forecast_finish,
        responsible_party:        a.responsible_party,
      },
      recommended_action:
        tf < 0
          ? `Priority recovery target — eliminate ${Math.abs(tf)}d negative float first, ` +
            `then build schedule buffer. Accelerate with ${a.responsible_party ?? "contractor"}.`
          : `Monitor daily. Add schedule contingency by accelerating this activity. ` +
            `Any resource issue or scope addition here directly delays project completion.`,
    });
  }

  const totalApplicable = 1 + critAtRisk.length;
  return {
    check_code:       "CPLI",
    check_name:       "Critical Path Length Index (CPLI)",
    description:      "CPLI = (Project Float + Total Critical Remaining) / Total Critical Remaining. Values below 0.95 indicate insufficient schedule buffer.",
    total_applicable: totalApplicable,
    failed_count:     issues.length,
    pass_rate_pct:    cpliPass ? 100 : Math.max(0, Math.round((cpli / t.cpli_min) * 100)),
    threshold_pct:    t.cpli_min * 100,
    status:           cpliPass ? "Pass" : (cpli >= 0.85 ? "Warning" : "Fail"),
    severity_weight:  W.High,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 14 — BEI (Baseline Execution Index)
// ONE ISSUE PER OVERDUE INCOMPLETE ACTIVITY — never an aggregate.
// Sorted by most overdue first. Severity: > 30d or critical = Critical.
// ─────────────────────────────────────────────────────────────────────────────

export function checkBEI(
  activities: ScheduleActivity[],
  dataDate:   string,
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");

  const shouldBeComplete = tasks.filter(
    (a) => daysBetween(a.planned_finish, dataDate) >= 0,
  );
  const isComplete  = shouldBeComplete.filter((a) => a.percent_complete >= 100);
  const incomplete  = shouldBeComplete.filter((a) => a.percent_complete < 100);

  if (shouldBeComplete.length === 0) {
    return {
      check_code: "BEI", check_name: "Baseline Execution Index (BEI)",
      description: "BEI = completed activities / activities that should be complete by data date. Threshold ≥ 0.95.",
      total_applicable: 0, failed_count: 0, pass_rate_pct: 100,
      threshold_pct: t.bei_min * 100, status: "N/A",
      severity_weight: W.High, issues: [],
    };
  }

  const bei    = isComplete.length / shouldBeComplete.length;
  const issues: ActivityIssue[] = [];

  // Sort by most overdue first (worst visibility risk first)
  const sorted = [...incomplete].sort((a, b) => {
    const dA = daysBetween(a.planned_finish, dataDate);
    const dB = daysBetween(b.planned_finish, dataDate);
    return dB - dA;
  });

  for (const a of sorted) {
    const overdueDays  = daysBetween(a.planned_finish, dataDate);
    const progressGap  = 100 - a.percent_complete;
    const projectedSlip = overdueDays + a.remaining_duration;
    const beiUnitWeight = parseFloat((100 / shouldBeComplete.length).toFixed(2)); // this activity's weight in BEI

    const severity: "Critical" | "High" | "Medium" =
      (overdueDays > 30 || a.is_critical) ? "Critical"
      : overdueDays > 14                  ? "High"
      :                                     "Medium";

    issues.push({
      activity_id:          a.activity_id,
      external_id:          a.external_id,
      name:                 a.name,
      wbs_code:             a.wbs_code,
      engine_id:            "DCMA",
      issue_code:           "DCMA_BEI_INCOMPLETE",
      issue_type:           "BEI Violation — Incomplete at Baseline Date",
      severity,
      impact:               parseFloat(Math.min(1.0, 0.4 + (overdueDays / 90) * 0.6).toFixed(3)),
      schedule_impact_days: projectedSlip,
      cost_impact_aed:      0,
      description:
        `${a.external_id} "${a.name}" was due to complete by ${a.planned_finish} ` +
        `but is only ${a.percent_complete}% complete — ${overdueDays}d overdue. ` +
        `Progress gap: ${progressGap}% (${a.remaining_duration}d remaining). ` +
        `Forecast finish: ${a.forecast_finish}. ` +
        `Total projected slip: ${projectedSlip}d. ` +
        `BEI weight: this activity accounts for ${beiUnitWeight}% of the BEI score. ` +
        `${a.is_critical ? "⚠ CRITICAL PATH — overrun propagates to project completion. " : ""}` +
        (a.responsible_party
          ? `Contractor: ${a.responsible_party}.`
          : "No responsible party assigned."),
      evidence: {
        planned_finish:         a.planned_finish,
        data_date:              dataDate,
        overdue_days:           overdueDays,
        percent_complete:       a.percent_complete,
        progress_gap_pct:       progressGap,
        remaining_duration:     a.remaining_duration,
        forecast_finish:        a.forecast_finish,
        projected_total_slip:   projectedSlip,
        bei_unit_weight_pct:    beiUnitWeight,
        bei_project_value:      parseFloat((bei * 100).toFixed(2)),
        is_critical:            a.is_critical,
        total_float:            a.total_float,
        status:                 a.status,
        responsible_party:      a.responsible_party,
      },
      recommended_action:
        `Issue formal delay notice to ${a.responsible_party ?? "contractor"} for "${a.name}". ` +
        `Require a revised completion plan within 5 working days showing how ` +
        `the ${overdueDays}d overrun will be recovered. ` +
        (a.is_critical ? "Invoke acceleration clause — critical path impact. " : "") +
        `Update forecast finish date in the schedule to reflect actual progress.`,
    });
  }

  return {
    check_code:       "BEI",
    check_name:       "Baseline Execution Index (BEI)",
    description:      `BEI = ${isComplete.length}/${shouldBeComplete.length} = ${(bei * 100).toFixed(1)}%. One violation per incomplete-but-due activity. Threshold ≥ ${t.bei_min * 100}%.`,
    total_applicable: shouldBeComplete.length,
    failed_count:     incomplete.length,
    pass_rate_pct:    parseFloat((bei * 100).toFixed(2)),
    threshold_pct:    t.bei_min * 100,
    status:           bei >= t.bei_min ? "Pass" : (bei >= 0.85 ? "Warning" : "Fail"),
    severity_weight:  W.High,
    issues,
  };
}
