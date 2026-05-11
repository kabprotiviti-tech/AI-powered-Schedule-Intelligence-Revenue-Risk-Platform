"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, GitCompare, Check, ArrowUpRight, AlertCircle } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { getPortfolio } from "@/lib/schedule/portfolio";
import { ragFromStats } from "@/lib/schedule/stats";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Schedule } from "@/lib/schedule/types";
import type { ScheduleAnalytics } from "@/lib/schedule/analytics";

interface MetricDef {
  id:    string;
  label: string;
  group: string;
  fmt:  (a: ScheduleAnalytics) => string;
  num:  (a: ScheduleAnalytics) => number;
  // higher is better? for highlighting the best value across schedules
  higherIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  // Volume
  { id: "acts",       label: "Activities",         group: "Volume",      fmt: (a) => a.stats.totalActivities.toLocaleString(),                num: (a) => a.stats.totalActivities, higherIsBetter: true },
  { id: "milestones", label: "Milestones",         group: "Volume",      fmt: (a) => a.stats.milestones.toLocaleString(),                     num: (a) => a.stats.milestones,      higherIsBetter: true },
  { id: "duration",   label: "Project span (days)",group: "Volume",      fmt: (a) => `${a.stats.totalDurationDays}d`,                         num: (a) => a.stats.totalDurationDays, higherIsBetter: false },

  // Progress
  { id: "pctDone",    label: "% complete",         group: "Progress",    fmt: (a) => `${a.stats.pctComplete.toFixed(1)}%`,                    num: (a) => a.stats.pctComplete,        higherIsBetter: true },
  { id: "completed",  label: "Completed",          group: "Progress",    fmt: (a) => a.stats.completed.toLocaleString(),                      num: (a) => a.stats.completed,          higherIsBetter: true },
  { id: "inProg",     label: "In progress",        group: "Progress",    fmt: (a) => a.stats.inProgress.toLocaleString(),                     num: (a) => a.stats.inProgress,         higherIsBetter: true },

  // Quality (DCMA)
  { id: "dcma",       label: "DCMA score",         group: "Quality",     fmt: (a) => `${a.dcma.overallScore}/100`,                            num: (a) => a.dcma.overallScore,        higherIsBetter: true },
  { id: "logicMiss",  label: "Logic compliance %", group: "Quality",     fmt: (a) => `${(100 - (a.dcma.checks.find((c) => c.id === "LOGIC")?.failingPct ?? 0)).toFixed(1)}%`,
                                                                          num: (a) => 100 - (a.dcma.checks.find((c) => c.id === "LOGIC")?.failingPct ?? 0), higherIsBetter: true },
  { id: "fs",         label: "FS relationships %", group: "Quality",     fmt: (a) => `${(a.dcma.checks.find((c) => c.id === "REL_TYPES")?.numericValue ?? 0).toFixed(1)}%`,
                                                                          num: (a) => a.dcma.checks.find((c) => c.id === "REL_TYPES")?.numericValue ?? 0, higherIsBetter: true },
  { id: "hardCstr",   label: "Hard constraints %", group: "Quality",     fmt: (a) => `${(a.dcma.checks.find((c) => c.id === "CONSTRAINTS")?.failingPct ?? 0).toFixed(1)}%`,
                                                                          num: (a) => a.dcma.checks.find((c) => c.id === "CONSTRAINTS")?.failingPct ?? 0, higherIsBetter: false },

  // Critical-path & float
  { id: "critical",   label: "Critical activities", group: "Critical Path", fmt: (a) => a.cpm.critical.size.toLocaleString(),                  num: (a) => a.cpm.critical.size,        higherIsBetter: false },
  { id: "negFloat",   label: "Negative-float activities", group: "Critical Path", fmt: (a) => `${a.dcma.checks.find((c) => c.id === "NEG_FLOAT")?.failingIds.length ?? 0}`,
                                                                          num: (a) => a.dcma.checks.find((c) => c.id === "NEG_FLOAT")?.failingIds.length ?? 0, higherIsBetter: false },
  { id: "highFloat",  label: "High-float activities (>44d)", group: "Critical Path", fmt: (a) => `${a.dcma.checks.find((c) => c.id === "HIGH_FLOAT")?.failingIds.length ?? 0}`,
                                                                          num: (a) => a.dcma.checks.find((c) => c.id === "HIGH_FLOAT")?.failingIds.length ?? 0, higherIsBetter: false },

  // Baseline & execution
  { id: "slip",       label: "Baseline slip (days)", group: "Execution", fmt: (a) => `${a.baseline.projectFinishVarDays >= 0 ? "+" : ""}${a.baseline.projectFinishVarDays}d`,
                                                                          num: (a) => a.baseline.projectFinishVarDays, higherIsBetter: false },
  { id: "cpli",       label: "CPLI",               group: "Execution",   fmt: (a) => `${(a.dcma.checks.find((c) => c.id === "CPLI")?.numericValue ?? 1).toFixed(3)}`,
                                                                          num: (a) => a.dcma.checks.find((c) => c.id === "CPLI")?.numericValue ?? 1, higherIsBetter: true },
  { id: "bei",        label: "BEI",                group: "Execution",   fmt: (a) => `${(a.dcma.checks.find((c) => c.id === "BEI")?.numericValue ?? 1).toFixed(3)}`,
                                                                          num: (a) => a.dcma.checks.find((c) => c.id === "BEI")?.numericValue ?? 1, higherIsBetter: true },

  // Achievability
  { id: "prep",       label: "Baseline preparedness", group: "Achievability", fmt: (a) => `${a.achievability.baselinePreparedness.overall}/100`,
                                                                              num: (a) => a.achievability.baselinePreparedness.overall, higherIsBetter: true },
  { id: "onTime",     label: "On-time delivery %",   group: "Achievability", fmt: (a) => `${a.achievability.onTimeDelivery.probability}%`,
                                                                              num: (a) => a.achievability.onTimeDelivery.probability, higherIsBetter: true },
  { id: "problems",   label: "Problem activities",   group: "Achievability", fmt: (a) => `${a.achievability.problemActivities.total.toLocaleString()}`,
                                                                              num: (a) => a.achievability.problemActivities.total, higherIsBetter: false },
];

const GROUPS = ["Volume", "Progress", "Quality", "Critical Path", "Execution", "Achievability"];

export default function ComparePage() {
  const { all, loading, overrides } = useSchedule();
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  // Pick the first 3 schedules by default once loaded
  const initialIds = useMemo(() => all.slice(0, Math.min(3, all.length)).map((s) => s.id), [all]);
  const ids = pickedIds.length > 0 ? pickedIds : initialIds;
  const picked: Schedule[] = ids.map((id) => all.find((s) => s.id === id)).filter((s): s is Schedule => !!s);

  const analyses = useMemo(
    () => picked.map((s) => ({ schedule: s, analytics: getPortfolio([s], overrides).analytics })),
    [picked, overrides],
  );

  function toggle(id: string) {
    if (ids.includes(id)) {
      if (ids.length <= 1) return;
      setPickedIds(ids.filter((x) => x !== id));
    } else {
      if (ids.length >= 4) return; // reasonable column ceiling
      setPickedIds([...ids, id]);
    }
  }

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0) return <EmptyState />;

  if (all.length < 2) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-center">
        <div className="bg-card border border-warning/30 rounded-2xl p-8">
          <AlertCircle size={28} className="text-warning mx-auto mb-2" />
          <h2 className="text-lg font-bold text-text-primary mb-2">Need at least 2 schedules</h2>
          <p className="text-sm text-text-secondary mb-4">Comparison requires two or more imported schedules.</p>
          <Link href="/upload" className="inline-block text-xs px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90">
            Import another schedule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-12">
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">Compare schedules</span>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <GitCompare size={18} className="text-primary" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Schedule Comparison</h1>
        </div>
        <p className="text-sm text-text-secondary">Side-by-side analytics across {ids.length} of {all.length} imported schedules. Best value highlighted in green.</p>
      </div>

      {/* Pick list */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
          Schedules to compare ({ids.length}/4 max)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {all.map((s) => {
            const sel = ids.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                disabled={!sel && ids.length >= 4}
                className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-all max-w-[260px] disabled:opacity-40 ${
                  sel
                    ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                    : "bg-overlay/[0.04] border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                {sel && <Check size={10} className="shrink-0" />}
                <span className="truncate">{s.project.name}</span>
                <span className="text-[10px] text-text-secondary font-mono shrink-0">·{s.activities.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-overlay/[0.02] border-b border-border">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-text-secondary w-[260px]">Metric</th>
              {analyses.map(({ schedule }) => {
                const stats = ((): { rag: ReturnType<typeof ragFromStats>; act: number } => {
                  const a = analyses.find((x) => x.schedule.id === schedule.id)!;
                  return { rag: ragFromStats(a.analytics.stats), act: a.analytics.stats.totalActivities };
                })();
                const rc = stats.rag === "Red" ? "var(--danger)" : stats.rag === "Amber" ? "var(--warning)" : "var(--success)";
                return (
                  <th key={schedule.id} className="text-left py-3 px-4 font-medium" style={{ minWidth: 200 }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: rc }} />
                      <span className="text-text-primary truncate">{schedule.project.name}</span>
                    </div>
                    <div className="text-[10px] text-text-secondary mt-0.5 font-normal">
                      {schedule.project.source.replace("_", " ")} · {stats.act.toLocaleString()} activities
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <GroupSection key={group} group={group} analyses={analyses} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-schedule deep-link */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {analyses.map(({ schedule }) => (
          <Link
            key={schedule.id}
            href={`/`}
            className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
            title="Open this schedule on the dashboard"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-primary truncate">{schedule.project.name}</div>
              <div className="text-[10px] text-text-secondary">Open on dashboard</div>
            </div>
            <ArrowUpRight size={13} className="text-primary shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function GroupSection({ group, analyses }: { group: string; analyses: { schedule: Schedule; analytics: ScheduleAnalytics }[] }) {
  const metrics = METRICS.filter((m) => m.group === group);
  if (metrics.length === 0) return null;
  return (
    <>
      <tr className="border-b border-border bg-overlay/[0.02]">
        <td colSpan={analyses.length + 1} className="py-2 px-4 text-[10px] uppercase tracking-wider text-text-secondary font-bold">
          {group}
        </td>
      </tr>
      {metrics.map((m) => {
        const values = analyses.map((a) => m.num(a.analytics));
        const best = m.higherIsBetter ? Math.max(...values) : Math.min(...values);
        return (
          <tr key={m.id} className="border-b border-border last:border-0 hover:bg-overlay/[0.02] transition-colors">
            <td className="py-2 px-4 text-text-secondary">{m.label}</td>
            {analyses.map(({ schedule, analytics }) => {
              const v = m.num(analytics);
              const isBest = analyses.length > 1 && Math.abs(v - best) < 1e-6;
              return (
                <td key={schedule.id} className="py-2 px-4">
                  <span className={`font-mono text-sm ${isBest ? "text-success font-bold" : "text-text-primary"}`}>
                    {m.fmt(analytics)}
                  </span>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
