"use client";
import Link from "next/link";
import { useMemo } from "react";
import {
  ShieldCheck, GitBranch, Wrench, Layers,
  CheckCircle2, AlertCircle, XCircle, MinusCircle,
} from "lucide-react";
import type { Schedule } from "@/lib/schedule/types";
import type { ScheduleAnalytics } from "@/lib/schedule/analytics";
import type { CheckStatus } from "@/lib/schedule/dcma";
import { BenchmarkPanel } from "./BenchmarkPanel";
import { AchievabilityPanel } from "./AchievabilityPanel";
import { ProjectSnapshotPanel } from "./ProjectSnapshotPanel";

const checkBadge: Record<CheckStatus, string> = {
  pass: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  fail: "bg-danger/15 text-danger border-danger/30",
  "n/a": "bg-overlay/[0.04] text-text-secondary border-border",
};
const checkIcon: Record<CheckStatus, React.ElementType> = {
  pass: CheckCircle2,
  warn: AlertCircle,
  fail: XCircle,
  "n/a": MinusCircle,
};

export function PlannerDashboard({ schedule, analytics }: { schedule: Schedule; analytics: ScheduleAnalytics }) {
  const { stats, cpm, dcma } = analytics;

  const negFloat = dcma.checks.find((c) => c.id === "NEG_FLOAT")?.failingIds.length ?? 0;
  const logic    = dcma.checks.find((c) => c.id === "LOGIC")?.failingIds.length    ?? 0;
  const missed   = dcma.checks.find((c) => c.id === "MISSED")?.failingIds.length   ?? 0;

  // Float distribution buckets
  const buckets = useMemo(() => {
    const b = { "neg":0, "0-5":0, "5-10":0, "10-20":0, "20-44":0, ">44":0 };
    for (const a of schedule.activities) {
      const tfHrs = cpm.totalFloat.get(a.id);
      if (tfHrs == null) continue;
      const tfDays = tfHrs / 8;
      if (tfDays < 0)        b["neg"]   += 1;
      else if (tfDays <= 5)  b["0-5"]   += 1;
      else if (tfDays <= 10) b["5-10"]  += 1;
      else if (tfDays <= 20) b["10-20"] += 1;
      else if (tfDays <= 44) b["20-44"] += 1;
      else                   b[">44"]   += 1;
    }
    return b;
  }, [schedule, cpm]);
  const maxBucket = Math.max(1, ...Object.values(buckets));

  const cards = [
    { label: "Critical",       value: cpm.critical.size, hint: `${((cpm.critical.size / Math.max(stats.totalActivities,1))*100).toFixed(1)}% of activities`, danger: cpm.critical.size > 0, href: "/activities?filter=critical&title=Critical%20Path" },
    { label: "Negative Float", value: negFloat,          hint: "logical impossibility",     danger: negFloat > 0,                                            href: "/activities?filter=negFloat&title=Negative%20Float" },
    { label: "Logic Issues",   value: logic,             hint: "missing pred/succ",         danger: logic > 0,                                                href: "/dcma/LOGIC" },
    { label: "Slipped Tasks",  value: missed,            hint: "baseline finish in past",   danger: missed > 0,                                               href: "/dcma/MISSED" },
  ];

  // Top 15 critical activities, sorted by lowest float (most critical first)
  const topCritical = schedule.activities
    .filter((a) => cpm.critical.has(a.id))
    .sort((a, b) => (cpm.totalFloat.get(a.id) ?? 0) - (cpm.totalFloat.get(b.id) ?? 0))
    .slice(0, 15);

  // DCMA checks reordered: failing first by % failing
  const orderedChecks = [...dcma.checks].sort((a, b) => {
    const order: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, "n/a": 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.failingPct - a.failingPct;
  });

  return (
    <div className="space-y-6">
      {/* 4-card KPI strip — float-focused, all clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`block bg-card border ${c.danger ? "border-danger/40" : "border-border"} rounded-2xl p-5 hover:-translate-y-0.5 transition-transform`}
          >
            <div className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-2">{c.label}</div>
            <div className={`text-3xl font-bold font-mono ${c.danger ? "text-danger" : "text-text-primary"}`}>
              {c.value}
            </div>
            <div className="text-[11px] text-text-secondary mt-2">{c.hint}</div>
          </Link>
        ))}
      </div>

      {/* Project snapshot */}
      <ProjectSnapshotPanel
        snapshot={analytics.snapshot}
        scheduleId={schedule.id.startsWith("__portfolio__") ? undefined : schedule.id}
      />

      {/* Achievability — most useful for planners since it lists problem activities with reasons */}
      <AchievabilityPanel schedule={schedule} achievability={analytics.achievability} />

      {/* Benchmark intelligence */}
      <BenchmarkPanel schedule={schedule} analytics={analytics} />


      {/* Float distribution */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers size={15} className="text-primary" />
          <span className="text-sm font-semibold text-text-primary">Total Float Distribution</span>
          <span className="text-xs text-text-secondary">— activities by float band</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {(Object.entries(buckets) as [keyof typeof buckets, number][]).map(([k, n]) => {
            const isNeg = k === "neg";
            const isCrit = isNeg || k === "0-5";
            const color = isNeg ? "bg-danger" : k === "0-5" ? "bg-warning" : k === ">44" ? "bg-warning/60" : "bg-primary";
            return (
              <div key={k} className="flex flex-col gap-1">
                <div className={`text-xs font-semibold ${isCrit ? "text-danger" : "text-text-primary"}`}>
                  {n}
                </div>
                <div className="h-20 flex items-end">
                  <div
                    className={`w-full rounded-t ${color} transition-all`}
                    style={{ height: `${(n / maxBucket) * 100}%`, minHeight: n > 0 ? "4px" : "0" }}
                  />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-secondary">
                  {k === "neg" ? "< 0d" : `${k}d`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DCMA grid — fail/warn first */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">DCMA Checks — Issues First</span>
          </div>
          <div className="text-xs text-text-secondary">
            Score: <span className={`font-mono font-bold ${
              dcma.overallScore >= 90 ? "text-success" : dcma.overallScore >= 70 ? "text-warning" : "text-danger"
            }`}>{dcma.overallScore}/100</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {orderedChecks.map((c) => {
            const Icon = checkIcon[c.status];
            const clickable = c.failingIds.length > 0;
            return (
              <Link
                key={c.id}
                href={`/dcma/${c.id}`}
                title={`${c.description}\nThreshold: ${c.threshold}\n${c.metricLabel}: ${c.metricValue}`}
                className={`rounded-lg border px-3 py-2.5 transition-all ${checkBadge[c.status]} ${clickable ? "hover:-translate-y-0.5 hover:shadow-sm" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">{c.id}</span>
                </div>
                <div className="text-[11px] font-semibold truncate">{c.name}</div>
                <div className="text-[10px] opacity-80 font-mono mt-0.5">{c.metricValue}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Top 15 critical activities */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-danger" />
          <span className="text-sm font-semibold text-text-primary">Critical Activities — Float Ascending</span>
          <span className="text-xs text-text-secondary">— top 15</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left py-2 font-medium">Code</th>
              <th className="text-left py-2 font-medium">Activity</th>
              <th className="text-right py-2 font-medium">Duration</th>
              <th className="text-right py-2 font-medium">Float</th>
              <th className="text-right py-2 font-medium">% Done</th>
            </tr>
          </thead>
          <tbody>
            {topCritical.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-overlay/[0.03] transition-colors">
                <td className="py-2 font-mono text-text-secondary">
                  <Link href={`/activity/${a.id}`} className="hover:text-primary">{a.code}</Link>
                </td>
                <td className="py-2 text-text-primary truncate max-w-md">
                  <Link href={`/activity/${a.id}`} className="hover:text-primary">{a.name}</Link>
                </td>
                <td className="py-2 text-right font-mono text-text-secondary">{(a.durationHours / 8).toFixed(1)}d</td>
                <td className="py-2 text-right font-mono text-danger">{((cpm.totalFloat.get(a.id) ?? 0) / 8).toFixed(1)}d</td>
                <td className="py-2 text-right font-mono text-text-secondary">{a.pctComplete.toFixed(0)}%</td>
              </tr>
            ))}
            {topCritical.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-text-secondary">No critical activities.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
