"use client";
import Link from "next/link";
import {
  ShieldCheck, Activity, GitBranch, TrendingDown,
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

export function PMODashboard({ schedule, analytics }: { schedule: Schedule; analytics: ScheduleAnalytics }) {
  const { stats, cpm, dcma, baseline } = analytics;

  const cards = [
    { label: "Activities",   value: stats.totalActivities, hint: `${stats.completed} done · ${stats.inProgress} in-progress`, href: "/activities?filter=all&title=All%20Activities" },
    { label: "DCMA Score",   value: `${dcma.overallScore}/100`, hint: `${dcma.failCount} failing checks`, danger: dcma.failCount > 3, href: "/dcma/CP_TEST" },
    { label: "% Complete",   value: `${stats.pctComplete.toFixed(1)}%`, hint: "duration-weighted",   href: "/activities?filter=inProgress&title=In%20Progress" },
    { label: "Schedule Slip",value: `${baseline.projectFinishVarDays >= 0 ? "+" : ""}${baseline.projectFinishVarDays}d`, hint: "vs baseline", danger: baseline.projectFinishVarDays > 7, href: "/activities?filter=delayed&title=Delayed%20Activities" },
  ];

  const worst = baseline.worstSlippages
    .map((v) => ({ ...v, activity: schedule.activities.find((a) => a.id === v.id) }))
    .filter((v) => v.activity && v.finishVarDays > 0);

  const criticalActs = schedule.activities
    .filter((a) => cpm.critical.has(a.id))
    .sort((a, b) => (cpm.totalFloat.get(a.id) ?? 0) - (cpm.totalFloat.get(b.id) ?? 0))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      {/* 4-card KPI strip — all clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`block bg-card border ${"danger" in c && c.danger ? "border-danger/40" : "border-border"} rounded-2xl p-5 hover:-translate-y-0.5 transition-transform`}
          >
            <div className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-2">{c.label}</div>
            <div className={`text-3xl font-bold font-mono ${"danger" in c && c.danger ? "text-danger" : "text-text-primary"}`}>
              {c.value}
            </div>
            <div className="text-[11px] text-text-secondary mt-2">{c.hint}</div>
          </Link>
        ))}
      </div>

      {/* Project snapshot */}
      <ProjectSnapshotPanel snapshot={analytics.snapshot} />

      {/* Achievability */}
      <AchievabilityPanel schedule={schedule} achievability={analytics.achievability} />

      {/* Benchmark intelligence */}
      <BenchmarkPanel schedule={schedule} analytics={analytics} />


      {/* Activity status distribution */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">Activity Status</span>
          </div>
          <span className="text-xs text-text-secondary">{stats.totalActivities.toLocaleString()} total</span>
        </div>
        <div className="flex rounded-full overflow-hidden h-2.5 mb-4">
          <div className="bg-success" style={{ width: `${(stats.completed/stats.totalActivities)*100}%` }} />
          <div className="bg-primary" style={{ width: `${(stats.inProgress/stats.totalActivities)*100}%` }} />
          <div className="bg-border"  style={{ width: `${(stats.notStarted/stats.totalActivities)*100}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Completed",   count: stats.completed,  bg: "bg-success/8 border-success/20", color: "text-success", href: "/activities?filter=completed&title=Completed%20Activities" },
            { label: "In Progress", count: stats.inProgress, bg: "bg-primary/8 border-primary/20", color: "text-primary", href: "/activities?filter=inProgress&title=In%20Progress" },
            { label: "Not Started", count: stats.notStarted, bg: "bg-overlay/[0.03] border-border", color: "text-text-secondary", href: "/activities?filter=notStarted&title=Not%20Started" },
          ].map((row) => (
            <Link key={row.label} href={row.href} className={`flex items-center justify-between rounded-xl border px-4 py-3 hover:-translate-y-0.5 transition-transform ${row.bg}`}>
              <div className="text-xs font-semibold text-text-primary">{row.label}</div>
              <div className={`text-2xl font-bold font-mono ${row.color}`}>{row.count}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* DCMA 14-grid */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">DCMA 14-Point Assessment</span>
          </div>
          <div className="text-xs text-text-secondary">
            Overall: <span className={`font-mono font-bold ${
              dcma.overallScore >= 90 ? "text-success" : dcma.overallScore >= 70 ? "text-warning" : "text-danger"
            }`}>{dcma.overallScore}/100</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {dcma.checks.map((c) => {
            const Icon = checkIcon[c.status];
            const clickable = c.failingIds.length > 0;
            return (
              <Link
                key={c.id}
                href={`/dcma/${c.id}`}
                title={`${c.description}\nThreshold: ${c.threshold}\n${c.metricLabel}: ${c.metricValue}${clickable ? `\nClick: ${c.failingIds.length} failing` : ""}`}
                className={`rounded-lg border px-3 py-2.5 transition-all ${checkBadge[c.status]} ${clickable ? "hover:-translate-y-0.5 hover:shadow-sm cursor-pointer" : ""}`}
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

      {/* Worst slippages */}
      {baseline.hasBaseline && worst.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-danger" />
            <span className="text-sm font-semibold text-text-primary">Worst Slippages vs Baseline</span>
            <span className="text-xs text-text-secondary">— top 10 by finish variance</span>
          </div>
          <ul className="divide-y divide-border">
            {worst.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/activity/${v.id}`}
                  className="flex items-center gap-3 py-2 text-xs hover:bg-overlay/[0.03] -mx-3 px-3 rounded-lg transition-colors group"
                >
                  <span className="font-mono text-text-secondary w-24 shrink-0 truncate">{v.activity?.code}</span>
                  <span className="flex-1 truncate text-text-primary group-hover:text-primary transition-colors">{v.activity?.name}</span>
                  <span className="font-mono text-danger shrink-0">+{v.finishVarDays}d finish</span>
                  {v.durationVarDays > 0 && (
                    <span className="font-mono text-warning shrink-0">+{v.durationVarDays}d dur</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Critical path */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-danger" />
          <span className="text-sm font-semibold text-text-primary">Critical Path</span>
          <span className="text-xs text-text-secondary">— total float ≤ 0</span>
        </div>
        <ul className="divide-y divide-border">
          {criticalActs.map((a) => (
            <li key={a.id}>
              <Link
                href={`/activity/${a.id}`}
                className="flex items-center gap-3 py-2 text-xs hover:bg-overlay/[0.03] -mx-3 px-3 rounded-lg transition-colors group"
              >
                <span className="font-mono text-text-secondary w-24 shrink-0 truncate">{a.code}</span>
                <span className="flex-1 truncate text-text-primary group-hover:text-primary transition-colors">{a.name}</span>
                <span className="font-mono text-danger shrink-0">{((cpm.totalFloat.get(a.id) ?? 0)/8).toFixed(1)}d float</span>
              </Link>
            </li>
          ))}
          {cpm.critical.size === 0 && (
            <li className="py-3 text-xs text-text-secondary text-center">No activities on the critical path.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
