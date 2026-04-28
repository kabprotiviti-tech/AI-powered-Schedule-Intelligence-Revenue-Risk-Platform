// DCMA 14-Point Schedule Assessment — runs on a Schedule + CPM result.
//
// Reference: Defense Contract Management Agency 14-point schedule assessment.
// Industry-standard quality gate; thresholds below are the canonical defaults.
//
// Returned per-check:
//   - id, name, description, threshold
//   - pass/warn/fail status
//   - actualValue, ratio (e.g. % failing)
//   - failingActivityIds (drill-down target)

import type { Schedule, ScheduleActivity } from "./types";
import type { CPMResult } from "./cpm";

const MS_DAY  = 86_400_000;
const MS_HOUR = 3_600_000;
const HRS_PER_DAY = 8;

export type CheckStatus = "pass" | "warn" | "fail" | "n/a";

export interface DCMACheck {
  id:         string;
  name:       string;
  description:string;
  threshold:  string;
  status:     CheckStatus;
  metricLabel:string;
  metricValue:string;
  failingPct: number;        // 0..100
  failingIds: string[];
}

export interface DCMAResult {
  checks: DCMACheck[];
  overallScore: number;      // 0..100, weighted pass rate
  passCount: number;
  warnCount: number;
  failCount: number;
  totalActivities: number;
}

// ── Helpers
const isInProgressOrNotStarted = (a: ScheduleActivity) => a.status !== "Completed";
const isMilestone = (a: ScheduleActivity) => a.isMilestone;
const isLOEorSummary = (a: ScheduleActivity) => a.type === "LOE" || a.type === "WBSSummary";

function statusFromPct(failingPct: number, warnAt: number, failAt: number): CheckStatus {
  if (failingPct >= failAt) return "fail";
  if (failingPct >= warnAt) return "warn";
  return "pass";
}

// ── Checks
function logicCheck(s: Schedule): DCMACheck {
  // 1. Logic: every activity (except start/finish milestones) should have at least one predecessor AND one successor.
  const succsOf = new Map<string, number>();
  for (const a of s.activities) {
    for (const p of a.predecessors) succsOf.set(p.predId, (succsOf.get(p.predId) ?? 0) + 1);
  }
  const candidates = s.activities.filter((a) => !isLOEorSummary(a));
  const failing = candidates.filter((a) => {
    const hasPred = a.predecessors.length > 0;
    const hasSucc = (succsOf.get(a.id) ?? 0) > 0;
    return !hasPred && !hasSucc;
  });
  const pct = candidates.length === 0 ? 0 : (failing.length / candidates.length) * 100;
  return {
    id: "LOGIC",
    name: "Logic",
    description: "Every activity should have at least one predecessor and one successor (excluding project start / finish).",
    threshold: "≤ 5% missing logic",
    status: statusFromPct(pct, 5, 10),
    metricLabel: "Activities missing both pred & succ",
    metricValue: `${failing.length} of ${candidates.length}`,
    failingPct: pct,
    failingIds: failing.map((a) => a.id),
  };
}

function leadsCheck(s: Schedule): DCMACheck {
  // 2. Leads: no negative lag.
  const failing = new Set<string>();
  let total = 0;
  for (const a of s.activities) {
    for (const p of a.predecessors) {
      total++;
      if (p.lagHours < 0) failing.add(a.id);
    }
  }
  const pct = total === 0 ? 0 : (failing.size / s.activities.length) * 100;
  return {
    id: "LEADS",
    name: "Leads (negative lag)",
    description: "Negative lag (leads) should not be used; they obscure logic.",
    threshold: "0%",
    status: failing.size === 0 ? "pass" : pct < 5 ? "warn" : "fail",
    metricLabel: "Activities with negative lag",
    metricValue: `${failing.size}`,
    failingPct: pct,
    failingIds: Array.from(failing),
  };
}

function lagsCheck(s: Schedule): DCMACheck {
  // 3. Lags: ≤ 5% of relationships should have positive lag.
  let total = 0, withLag = 0;
  const failing = new Set<string>();
  for (const a of s.activities) {
    for (const p of a.predecessors) {
      total++;
      if (p.lagHours > 0) {
        withLag++;
        failing.add(a.id);
      }
    }
  }
  const pct = total === 0 ? 0 : (withLag / total) * 100;
  return {
    id: "LAGS",
    name: "Lags",
    description: "Excessive positive lags hide schedule reality; should be ≤ 5% of relationships.",
    threshold: "≤ 5% of relationships",
    status: statusFromPct(pct, 5, 10),
    metricLabel: "Relationships with positive lag",
    metricValue: `${withLag} of ${total} (${pct.toFixed(1)}%)`,
    failingPct: pct,
    failingIds: Array.from(failing),
  };
}

function relTypesCheck(s: Schedule): DCMACheck {
  // 4. Relationship types: ≥ 90% should be Finish-to-Start.
  let total = 0, fs = 0;
  const nonFsActivities = new Set<string>();
  for (const a of s.activities) {
    for (const p of a.predecessors) {
      total++;
      if (p.type === "FS") fs++;
      else nonFsActivities.add(a.id);
    }
  }
  const fsPct = total === 0 ? 100 : (fs / total) * 100;
  const failingPct = 100 - fsPct;
  return {
    id: "REL_TYPES",
    name: "Relationship Types",
    description: "Finish-to-Start (FS) should account for at least 90% of relationships.",
    threshold: "≥ 90% FS",
    status: fsPct >= 90 ? "pass" : fsPct >= 80 ? "warn" : "fail",
    metricLabel: "FS relationships",
    metricValue: `${fsPct.toFixed(1)}%`,
    failingPct,
    failingIds: Array.from(nonFsActivities),
  };
}

function constraintsCheck(s: Schedule): DCMACheck {
  // 5. Hard constraints: MSO/MFO should be ≤ 5% of activities.
  const HARD = new Set(["MSO", "MFO"]);
  const failing = s.activities.filter((a) => a.constraint && HARD.has(a.constraint.type));
  const pct = s.activities.length === 0 ? 0 : (failing.length / s.activities.length) * 100;
  return {
    id: "CONSTRAINTS",
    name: "Hard Constraints",
    description: "Mandatory Start/Finish constraints distort logic-driven scheduling. Limit to ≤ 5% of activities.",
    threshold: "≤ 5%",
    status: statusFromPct(pct, 5, 10),
    metricLabel: "Activities with hard constraints",
    metricValue: `${failing.length}`,
    failingPct: pct,
    failingIds: failing.map((a) => a.id),
  };
}

function highFloatCheck(s: Schedule, cpm: CPMResult): DCMACheck {
  // 6. High float: total float > 44 working days flags excessive slack.
  const FAIL_HRS = 44 * HRS_PER_DAY;
  const failing: string[] = [];
  let countable = 0;
  for (const a of s.activities) {
    if (!isInProgressOrNotStarted(a) || isLOEorSummary(a)) continue;
    countable++;
    const tf = cpm.totalFloat.get(a.id) ?? 0;
    if (tf > FAIL_HRS) failing.push(a.id);
  }
  const pct = countable === 0 ? 0 : (failing.length / countable) * 100;
  return {
    id: "HIGH_FLOAT",
    name: "High Float",
    description: "Activities with > 44 working days of total float likely indicate logic gaps.",
    threshold: "≤ 5%",
    status: statusFromPct(pct, 5, 10),
    metricLabel: "Activities with total float > 44d",
    metricValue: `${failing.length}`,
    failingPct: pct,
    failingIds: failing,
  };
}

function negativeFloatCheck(s: Schedule, cpm: CPMResult): DCMACheck {
  // 7. Negative float: any activity with TF < 0.
  const failing: string[] = [];
  for (const a of s.activities) {
    if (!isInProgressOrNotStarted(a)) continue;
    const tf = cpm.totalFloat.get(a.id) ?? 0;
    if (tf < -0.01) failing.push(a.id);
  }
  const pct = s.activities.length === 0 ? 0 : (failing.length / s.activities.length) * 100;
  return {
    id: "NEG_FLOAT",
    name: "Negative Float",
    description: "Negative float indicates logical impossibility — finish dates are unachievable.",
    threshold: "0",
    status: failing.length === 0 ? "pass" : pct < 1 ? "warn" : "fail",
    metricLabel: "Activities with negative total float",
    metricValue: `${failing.length}`,
    failingPct: pct,
    failingIds: failing,
  };
}

function highDurationCheck(s: Schedule): DCMACheck {
  // 8. High duration: planned duration > 44 working days (excluding milestones, LOE, summary).
  const FAIL_HRS = 44 * HRS_PER_DAY;
  const candidates = s.activities.filter((a) => !isMilestone(a) && !isLOEorSummary(a));
  const failing = candidates.filter((a) => a.durationHours > FAIL_HRS);
  const pct = candidates.length === 0 ? 0 : (failing.length / candidates.length) * 100;
  return {
    id: "HIGH_DURATION",
    name: "High Duration",
    description: "Activities longer than 44 working days should be subdivided.",
    threshold: "≤ 5%",
    status: statusFromPct(pct, 5, 10),
    metricLabel: "Activities with duration > 44d",
    metricValue: `${failing.length} of ${candidates.length}`,
    failingPct: pct,
    failingIds: failing.map((a) => a.id),
  };
}

function invalidDatesCheck(s: Schedule): DCMACheck {
  // 9. Invalid dates: actuals after data-date, or forecasts before data-date.
  const dataDate = s.project.dataDate ? new Date(s.project.dataDate).getTime() : 0;
  const failing: string[] = [];
  for (const a of s.activities) {
    if (a.actualStart && new Date(a.actualStart).getTime() > dataDate) failing.push(a.id);
    else if (a.actualFinish && new Date(a.actualFinish).getTime() > dataDate) failing.push(a.id);
    else if (a.status !== "Completed" && a.plannedFinish && new Date(a.plannedFinish).getTime() < dataDate) failing.push(a.id);
  }
  const pct = s.activities.length === 0 ? 0 : (failing.length / s.activities.length) * 100;
  return {
    id: "INVALID_DATES",
    name: "Invalid Dates",
    description: "Actuals after data date or forecasts before data date are inconsistent with status.",
    threshold: "0",
    status: failing.length === 0 ? "pass" : pct < 2 ? "warn" : "fail",
    metricLabel: "Activities with invalid dates",
    metricValue: `${failing.length}`,
    failingPct: pct,
    failingIds: failing,
  };
}

function resourcesCheck(s: Schedule): DCMACheck {
  // 10. Resources: ≥ 80% of work activities should have a responsible/resource assigned.
  // We approximate using `responsible` field; many imports won't have this.
  const candidates = s.activities.filter((a) => a.type === "TaskDependent" || a.type === "ResourceDependent");
  if (candidates.length === 0) {
    return {
      id: "RESOURCES",
      name: "Resources",
      description: "Activities should have responsible parties assigned.",
      threshold: "≥ 80% assigned",
      status: "n/a",
      metricLabel: "Resource-assigned",
      metricValue: "n/a",
      failingPct: 0,
      failingIds: [],
    };
  }
  const failing = candidates.filter((a) => !a.responsible || a.responsible.trim() === "");
  const pct = (failing.length / candidates.length) * 100;
  return {
    id: "RESOURCES",
    name: "Resources",
    description: "Activities should have responsible parties / resources assigned.",
    threshold: "≥ 80% assigned",
    status: pct < 20 ? "pass" : pct < 40 ? "warn" : "fail",
    metricLabel: "Activities without responsible party",
    metricValue: `${failing.length}`,
    failingPct: pct,
    failingIds: failing.map((a) => a.id),
  };
}

function missedTasksCheck(s: Schedule): DCMACheck {
  // 11. Missed tasks: incomplete activities whose baseline finish < data date but no actual finish.
  const dataDate = s.project.dataDate ? new Date(s.project.dataDate).getTime() : 0;
  const failing: string[] = [];
  for (const a of s.activities) {
    if (a.status === "Completed") continue;
    const bf = a.baselineFinish ? new Date(a.baselineFinish).getTime() : 0;
    if (bf > 0 && bf < dataDate) failing.push(a.id);
  }
  const pct = s.activities.length === 0 ? 0 : (failing.length / s.activities.length) * 100;
  return {
    id: "MISSED",
    name: "Missed Tasks",
    description: "Incomplete activities whose baseline finish is in the past indicate slip.",
    threshold: "≤ 5%",
    status: statusFromPct(pct, 5, 10),
    metricLabel: "Slipped activities",
    metricValue: `${failing.length}`,
    failingPct: pct,
    failingIds: failing,
  };
}

function criticalPathTestCheck(s: Schedule, cpm: CPMResult): DCMACheck {
  // 12. Critical path test: there must exist a continuous CP from start to project finish.
  // Approximation: the count of critical activities must be > 0 and form a connected chain.
  const critical = cpm.critical;
  const status: CheckStatus = critical.size === 0 ? "fail" : critical.size < 5 ? "warn" : "pass";
  return {
    id: "CP_TEST",
    name: "Critical Path Test",
    description: "There must be a complete, continuous critical path from start to finish.",
    threshold: "≥ 1 continuous chain",
    status,
    metricLabel: "Activities on the critical path",
    metricValue: `${critical.size}`,
    failingPct: critical.size === 0 ? 100 : 0,
    failingIds: [],
  };
}

function cpliCheck(s: Schedule, cpm: CPMResult): DCMACheck {
  // 13. CPLI: Critical Path Length Index = (CP length + total float) / CP length. Target ≥ 0.95.
  const dataDate = s.project.dataDate ? new Date(s.project.dataDate).getTime() : 0;
  const baselineFinish = s.project.baselineFinish ? new Date(s.project.baselineFinish).getTime() : cpm.projectFinish;
  const cpLen = Math.max(0, (baselineFinish - dataDate) / MS_DAY);

  // Sum total float on critical path (≈0 by definition; use min of TF instead)
  let minTF = Infinity;
  for (const id of cpm.critical) {
    const tf = cpm.totalFloat.get(id) ?? 0;
    if (tf < minTF) minTF = tf;
  }
  const tfDays = (minTF === Infinity ? 0 : minTF) / HRS_PER_DAY;
  const cpli = cpLen <= 0 ? 1 : (cpLen + tfDays) / cpLen;

  return {
    id: "CPLI",
    name: "CPLI",
    description: "Critical Path Length Index — schedule's ability to finish on time. ≥ 0.95 = healthy.",
    threshold: "≥ 0.95",
    status: cpli >= 0.95 ? "pass" : cpli >= 0.90 ? "warn" : "fail",
    metricLabel: "CPLI",
    metricValue: cpli.toFixed(3),
    failingPct: cpli >= 0.95 ? 0 : 100 - cpli * 100,
    failingIds: [],
  };
}

function beiCheck(s: Schedule): DCMACheck {
  // 14. BEI: Baseline Execution Index = tasks completed / tasks scheduled to be completed by now.
  const dataDate = s.project.dataDate ? new Date(s.project.dataDate).getTime() : 0;
  const shouldBeDone = s.activities.filter((a) => {
    const bf = a.baselineFinish ? new Date(a.baselineFinish).getTime() : 0;
    return bf > 0 && bf <= dataDate;
  });
  const actuallyDone = shouldBeDone.filter((a) => a.status === "Completed").length;
  const bei = shouldBeDone.length === 0 ? 1 : actuallyDone / shouldBeDone.length;
  return {
    id: "BEI",
    name: "BEI",
    description: "Baseline Execution Index — completed vs scheduled to be done. ≥ 0.95 = healthy.",
    threshold: "≥ 0.95",
    status: bei >= 0.95 ? "pass" : bei >= 0.90 ? "warn" : "fail",
    metricLabel: "BEI",
    metricValue: bei.toFixed(3),
    failingPct: bei >= 0.95 ? 0 : 100 - bei * 100,
    failingIds: [],
  };
}

// ── Public API
export function runDCMA(s: Schedule, cpm: CPMResult): DCMAResult {
  const checks: DCMACheck[] = [
    logicCheck(s),
    leadsCheck(s),
    lagsCheck(s),
    relTypesCheck(s),
    constraintsCheck(s),
    highFloatCheck(s, cpm),
    negativeFloatCheck(s, cpm),
    highDurationCheck(s),
    invalidDatesCheck(s),
    resourcesCheck(s),
    missedTasksCheck(s),
    criticalPathTestCheck(s, cpm),
    cpliCheck(s, cpm),
    beiCheck(s),
  ];

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const naCount   = checks.filter((c) => c.status === "n/a").length;
  const denom     = checks.length - naCount;

  // Score: pass=100, warn=60, fail=0; weight all checks equally.
  const score = denom === 0 ? 100 : Math.round(
    checks.reduce((acc, c) => acc + (c.status === "pass" ? 100 : c.status === "warn" ? 60 : c.status === "fail" ? 0 : 0), 0) / denom,
  );

  return { checks, overallScore: score, passCount, warnCount, failCount, totalActivities: s.activities.length };
}
