// One-stop analytics bundle for a Schedule.
// Memoised by schedule.id since CPM is O(V·E) and we re-render dashboards often.

import type { Schedule } from "./types";
import { runCPM, type CPMResult }                   from "./cpm";
import { runDCMA, type DCMAResult }                 from "./dcma";
import { runBaseline, type BaselineVariance }       from "./baseline";
import { computeStats, type PortfolioStats }        from "./stats";
import { runAchievability, type AchievabilityResult } from "./achievability";
import { classifyProject, type ProjectSnapshot, type ClassifierOverrideInput } from "./classifier";
import { runEVM, type EVMResult } from "./evm";

export interface ScheduleAnalytics {
  stats:         PortfolioStats;
  cpm:           CPMResult;
  dcma:          DCMAResult;
  baseline:      BaselineVariance;
  achievability: AchievabilityResult;
  snapshot:      ProjectSnapshot;
  evm:           EVMResult;
}

// Cache key includes override fingerprint so changing the override
// invalidates the snapshot but not the heavy CPM/DCMA bundle.
const cache = new Map<string, ScheduleAnalytics>();
function cacheKey(s: Schedule, ov?: ClassifierOverrideInput) {
  return ov ? `${s.id}::${ov.assetType}::${ov.tier}` : s.id;
}

export function getAnalytics(s: Schedule, override?: ClassifierOverrideInput): ScheduleAnalytics {
  const key = cacheKey(s, override);
  const cached = cache.get(key);
  if (cached) return cached;

  const cpm           = runCPM(s);
  const dcma          = runDCMA(s, cpm);
  const baseline      = runBaseline(s);
  const stats         = computeStats(s);
  const achievability = runAchievability(s, cpm, dcma, baseline);
  const snapshot      = classifyProject(s, override);
  const evm           = runEVM(s);

  const result = { stats, cpm, dcma, baseline, achievability, snapshot, evm };
  cache.set(key, result);
  return result;
}

export function clearAnalyticsCache(scheduleId?: string) {
  if (!scheduleId) { cache.clear(); return; }
  for (const k of cache.keys()) if (k === scheduleId || k.startsWith(`${scheduleId}::`)) cache.delete(k);
}
