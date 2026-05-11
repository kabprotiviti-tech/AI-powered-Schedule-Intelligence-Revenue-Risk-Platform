// One-stop analytics bundle for a Schedule.
// Memoised by schedule.id since CPM is O(V·E) and we re-render dashboards often.

import type { Schedule } from "./types";
import { runCPM, type CPMResult }                   from "./cpm";
import { runDCMA, type DCMAResult }                 from "./dcma";
import { runBaseline, type BaselineVariance }       from "./baseline";
import { computeStats, type PortfolioStats }        from "./stats";
import { runAchievability, type AchievabilityResult } from "./achievability";
import { classifyProject, type ProjectSnapshot }      from "./classifier";

export interface ScheduleAnalytics {
  stats:         PortfolioStats;
  cpm:           CPMResult;
  dcma:          DCMAResult;
  baseline:      BaselineVariance;
  achievability: AchievabilityResult;
  snapshot:      ProjectSnapshot;
}

const cache = new Map<string, ScheduleAnalytics>();

export function getAnalytics(s: Schedule): ScheduleAnalytics {
  const cached = cache.get(s.id);
  if (cached) return cached;

  const cpm           = runCPM(s);
  const dcma          = runDCMA(s, cpm);
  const baseline      = runBaseline(s);
  const stats         = computeStats(s);
  const achievability = runAchievability(s, cpm, dcma, baseline);
  const snapshot      = classifyProject(s);

  const result = { stats, cpm, dcma, baseline, achievability, snapshot };
  cache.set(s.id, result);
  return result;
}

export function clearAnalyticsCache(scheduleId?: string) {
  if (scheduleId) cache.delete(scheduleId);
  else cache.clear();
}
