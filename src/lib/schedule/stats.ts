// Stats computed directly from a parsed Schedule — no mock data.
import type { Schedule } from "./types";

export interface PortfolioStats {
  totalActivities: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  milestones: number;
  critical: number;
  pctComplete: number;          // weighted by duration
  delayedActivities: number;    // forecast > baseline
  earliestStart: string;
  latestFinish: string;
  totalDurationDays: number;
  baselineSlipDays: number;     // project.finishDate - project.baselineFinish
}

export function computeStats(s: Schedule): PortfolioStats {
  const acts = s.activities;
  const completed  = acts.filter((a) => a.status === "Completed").length;
  const inProgress = acts.filter((a) => a.status === "InProgress").length;
  const notStarted = acts.filter((a) => a.status === "NotStarted").length;
  const milestones = acts.filter((a) => a.isMilestone).length;
  const critical   = acts.filter((a) => a.isCritical).length;

  const totalDuration = acts.reduce((s, a) => s + a.durationHours, 0);
  const completedHrs  = acts.reduce(
    (s, a) => s + a.durationHours * (a.pctComplete / 100),
    0,
  );
  const pctComplete = totalDuration === 0 ? 0 : (completedHrs / totalDuration) * 100;

  const delayed = acts.filter((a) => {
    if (!a.baselineFinish || !a.plannedFinish) return false;
    return new Date(a.plannedFinish).getTime() > new Date(a.baselineFinish).getTime();
  }).length;

  const starts  = acts.map((a) => a.plannedStart).filter(Boolean).sort();
  const finish  = acts.map((a) => a.plannedFinish).filter(Boolean).sort();
  const earliest = starts[0] ?? s.project.startDate;
  const latest   = finish[finish.length - 1] ?? s.project.finishDate;
  const days = earliest && latest
    ? Math.max(0, Math.round((new Date(latest).getTime() - new Date(earliest).getTime()) / 86_400_000))
    : 0;

  const slip = s.project.baselineFinish && s.project.finishDate
    ? Math.round(
        (new Date(s.project.finishDate).getTime() - new Date(s.project.baselineFinish).getTime()) / 86_400_000,
      )
    : 0;

  return {
    totalActivities: acts.length,
    completed,
    inProgress,
    notStarted,
    milestones,
    critical,
    pctComplete,
    delayedActivities: delayed,
    earliestStart: earliest,
    latestFinish: latest,
    totalDurationDays: days,
    baselineSlipDays: slip,
  };
}

export function ragFromStats(s: PortfolioStats): "Red" | "Amber" | "Green" {
  if (s.baselineSlipDays > 30 || s.delayedActivities / Math.max(s.totalActivities, 1) > 0.25) return "Red";
  if (s.baselineSlipDays > 7  || s.delayedActivities / Math.max(s.totalActivities, 1) > 0.10) return "Amber";
  return "Green";
}
