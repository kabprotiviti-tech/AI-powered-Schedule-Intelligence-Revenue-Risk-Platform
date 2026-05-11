// Aggregate multiple schedules into a single synthetic Schedule + Analytics
// so dashboards (which were written against one schedule) render cumulative
// numbers without modification.
//
// Strategy:
//   - Concatenate activities from all schedules (no ID prefixing — original
//     IDs are preserved so /activity/[id] cross-references keep working;
//     duplicate IDs across schedules are extremely rare in practice and we
//     accept the trade-off rather than rewriting the URL scheme).
//   - Per-schedule CPM/DCMA/baseline are still computed individually; we
//     aggregate the *result* objects (totalFloat maps merged, critical sets
//     unioned, DCMA scores activity-weighted, etc.).
//
// Caching is keyed on the concatenated schedule ID list so flipping
// selections doesn't recompute when the same set is re-shown.

import type { Schedule, ScheduleActivity, Calendar, WBSNode } from "./types";
import { runCPM, type CPMResult }              from "./cpm";
import { runDCMA, type DCMAResult, type DCMACheck, type CheckStatus } from "./dcma";
import { runBaseline, type BaselineVariance, type ActivityVariance } from "./baseline";
import { computeStats, type PortfolioStats }   from "./stats";
import { runAchievability, type AchievabilityResult } from "./achievability";
import { classifyProject, type ProjectSnapshot, type ClassifierOverrideInput } from "./classifier";
import type { ScheduleAnalytics } from "./analytics";

// ── Combined schedule (purely synthetic — never persisted) ──────────────────
function combineSchedules(schedules: Schedule[]): Schedule {
  if (schedules.length === 1) return schedules[0];

  const activities: ScheduleActivity[] = [];
  const calendars:  Calendar[] = [];
  const wbs:        WBSNode[]  = [];
  const calIds = new Set<string>();
  const wbsIds = new Set<string>();
  const warnings: string[] = [];

  let earliestStart  = "";
  let latestFinish   = "";
  let baselineStart  = "";
  let baselineFinish = "";

  for (const s of schedules) {
    activities.push(...s.activities);
    for (const c of s.calendars) {
      if (!calIds.has(c.id)) { calIds.add(c.id); calendars.push(c); }
    }
    for (const w of s.wbs) {
      if (!wbsIds.has(w.id)) { wbsIds.add(w.id); wbs.push(w); }
    }
    warnings.push(...s.warnings);

    if (!earliestStart || (s.project.startDate && s.project.startDate < earliestStart)) {
      earliestStart = s.project.startDate;
    }
    if (!latestFinish || (s.project.finishDate && s.project.finishDate > latestFinish)) {
      latestFinish = s.project.finishDate;
    }
    if (!baselineStart && s.project.baselineStart) baselineStart = s.project.baselineStart;
    if (!baselineFinish || (s.project.baselineFinish && s.project.baselineFinish > baselineFinish)) {
      baselineFinish = s.project.baselineFinish ?? baselineFinish;
    }
  }

  return {
    id: `__portfolio__${schedules.map((s) => s.id).join("|")}`,
    project: {
      id:         "__portfolio__",
      code:       "PORTFOLIO",
      name:       `${schedules.length} schedules · ${activities.length.toLocaleString()} activities`,
      dataDate:   new Date().toISOString(),
      startDate:  earliestStart,
      finishDate: latestFinish,
      baselineStart:  baselineStart  || undefined,
      baselineFinish: baselineFinish || undefined,
      defaultCalendarId: calendars[0]?.id,
      source:     "P6_XER",                 // arbitrary — UI shows "Portfolio"
      importedAt: new Date().toISOString(),
      fileName:   `portfolio (${schedules.length})`,
    },
    activities,
    wbs,
    calendars,
    warnings,
  };
}

// ── Aggregate analytics ─────────────────────────────────────────────────────
function aggregateAnalytics(schedules: Schedule[], overrides?: Map<string, ClassifierOverrideInput>): ScheduleAnalytics {
  const perSchedule = schedules.map((s) => ({
    s,
    cpm:      runCPM(s),
    dcma:     runDCMA(s, runCPM(s)),       // intentionally re-run for clarity
    baseline: runBaseline(s),
    stats:    computeStats(s),
  }));

  // ── CPM aggregate
  const totalFloat = new Map<string, number>();
  const freeFloat  = new Map<string, number>();
  const earlyStart = new Map<string, number>();
  const earlyFinish= new Map<string, number>();
  const lateStart  = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  const critical   = new Set<string>();
  const cpmWarnings: string[] = [];
  let projectFinish = 0;

  for (const r of perSchedule) {
    for (const [k, v] of r.cpm.totalFloat) totalFloat.set(k, v);
    for (const [k, v] of r.cpm.freeFloat)  freeFloat.set(k, v);
    for (const [k, v] of r.cpm.earlyStart) earlyStart.set(k, v);
    for (const [k, v] of r.cpm.earlyFinish)earlyFinish.set(k, v);
    for (const [k, v] of r.cpm.lateStart)  lateStart.set(k, v);
    for (const [k, v] of r.cpm.lateFinish) lateFinish.set(k, v);
    for (const id of r.cpm.critical) critical.add(id);
    cpmWarnings.push(...r.cpm.warnings);
    if (r.cpm.projectFinish > projectFinish) projectFinish = r.cpm.projectFinish;
  }
  const cpm: CPMResult = { totalFloat, freeFloat, earlyStart, earlyFinish, lateStart, lateFinish, critical, warnings: cpmWarnings, projectFinish };

  // ── DCMA aggregate (per-check: union failingIds, status = worst, weighted score)
  const checkIds = perSchedule[0]?.dcma.checks.map((c) => c.id) ?? [];
  const STATUS_RANK: Record<CheckStatus, number> = { fail: 3, warn: 2, pass: 1, "n/a": 0 };
  const checks: DCMACheck[] = checkIds.map((id) => {
    const allFor = perSchedule.map((r) => r.dcma.checks.find((c) => c.id === id)).filter((c): c is DCMACheck => !!c);
    const failingIds = ([] as string[]).concat(...allFor.map((c) => c.failingIds));
    let worst: CheckStatus = "n/a";
    for (const c of allFor) if (STATUS_RANK[c.status] > STATUS_RANK[worst]) worst = c.status;
    const totalAct = perSchedule.reduce((s, r) => s + r.s.activities.length, 0);
    const failingPct = totalAct === 0 ? 0 : (failingIds.length / totalAct) * 100;
    const ref = allFor[0]!;

    // Aggregate numericValue properly per unit. Activity-weighted average for %s and ratios; sum for counts.
    let numericValue: number | undefined;
    if (ref.numericUnit === "%" || ref.numericUnit === "ratio") {
      const num = allFor.reduce((s, c, i) => {
        const w = perSchedule[i].s.activities.length;
        return s + (c.numericValue ?? 0) * w;
      }, 0);
      const denom = perSchedule.reduce((s, r) => s + r.s.activities.length, 0);
      numericValue = denom === 0 ? 0 : num / denom;
    } else if (ref.numericUnit === "count") {
      numericValue = allFor.reduce((s, c) => s + (c.numericValue ?? 0), 0);
    }

    // Display value
    const display = ref.numericUnit === "%"     ? `${(numericValue ?? 0).toFixed(1)}%`
                  : ref.numericUnit === "ratio" ? (numericValue ?? 0).toFixed(3)
                  : ref.numericUnit === "count" ? `${numericValue ?? 0}`
                  : ref.metricValue;

    return {
      id: ref.id, name: ref.name, description: ref.description, threshold: ref.threshold,
      status: worst,
      metricLabel: ref.metricLabel,
      metricValue: display,
      numericValue,
      numericUnit: ref.numericUnit,
      failingPct,
      failingIds,
    };
  });
  const totalActAll = perSchedule.reduce((s, r) => s + r.s.activities.length, 0);
  const overallScore = totalActAll === 0
    ? 0
    : Math.round(perSchedule.reduce((s, r) => s + r.dcma.overallScore * r.s.activities.length, 0) / totalActAll);
  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const dcma: DCMAResult = { checks, overallScore, passCount, warnCount, failCount, totalActivities: totalActAll };

  // ── Baseline aggregate
  const perActivity: ActivityVariance[] = perSchedule.flatMap((r) => r.baseline.perActivity);
  const hasBaseline = perSchedule.some((r) => r.baseline.hasBaseline);
  const finishVars  = perActivity.map((v) => v.finishVarDays);
  const meanFinishVarDays = finishVars.length === 0 ? 0 : Math.round(finishVars.reduce((s, v) => s + v, 0) / finishVars.length);
  // Project-level slip = max across schedules (worst project)
  const projectFinishVarDays = perSchedule.reduce((max, r) => r.baseline.projectFinishVarDays > max ? r.baseline.projectFinishVarDays : max, -Infinity);
  const projectStartVarDays  = perSchedule.reduce((min, r) => r.baseline.projectStartVarDays  < min ? r.baseline.projectStartVarDays  : min,  Infinity);
  const worstSlippages = [...perActivity].sort((a, b) => b.finishVarDays - a.finishVarDays).slice(0, 10);
  const baseline: BaselineVariance = {
    perActivity,
    projectStartVarDays:  isFinite(projectStartVarDays) ? projectStartVarDays : 0,
    projectFinishVarDays: isFinite(projectFinishVarDays) ? projectFinishVarDays : 0,
    meanFinishVarDays,
    worstSlippages,
    hasBaseline,
  };

  // ── Stats aggregate
  const stats: PortfolioStats = {
    totalActivities:   perSchedule.reduce((s, r) => s + r.stats.totalActivities,   0),
    completed:         perSchedule.reduce((s, r) => s + r.stats.completed,         0),
    inProgress:        perSchedule.reduce((s, r) => s + r.stats.inProgress,        0),
    notStarted:        perSchedule.reduce((s, r) => s + r.stats.notStarted,        0),
    milestones:        perSchedule.reduce((s, r) => s + r.stats.milestones,        0),
    critical:          critical.size,
    pctComplete:       (() => {
      const dur = perSchedule.reduce((s, r) => s + r.stats.totalActivities * 1, 0); // weight by count
      if (dur === 0) return 0;
      return perSchedule.reduce((s, r) => s + r.stats.pctComplete * r.stats.totalActivities, 0) / dur;
    })(),
    delayedActivities: perSchedule.reduce((s, r) => s + r.stats.delayedActivities, 0),
    earliestStart:     perSchedule.reduce((acc, r) => !acc || (r.stats.earliestStart && r.stats.earliestStart < acc) ? r.stats.earliestStart : acc, ""),
    latestFinish:      perSchedule.reduce((acc, r) => !acc || (r.stats.latestFinish  && r.stats.latestFinish  > acc) ? r.stats.latestFinish  : acc, ""),
    totalDurationDays: perSchedule.reduce((s, r) => s + r.stats.totalDurationDays, 0),
    baselineSlipDays:  baseline.projectFinishVarDays,
  };

  // Achievability: aggregate per-schedule. Overall = activity-weighted baseline preparedness.
  // OnTimeDelivery probability = activity-weighted average. Problem activities = union, top 20 across.
  const totalActAch = perSchedule.reduce((s, r) => s + r.s.activities.length, 0) || 1;
  const ach = perSchedule.map((r) => runAchievability(r.s, r.cpm, r.dcma, r.baseline));
  const overallPrep = Math.round(
    ach.reduce((s, a, i) => s + a.baselinePreparedness.overall * perSchedule[i].s.activities.length, 0) / totalActAch,
  );
  const probOnTime = Math.round(
    ach.reduce((s, a, i) => s + a.onTimeDelivery.probability * perSchedule[i].s.activities.length, 0) / totalActAch,
  );

  // Aggregate problem activities: union top-20 by severity
  const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const allProblems = ach.flatMap((a) => a.problemActivities.top);
  const totalProblems = ach.reduce((s, a) => s + a.problemActivities.total, 0);
  const bySeverity   = { critical: 0, high: 0, medium: 0, low: 0 } as Record<"critical"|"high"|"medium"|"low", number>;
  const byReason     = ach.reduce((acc, a) => {
    for (const k of Object.keys(a.problemActivities.byReason) as (keyof typeof a.problemActivities.byReason)[]) {
      acc[k] = (acc[k] ?? 0) + a.problemActivities.byReason[k];
    }
    return acc;
  }, {} as Record<keyof (typeof ach)[number]["problemActivities"]["byReason"], number>);
  for (const a of ach) {
    bySeverity.critical += a.problemActivities.bySeverity.critical;
    bySeverity.high     += a.problemActivities.bySeverity.high;
    bySeverity.medium   += a.problemActivities.bySeverity.medium;
    bySeverity.low      += a.problemActivities.bySeverity.low;
  }
  const topProblems = [...allProblems]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, 20);

  // Pick representative sub-scores from the worst-prepared schedule
  const worstSchedule = ach.reduce((min, a) => a.baselinePreparedness.overall < min.baselinePreparedness.overall ? a : min, ach[0]);
  const subScores = worstSchedule.baselinePreparedness.subScores;

  const probBand: AchievabilityResult["onTimeDelivery"]["band"] =
    probOnTime >= 80 ? "very-likely" :
    probOnTime >= 60 ? "likely" :
    probOnTime >= 40 ? "uncertain" :
    probOnTime >= 20 ? "unlikely" : "very-unlikely";

  const drivers: string[] = [
    `${perSchedule.length} schedules aggregated · weighted by activity count.`,
    ...worstSchedule.onTimeDelivery.drivers.slice(0, 2),
  ];

  const verdict: AchievabilityResult["baselinePreparedness"]["verdict"] =
    overallPrep >= 85 ? "strong" : overallPrep >= 70 ? "adequate" : overallPrep >= 50 ? "weak" : "poor";

  const headline = (() => {
    switch (verdict) {
      case "strong":   return `Aggregate baseline preparedness — ${overallPrep}/100 across ${perSchedule.length} schedules.`;
      case "adequate": return `Aggregate baseline preparedness — ${overallPrep}/100 across ${perSchedule.length} schedules.`;
      case "weak":     return `Aggregate baseline preparedness — ${overallPrep}/100 across ${perSchedule.length} schedules.`;
      case "poor":     return `Aggregate baseline preparedness — ${overallPrep}/100 across ${perSchedule.length} schedules.`;
    }
  })();

  const achievability: AchievabilityResult = {
    baselinePreparedness: { overall: overallPrep, verdict, headline, subScores },
    onTimeDelivery: {
      probability: probOnTime,
      confidence: ach.every((a) => a.onTimeDelivery.confidence === "high") ? "high" :
                  ach.some((a) => a.onTimeDelivery.confidence === "low") ? "low" : "medium",
      band: probBand,
      headline: `${probOnTime}% likelihood of on-plan delivery (activity-weighted across ${perSchedule.length} schedules).`,
      drivers,
    },
    problemActivities: { total: totalProblems, bySeverity, byReason, top: topProblems },
  };

  // Portfolio-level snapshot: classify each underlying schedule, then pick the
  // majority asset type and highest tier as the headline. Per-schedule
  // snapshots stay available via classifyProject() on /segments.
  const perSnapshots = perSchedule.map((r) => classifyProject(r.s, overrides?.get(r.s.id)));
  const counts = new Map<string, number>();
  for (const sn of perSnapshots) counts.set(sn.assetType, (counts.get(sn.assetType) ?? 0) + 1);
  const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0] as ProjectSnapshot["assetType"];
  const winner = perSnapshots.find((sn) => sn.assetType === dominant)!;
  const tierRank = { A: 3, B: 2, C: 1 } as const;
  const topTier = perSnapshots
    .map((sn) => sn.tier)
    .reduce((max, t) => (tierRank[t] > tierRank[max] ? t : max), "C" as ProjectSnapshot["tier"]);

  const snapshot: ProjectSnapshot = {
    ...winner,
    alternates:     [],
    tier:           topTier,
    tierLabel:      topTier === "A" ? "Tier A — Mega / Complex" : topTier === "B" ? "Tier B — Mid-Scale" : "Tier C — Small / Simple",
    tierRationale:  `portfolio of ${perSchedule.length} schedules · dominant type "${winner.assetLabel}" (${counts.get(dominant)}/${perSchedule.length})`,
    tierStandard:   winner.tierStandard,
    overridden:     false,
    headline:       `${perSchedule.length} schedules · majority ${winner.assetLabel}`,
  };

  return { stats, cpm, dcma, baseline, achievability, snapshot };
}

// ── Public API ─────────────────────────────────────────────────────────────
const portfolioCache = new Map<string, { schedule: Schedule; analytics: ScheduleAnalytics }>();

function overrideFingerprint(schedules: Schedule[], overrides?: Map<string, ClassifierOverrideInput>): string {
  if (!overrides || overrides.size === 0) return "";
  const parts: string[] = [];
  for (const s of schedules) {
    const o = overrides.get(s.id);
    if (o) parts.push(`${s.id}:${o.assetType}:${o.tier}`);
  }
  return parts.sort().join(",");
}

export function getPortfolio(
  schedules: Schedule[],
  overrides?: Map<string, ClassifierOverrideInput>,
): { schedule: Schedule; analytics: ScheduleAnalytics } {
  if (schedules.length === 0) throw new Error("Cannot build portfolio from zero schedules.");
  const fp = overrideFingerprint(schedules, overrides);
  const key = schedules.map((s) => s.id).sort().join("|") + (fp ? `::${fp}` : "");
  const hit = portfolioCache.get(key);
  if (hit) return hit;

  const schedule  = combineSchedules(schedules);
  const analytics: ScheduleAnalytics = (() => {
    if (schedules.length === 1) {
      const s = schedules[0];
      const cpm = runCPM(s);
      const dcma = runDCMA(s, cpm);
      const baseline = runBaseline(s);
      const stats = computeStats(s);
      const achievability = runAchievability(s, cpm, dcma, baseline);
      const snapshot = classifyProject(s, overrides?.get(s.id));
      return { stats, cpm, dcma, baseline, achievability, snapshot };
    }
    return aggregateAnalytics(schedules, overrides);
  })();

  const result = { schedule, analytics };
  portfolioCache.set(key, result);
  return result;
}

export function clearPortfolioCache() {
  portfolioCache.clear();
}
