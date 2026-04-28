// Baseline-vs-current variance, per activity and project.
import type { Schedule, ScheduleActivity } from "./types";

const MS_DAY = 86_400_000;

export interface ActivityVariance {
  id: string;
  startVarDays:  number;   // current.start  - baseline.start  (positive = late)
  finishVarDays: number;   // current.finish - baseline.finish
  durationVarDays: number; // current.dur    - baseline.dur
}

export interface BaselineVariance {
  perActivity: ActivityVariance[];
  projectStartVarDays:  number;
  projectFinishVarDays: number;
  meanFinishVarDays:    number;
  worstSlippages: ActivityVariance[];   // top 10 by finishVarDays desc
  hasBaseline: boolean;
}

function days(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0;
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / MS_DAY);
}

export function runBaseline(s: Schedule): BaselineVariance {
  const hasBaseline = s.activities.some((a) => a.baselineStart || a.baselineFinish);
  if (!hasBaseline) {
    return {
      perActivity: [],
      projectStartVarDays: 0,
      projectFinishVarDays: 0,
      meanFinishVarDays: 0,
      worstSlippages: [],
      hasBaseline: false,
    };
  }

  const perActivity: ActivityVariance[] = s.activities.map((a) => {
    const startVar  = days(a.plannedStart,  a.baselineStart);
    const finishVar = days(a.plannedFinish, a.baselineFinish);
    const dur     = (a.durationHours || 0) / 8;
    const baseDur = a.baselineStart && a.baselineFinish
      ? Math.round((new Date(a.baselineFinish).getTime() - new Date(a.baselineStart).getTime()) / MS_DAY)
      : 0;
    return {
      id: a.id,
      startVarDays: startVar,
      finishVarDays: finishVar,
      durationVarDays: Math.round(dur - baseDur),
    };
  });

  const finishVars = perActivity.map((v) => v.finishVarDays);
  const mean = finishVars.length === 0
    ? 0
    : Math.round(finishVars.reduce((s, v) => s + v, 0) / finishVars.length);

  const worst = [...perActivity]
    .sort((a, b) => b.finishVarDays - a.finishVarDays)
    .slice(0, 10);

  const projStart = days(s.project.startDate,  s.project.baselineStart);
  const projFin   = days(s.project.finishDate, s.project.baselineFinish);

  return {
    perActivity,
    projectStartVarDays: projStart,
    projectFinishVarDays: projFin,
    meanFinishVarDays: mean,
    worstSlippages: worst,
    hasBaseline: true,
  };
}
