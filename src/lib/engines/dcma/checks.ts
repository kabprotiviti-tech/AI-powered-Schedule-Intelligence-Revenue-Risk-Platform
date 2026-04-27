import type { ScheduleActivity, ActivityRelationship, DCMAThresholds, ActivityIssue } from "../core/types";

export interface CheckResult {
  check_code:       string;
  check_name:       string;
  total_applicable: number;
  failed_count:     number;
  pass_rate_pct:    number;
  threshold_pct:    number;
  status:           "Pass" | "Fail" | "Warning" | "N/A";
  severity_weight:  number;           // 3=Critical, 2=High, 1=Medium
  issues:           ActivityIssue[];
}

// Check weights: Critical=3, High=2, Medium=1 → max total = 27
const W = { Critical: 3, High: 2, Medium: 1 } as const;

// ── helpers ──────────────────────────────────────────────────────────────────

function checkStatus(passRate: number, threshold: number): "Pass" | "Fail" | "Warning" {
  if (passRate >= 100 - threshold) return "Pass";
  if (passRate >= 100 - threshold * 1.5) return "Warning";
  return "Fail";
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// ── 1. Logic — missing predecessors / successors ─────────────────────────────

export function checkLogic(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (!a.has_predecessor || !a.has_successor) {
      const missing = !a.has_predecessor && !a.has_successor ? "predecessor and successor"
                    : !a.has_predecessor ? "predecessor" : "successor";
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_LOGIC_MISSING",
        issue_type: "Missing Logic",
        severity: "Critical",
        impact: 1.0,
        schedule_impact_days: Math.round(a.remaining_duration * 0.4),
        cost_impact_aed: 0,
        description: `${a.external_id} (${a.name}) is missing a ${missing}. Isolated activities break critical path integrity.`,
        evidence: { has_predecessor: a.has_predecessor, has_successor: a.has_successor },
        recommended_action: `Add a logical ${missing} link. Do not use date constraints as a substitute for logic.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "LOGIC", check_name: "Missing Logic",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.logic,
    status: checkStatus(100 - pass, t.logic),
    severity_weight: W.Critical, issues,
  };
}

// ── 2. Leads — negative lags ─────────────────────────────────────────────────

export function checkLeads(
  activities: ScheduleActivity[],
  relationships: ActivityRelationship[],
  t: DCMAThresholds,
): CheckResult {
  const actMap = new Map(activities.map((a) => [a.activity_id, a]));
  const issues: ActivityIssue[] = [];

  for (const r of relationships) {
    if (r.lag_days < 0) {
      const pred = actMap.get(r.predecessor_id);
      if (!pred) continue;
      issues.push({
        activity_id: r.predecessor_id, external_id: pred.external_id,
        name: pred.name, wbs_code: pred.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_LEAD",
        issue_type: "Lead (Negative Lag)",
        severity: "High",
        impact: 0.7,
        schedule_impact_days: Math.abs(r.lag_days),
        cost_impact_aed: 0,
        description: `Relationship from ${pred.external_id} has a ${r.lag_days}-day lead. Leads artificially compress the schedule and hide true critical path logic.`,
        evidence: { relationship_id: r.relationship_id, lag_days: r.lag_days, type: r.type },
        recommended_action: `Remove lead. Split the predecessor activity at the overlap point and create a distinct activity for the overlapping work.`,
      });
    }
  }

  const pass = relationships.length > 0 ? (issues.length / relationships.length) * 100 : 0;
  return {
    check_code: "LEADS", check_name: "Leads (Negative Lags)",
    total_applicable: relationships.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.leads,
    status: checkStatus(100 - pass, t.leads),
    severity_weight: W.High, issues,
  };
}

// ── 3. Lags — positive lags > 0 ─────────────────────────────────────────────

export function checkLags(
  activities: ScheduleActivity[],
  relationships: ActivityRelationship[],
  t: DCMAThresholds,
): CheckResult {
  const actMap = new Map(activities.map((a) => [a.activity_id, a]));
  const issues: ActivityIssue[] = [];

  for (const r of relationships) {
    if (r.lag_days > 0) {
      const pred = actMap.get(r.predecessor_id);
      if (!pred) continue;
      issues.push({
        activity_id: r.predecessor_id, external_id: pred.external_id,
        name: pred.name, wbs_code: pred.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_LAG",
        issue_type: "Lag",
        severity: "Medium",
        impact: 0.5,
        schedule_impact_days: r.lag_days,
        cost_impact_aed: 0,
        description: `Relationship from ${pred.external_id} has a ${r.lag_days}-day lag. Positive lags may mask missing activities.`,
        evidence: { relationship_id: r.relationship_id, lag_days: r.lag_days, type: r.type },
        recommended_action: `Replace lag with a discrete activity representing the work/wait that causes the delay.`,
      });
    }
  }

  const pass = relationships.length > 0 ? (issues.length / relationships.length) * 100 : 0;
  return {
    check_code: "LAGS", check_name: "Lags (Positive)",
    total_applicable: relationships.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.lags,
    status: checkStatus(100 - pass, t.lags),
    severity_weight: W.Medium, issues,
  };
}

// ── 4. Relationship types — non-FS ───────────────────────────────────────────

export function checkRelTypes(
  activities: ScheduleActivity[],
  relationships: ActivityRelationship[],
  t: DCMAThresholds,
): CheckResult {
  const actMap = new Map(activities.map((a) => [a.activity_id, a]));
  const issues: ActivityIssue[] = [];

  for (const r of relationships) {
    if (r.type !== "FS") {
      const pred = actMap.get(r.predecessor_id);
      if (!pred) continue;
      issues.push({
        activity_id: r.predecessor_id, external_id: pred.external_id,
        name: pred.name, wbs_code: pred.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_REL_TYPE",
        issue_type: "Non-FS Relationship",
        severity: "Low",
        impact: 0.3,
        schedule_impact_days: 0,
        cost_impact_aed: 0,
        description: `Relationship from ${pred.external_id} uses ${r.type} type. Non-FS relationships require specific justification.`,
        evidence: { relationship_id: r.relationship_id, type: r.type },
        recommended_action: `Verify ${r.type} relationship is intentional and documented. Consider replacing with FS + discrete work activity if logic is unclear.`,
      });
    }
  }

  const pass = relationships.length > 0 ? (issues.length / relationships.length) * 100 : 0;
  return {
    check_code: "REL_TYPES", check_name: "Non-FS Relationships",
    total_applicable: relationships.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.rel_types,
    status: checkStatus(100 - pass, t.rel_types),
    severity_weight: W.Medium, issues,
  };
}

// ── 5. Hard constraints ───────────────────────────────────────────────────────

export function checkHardConstraints(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const HARD = ["MSO", "MFO", "FNET", "FNLT"];
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (a.constraint_type && HARD.includes(a.constraint_type)) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_HARD_CONSTRAINT",
        issue_type: "Hard Constraint",
        severity: "High",
        impact: 0.6,
        schedule_impact_days: 0,
        cost_impact_aed: 0,
        description: `${a.external_id} has a hard constraint (${a.constraint_type} ${a.constraint_date ?? ""}). Hard constraints override CPM logic and can hide float errors.`,
        evidence: { constraint_type: a.constraint_type, constraint_date: a.constraint_date },
        recommended_action: `Remove constraint and replace with logical predecessor relationships. Hard constraints are only acceptable for regulatory or contractual dates.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "HARD_CONST", check_name: "Hard Constraints",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.hard_constraints,
    status: checkStatus(100 - pass, t.hard_constraints),
    severity_weight: W.High, issues,
  };
}

// ── 6. High float (> 44 working days) ────────────────────────────────────────

export function checkHighFloat(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task" && a.total_float !== null);
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if ((a.total_float ?? 0) > t.high_float_days) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_HIGH_FLOAT",
        issue_type: "High Float",
        severity: "Medium",
        impact: 0.4,
        schedule_impact_days: 0,
        cost_impact_aed: 0,
        description: `${a.external_id} has ${a.total_float} days total float — exceeds ${t.high_float_days}-day threshold. Likely indicates missing successor logic.`,
        evidence: { total_float: a.total_float, threshold: t.high_float_days },
        recommended_action: `Investigate missing successor logic. Activity may be disconnected from the network or incorrectly linked.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "HIGH_FLOAT", check_name: "High Total Float",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.high_float,
    status: checkStatus(100 - pass, t.high_float),
    severity_weight: W.Medium, issues,
  };
}

// ── 7. Negative float ─────────────────────────────────────────────────────────

export function checkNegativeFloat(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task" && a.total_float !== null);
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if ((a.total_float ?? 0) < 0) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_NEG_FLOAT",
        issue_type: "Negative Float",
        severity: "Critical",
        impact: 1.0,
        schedule_impact_days: Math.abs(a.total_float ?? 0),
        cost_impact_aed: 0,
        description: `${a.external_id} has ${a.total_float} days total float. The critical path has already been exceeded — project finish is at risk.`,
        evidence: { total_float: a.total_float },
        recommended_action: `Immediate recovery action required. Options: compress remaining duration, add resources, re-sequence parallel activities, or rebaseline after PMO approval.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "NEG_FLOAT", check_name: "Negative Float",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.neg_float,
    status: issues.length === 0 ? "Pass" : "Fail",
    severity_weight: W.Critical, issues,
  };
}

// ── 8. High duration (> 44 working days) ─────────────────────────────────────

export function checkHighDuration(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (a.planned_duration > t.high_duration_days) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_HIGH_DUR",
        issue_type: "High Duration",
        severity: "Medium",
        impact: 0.4,
        schedule_impact_days: 0,
        cost_impact_aed: 0,
        description: `${a.external_id} has a ${a.planned_duration}-day planned duration — exceeds ${t.high_duration_days}-day threshold. High-duration activities obscure progress and delay risk detection.`,
        evidence: { planned_duration: a.planned_duration, threshold: t.high_duration_days },
        recommended_action: `Decompose into smaller work packages of ≤44 working days each. Improves progress visibility and early risk detection.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "HIGH_DUR", check_name: "High Duration",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.high_duration,
    status: checkStatus(100 - pass, t.high_duration),
    severity_weight: W.Medium, issues,
  };
}

// ── 9. Invalid dates ──────────────────────────────────────────────────────────

export function checkInvalidDates(
  activities: ScheduleActivity[],
  dataDate: string,
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    const actualInFuture = a.actual_start && daysBetween(dataDate, a.actual_start) > 0;
    const forecastInPast = daysBetween(a.forecast_finish, dataDate) > 0 && a.percent_complete < 100;
    const startAfterFinish = daysBetween(a.planned_start, a.planned_finish) < 0;

    if (actualInFuture || forecastInPast || startAfterFinish) {
      const reason = actualInFuture ? "Actual start date is after the data date"
                   : forecastInPast ? "Forecast finish is in the past but activity is incomplete"
                   : "Planned start is after planned finish";
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_INVALID_DATE",
        issue_type: "Invalid Date",
        severity: "Critical",
        impact: 0.9,
        schedule_impact_days: forecastInPast ? daysBetween(a.forecast_finish, dataDate) : 0,
        cost_impact_aed: 0,
        description: `${a.external_id}: ${reason}.`,
        evidence: {
          planned_start: a.planned_start, planned_finish: a.planned_finish,
          actual_start: a.actual_start, forecast_finish: a.forecast_finish, data_date: dataDate,
        },
        recommended_action: `Correct the date inconsistency in the source schedule. Investigate if activity was updated against a wrong data date.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "INVALID_DATES", check_name: "Invalid Dates",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.invalid_dates,
    status: issues.length === 0 ? "Pass" : "Fail",
    severity_weight: W.Critical, issues,
  };
}

// ── 10. Resources — unloaded activities ──────────────────────────────────────

export function checkResources(
  activities: ScheduleActivity[],
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (!a.resource_assigned) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_NO_RESOURCE",
        issue_type: "Missing Resource",
        severity: "Medium",
        impact: 0.3,
        schedule_impact_days: 0,
        cost_impact_aed: 0,
        description: `${a.external_id} has no resource assignment. Unloaded activities undermine Earned Value analysis and resource capacity planning.`,
        evidence: { resource_assigned: false },
        recommended_action: `Assign at least one resource type (Labour, Equipment, or Subcontractor). Resource loading is mandatory for EVM reporting.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "RESOURCES", check_name: "Missing Resources",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.resources,
    status: checkStatus(100 - pass, t.resources),
    severity_weight: W.Medium, issues,
  };
}

// ── 11. Missed activities — past due, incomplete ──────────────────────────────

export function checkMissedActivities(
  activities: ScheduleActivity[],
  dataDate: string,
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    const overdueDays = daysBetween(a.planned_finish, dataDate);
    if (overdueDays > 0 && a.percent_complete < 100 && !a.actual_finish) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_MISSED_ACTIVITY",
        issue_type: "Missed Activity",
        severity: "High",
        impact: 0.8,
        schedule_impact_days: overdueDays,
        cost_impact_aed: 0,
        description: `${a.external_id} should have completed ${overdueDays} days ago (planned finish: ${a.planned_finish}) but is only ${a.percent_complete}% complete.`,
        evidence: { planned_finish: a.planned_finish, data_date: dataDate, percent_complete: a.percent_complete, overdue_days: overdueDays },
        recommended_action: `Issue delay notice. Update forecast finish date and assess critical path impact. Invoke acceleration clause if activity is on critical path.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "MISSED_ACT", check_name: "Missed Activities",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: t.missed_activities,
    status: checkStatus(100 - pass, t.missed_activities),
    severity_weight: W.High, issues,
  };
}

// ── 12. Critical path test — project finish reachable ────────────────────────

export function checkCriticalPathTest(
  activities: ScheduleActivity[],
  relationships: ActivityRelationship[],
  projectFinishId: string,
  t: DCMAThresholds,
): CheckResult {
  const succMap = new Map<string, string[]>();
  for (const r of relationships) {
    if (!succMap.has(r.predecessor_id)) succMap.set(r.predecessor_id, []);
    succMap.get(r.predecessor_id)!.push(r.successor_id);
  }

  // BFS from each activity — can we reach the project finish milestone?
  const reachesFinish = (startId: string): boolean => {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (id === projectFinishId) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const s of succMap.get(id) ?? []) queue.push(s);
    }
    return false;
  };

  const tasks = activities.filter((a) => a.activity_type === "Task");
  const issues: ActivityIssue[] = [];

  for (const a of tasks) {
    if (!reachesFinish(a.activity_id)) {
      issues.push({
        activity_id: a.activity_id, external_id: a.external_id,
        name: a.name, wbs_code: a.wbs_code, engine_id: "DCMA",
        issue_code: "DCMA_CP_OPEN_END",
        issue_type: "Critical Path Open End",
        severity: "Critical",
        impact: 0.9,
        schedule_impact_days: a.remaining_duration,
        cost_impact_aed: 0,
        description: `${a.external_id} has no path to the project finish milestone. This activity floats freely outside the network and is invisible to CPM analysis.`,
        evidence: { activity_id: a.activity_id, project_finish_id: projectFinishId },
        recommended_action: `Connect activity to the project finish milestone, directly or via an intermediate successor. All activities must be network-connected.`,
      });
    }
  }

  const pass = (issues.length / tasks.length) * 100;
  return {
    check_code: "CP_TEST", check_name: "Critical Path Test",
    total_applicable: tasks.length, failed_count: issues.length,
    pass_rate_pct: 100 - pass, threshold_pct: 0,
    status: issues.length === 0 ? "Pass" : "Fail",
    severity_weight: W.Critical, issues,
  };
}

// ── 13. CPLI — Critical Path Length Index ────────────────────────────────────

export function checkCPLI(
  activities: ScheduleActivity[],
  projectFinishId: string,
  t: DCMAThresholds,
): CheckResult {
  const projectFinish = activities.find((a) => a.activity_id === projectFinishId);
  const criticals = activities.filter((a) => a.is_critical && a.percent_complete < 100);

  if (!projectFinish || criticals.length === 0) {
    return {
      check_code: "CPLI", check_name: "Critical Path Length Index",
      total_applicable: 1, failed_count: 0, pass_rate_pct: 100,
      threshold_pct: t.cpli_min * 100, status: "N/A",
      severity_weight: W.High, issues: [],
    };
  }

  const remainingDuration = criticals.reduce((s, a) => s + a.remaining_duration, 0);
  const projectFloat = projectFinish.total_float ?? 0;
  const cpli = remainingDuration > 0
    ? (projectFloat + remainingDuration) / remainingDuration
    : 1.0;

  const pass = cpli >= t.cpli_min;
  const issues: ActivityIssue[] = pass ? [] : [{
    activity_id: projectFinishId, external_id: "PROJ_FINISH",
    name: "Project Finish Milestone", wbs_code: "", engine_id: "DCMA",
    issue_code: "DCMA_CPLI_LOW",
    issue_type: "Low CPLI",
    severity: cpli < 0.85 ? "Critical" : "High",
    impact: Math.max(0, 1 - cpli),
    schedule_impact_days: Math.round((1 - cpli) * remainingDuration),
    cost_impact_aed: 0,
    description: `CPLI = ${cpli.toFixed(3)} (threshold ≥ ${t.cpli_min}). Insufficient float buffer on the critical path. Any further slip will directly delay project completion.`,
    evidence: { cpli, project_float: projectFloat, remaining_duration: remainingDuration, threshold: t.cpli_min },
    recommended_action: `Add schedule recovery on critical activities to build a float buffer of ≥10 days. Review acceleration options with contractor.`,
  }];

  return {
    check_code: "CPLI", check_name: "Critical Path Length Index",
    total_applicable: 1, failed_count: pass ? 0 : 1,
    pass_rate_pct: pass ? 100 : Math.round((cpli / t.cpli_min) * 100),
    threshold_pct: t.cpli_min * 100, status: pass ? "Pass" : (cpli >= 0.85 ? "Warning" : "Fail"),
    severity_weight: W.High, issues,
  };
}

// ── 14. BEI — Baseline Execution Index ───────────────────────────────────────

export function checkBEI(
  activities: ScheduleActivity[],
  dataDate: string,
  t: DCMAThresholds,
): CheckResult {
  const tasks = activities.filter((a) => a.activity_type === "Task");

  // Should be complete: planned_finish <= data_date
  const shouldBeComplete = tasks.filter(
    (a) => daysBetween(a.planned_finish, dataDate) >= 0
  );
  const isComplete = shouldBeComplete.filter((a) => a.percent_complete >= 100);

  if (shouldBeComplete.length === 0) {
    return {
      check_code: "BEI", check_name: "Baseline Execution Index",
      total_applicable: 0, failed_count: 0, pass_rate_pct: 100,
      threshold_pct: t.bei_min * 100, status: "N/A",
      severity_weight: W.High, issues: [],
    };
  }

  const bei = isComplete.length / shouldBeComplete.length;
  const pass = bei >= t.bei_min;

  const issues: ActivityIssue[] = pass ? [] : [{
    activity_id: "PROJECT",
    external_id: "BEI_CHECK",
    name: "Project BEI", wbs_code: "", engine_id: "DCMA",
    issue_code: "DCMA_BEI_LOW",
    issue_type: "Low BEI",
    severity: bei < 0.85 ? "Critical" : "High",
    impact: Math.max(0, 1 - bei),
    schedule_impact_days: shouldBeComplete.length - isComplete.length,
    cost_impact_aed: 0,
    description: `BEI = ${bei.toFixed(3)} (${isComplete.length} of ${shouldBeComplete.length} due activities completed). Threshold ≥ ${t.bei_min}. Schedule execution is behind baseline plan.`,
    evidence: { bei, should_be_complete: shouldBeComplete.length, is_complete: isComplete.length, threshold: t.bei_min },
    recommended_action: `Identify the ${shouldBeComplete.length - isComplete.length} overdue activities and issue formal delay notices. Prepare recovery schedule for PMO review.`,
  }];

  return {
    check_code: "BEI", check_name: "Baseline Execution Index",
    total_applicable: shouldBeComplete.length,
    failed_count: shouldBeComplete.length - isComplete.length,
    pass_rate_pct: Math.round(bei * 100),
    threshold_pct: t.bei_min * 100,
    status: pass ? "Pass" : (bei >= 0.85 ? "Warning" : "Fail"),
    severity_weight: W.High, issues,
  };
}
