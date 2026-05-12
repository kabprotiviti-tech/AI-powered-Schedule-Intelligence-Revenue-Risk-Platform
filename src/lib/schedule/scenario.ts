// Scenario engine — "what-if" duration & schedule mutations.
//
// A scenario picks a subset of activities (by WBS path, activity-name pattern,
// code prefix, or "critical only") and applies a transformation (set duration,
// multiply duration). Re-running the CPM/DCMA/baseline pipeline on the mutated
// schedule and diffing against the base tells the planner what changes if,
// e.g., a slab cycle slows from 7 → 10 days.
//
// V1 scope:
//   - Selectors: wbsContains, namePattern, codePrefix, criticalOnly, explicit ids
//   - Transforms: setDurationDays, multiplyDuration
//   - Persistence: per-schedule scenarios in IndexedDB
//   - Diff: project finish delta, critical-path churn, DCMA score delta,
//     baseline slip delta, matched activity count.
//
// What this DOESN'T do yet (V2):
//   - Logic changes (lag, relationship-type swaps)
//   - Resource overrides
//   - Multi-scenario combine
//   - AI-suggested scenarios (the Recommendation Engine will feed these in
//     once it lands)

import type { Schedule, ScheduleActivity } from "./types";
import type { ScheduleAnalytics } from "./analytics";
import { runCPM }          from "./cpm";
import { runDCMA }         from "./dcma";
import { runBaseline }     from "./baseline";
import { computeStats }    from "./stats";
import { runAchievability } from "./achievability";
import { classifyProject } from "./classifier";
import { runEVM }          from "./evm";

export interface ScenarioSelector {
  // Match WBS path containing this text (case-insensitive). Path is "Root / Branch / Leaf".
  wbsContains?: string;
  // Activity name contains (case-insensitive)
  namePattern?: string;
  // Activity code starts with (case-insensitive)
  codePrefix?: string;
  // Explicit activity ids (overrides everything else when present)
  activityIds?: string[];
  // Only activities on the critical path of the base schedule
  criticalOnly?: boolean;
}

export type ScenarioTransformKind = "setDurationDays" | "multiplyDuration";

export interface ScenarioTransform {
  kind: ScenarioTransformKind;
  value: number; // setDurationDays: target days. multiplyDuration: factor (1.4 = +40%).
}

export interface Scenario {
  id: string;
  scheduleId: string;
  name: string;
  description?: string;
  selector: ScenarioSelector;
  transform: ScenarioTransform;
  createdAt: string;
  updatedAt?: string;
}

export interface ScenarioImpact {
  matchedCount: number;          // activities affected
  baseFinish:   number;          // base project finish (epoch ms)
  newFinish:    number;          // scenario project finish (epoch ms)
  finishDeltaDays: number;       // newFinish - baseFinish in days (positive = slip)
  criticalAdded:   string[];     // activity IDs that became critical
  criticalRemoved: string[];     // activity IDs that left the critical path
  dcmaScoreBase:     number;
  dcmaScoreScenario: number;
  dcmaDelta:         number;
  slipBaseDays:     number;      // base finish slip vs baseline
  slipScenarioDays: number;
  slipDelta:        number;
  totalActivities:  number;
}

// ── Selector evaluation ────────────────────────────────────────────────────
export function selectActivities(
  s: Schedule,
  sel: ScenarioSelector,
  baseAnalytics?: ScheduleAnalytics,
): Set<string> {
  // Explicit ids short-circuit
  if (sel.activityIds && sel.activityIds.length > 0) {
    return new Set(sel.activityIds);
  }

  // Build wbs id → joined-path-name lower-case for wbsContains
  let allowedWbs: Set<string> | null = null;
  if (sel.wbsContains && sel.wbsContains.trim()) {
    const needle = sel.wbsContains.trim().toLowerCase();
    allowedWbs = new Set();
    const byId = new Map(s.wbs.map((w) => [w.id, w]));
    for (const w of s.wbs) {
      const parts: string[] = [w.name];
      let cur = w.parentId ? byId.get(w.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      const joined = parts.join(" / ").toLowerCase();
      if (joined.includes(needle)) allowedWbs.add(w.id);
    }
  }

  const namePat  = sel.namePattern?.trim().toLowerCase();
  const codePref = sel.codePrefix?.trim().toLowerCase();
  const critSet  = sel.criticalOnly && baseAnalytics ? baseAnalytics.cpm.critical : null;

  const out = new Set<string>();
  for (const a of s.activities) {
    if (allowedWbs) {
      if (!a.wbsId || !allowedWbs.has(a.wbsId)) continue;
    }
    if (namePat && !a.name.toLowerCase().includes(namePat)) continue;
    if (codePref && !a.code.toLowerCase().startsWith(codePref)) continue;
    if (critSet && !critSet.has(a.id)) continue;
    out.add(a.id);
  }
  return out;
}

// ── Transform a single activity duration ───────────────────────────────────
function applyTransform(a: ScheduleActivity, t: ScenarioTransform): ScheduleActivity {
  // We work in hours internally; values come in days (8h work-day convention).
  let newHours = a.durationHours;
  switch (t.kind) {
    case "setDurationDays":
      newHours = Math.max(0, t.value * 8);
      break;
    case "multiplyDuration":
      newHours = Math.max(0, a.durationHours * t.value);
      break;
  }
  // Preserve completion semantics — for in-progress activities, scale
  // remaining proportionally; for not-started, remaining = new duration.
  let remaining = a.remainingHours;
  if (a.status === "Completed") {
    remaining = 0;
  } else if (a.status === "InProgress") {
    const pct = Math.min(100, Math.max(0, a.pctComplete)) / 100;
    remaining = newHours * (1 - pct);
  } else {
    remaining = newHours;
  }
  return { ...a, durationHours: newHours, remainingHours: remaining };
}

// ── Build a mutated schedule (does NOT touch the input) ────────────────────
export function applyScenario(
  s: Schedule,
  scenario: Scenario,
  baseAnalytics?: ScheduleAnalytics,
): { schedule: Schedule; matched: Set<string> } {
  const matched = selectActivities(s, scenario.selector, baseAnalytics);
  if (matched.size === 0) return { schedule: s, matched };
  const activities = s.activities.map((a) =>
    matched.has(a.id) ? applyTransform(a, scenario.transform) : a,
  );
  return {
    schedule: { ...s, activities, id: `${s.id}__scn:${scenario.id}` },
    matched,
  };
}

// ── Run analytics on a (possibly mutated) schedule, bypassing any cache ────
export function getAnalyticsUncached(s: Schedule): ScheduleAnalytics {
  const cpm           = runCPM(s);
  const dcma          = runDCMA(s, cpm);
  const baseline      = runBaseline(s);
  const stats         = computeStats(s);
  const achievability = runAchievability(s, cpm, dcma, baseline);
  const snapshot      = classifyProject(s);
  const evm           = runEVM(s);
  return { stats, cpm, dcma, baseline, achievability, snapshot, evm };
}

// ── Full scenario evaluation (base + mutated + diff) ───────────────────────
export function evaluateScenario(s: Schedule, scenario: Scenario): {
  base: ScheduleAnalytics;
  scenario: ScheduleAnalytics;
  impact: ScenarioImpact;
} {
  const base = getAnalyticsUncached(s);
  const { schedule: mutated, matched } = applyScenario(s, scenario, base);
  const scenarioAn = getAnalyticsUncached(mutated);

  // Critical path diff
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of scenarioAn.cpm.critical) if (!base.cpm.critical.has(id)) added.push(id);
  for (const id of base.cpm.critical) if (!scenarioAn.cpm.critical.has(id)) removed.push(id);

  // Finish dates are stored as epoch ms in cpm.projectFinish
  const finishDeltaDays = Math.round(
    (scenarioAn.cpm.projectFinish - base.cpm.projectFinish) / (24 * 3600 * 1000),
  );

  const impact: ScenarioImpact = {
    matchedCount: matched.size,
    baseFinish: base.cpm.projectFinish,
    newFinish:  scenarioAn.cpm.projectFinish,
    finishDeltaDays,
    criticalAdded:   added.slice(0, 50),
    criticalRemoved: removed.slice(0, 50),
    dcmaScoreBase:     base.dcma.overallScore,
    dcmaScoreScenario: scenarioAn.dcma.overallScore,
    dcmaDelta:         scenarioAn.dcma.overallScore - base.dcma.overallScore,
    slipBaseDays:     base.baseline.projectFinishVarDays,
    slipScenarioDays: scenarioAn.baseline.projectFinishVarDays,
    slipDelta:        scenarioAn.baseline.projectFinishVarDays - base.baseline.projectFinishVarDays,
    totalActivities:  s.activities.length,
  };

  return { base, scenario: scenarioAn, impact };
}

// ── Pretty-print a transform for UI labels ─────────────────────────────────
export function describeTransform(t: ScenarioTransform): string {
  switch (t.kind) {
    case "setDurationDays":  return `Set duration to ${t.value}d`;
    case "multiplyDuration": return `Multiply duration × ${t.value.toFixed(2)}`;
  }
}

export function describeSelector(sel: ScenarioSelector): string {
  const parts: string[] = [];
  if (sel.wbsContains)  parts.push(`WBS contains "${sel.wbsContains}"`);
  if (sel.namePattern)  parts.push(`name contains "${sel.namePattern}"`);
  if (sel.codePrefix)   parts.push(`code starts with "${sel.codePrefix}"`);
  if (sel.criticalOnly) parts.push("critical-path only");
  if (sel.activityIds && sel.activityIds.length > 0) parts.push(`${sel.activityIds.length} explicit IDs`);
  return parts.length > 0 ? parts.join(" · ") : "all activities";
}
