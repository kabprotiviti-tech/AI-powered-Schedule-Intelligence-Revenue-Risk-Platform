"use client";
import Link from "next/link";
import {
  TrendingDown, AlertTriangle, Clock, BarChart3, ChevronRight, ArrowRight,
  Activity, GitBranch, ShieldCheck, AlertCircle, CheckCircle2, XCircle, MinusCircle,
} from "lucide-react";
import { useMemo } from "react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { usePersona } from "@/components/layout/PersonaContext";
import { getAnalytics } from "@/lib/schedule/analytics";
import { ragFromStats } from "@/lib/schedule/stats";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CheckStatus } from "@/lib/schedule/dcma";

const PERSONA_COPY = {
  CEO:     { title: "Executive Dashboard",   sub: "Schedule risk & financial exposure" },
  PMO:     { title: "Portfolio Intelligence", sub: "Governance, milestones, escalation queue" },
  Planner: { title: "Schedule Operations",    sub: "Activity-level diagnostics & critical path" },
} as const;

const ragColors = {
  Red:   "var(--danger)",
  Amber: "var(--warning)",
  Green: "var(--success)",
} as const;

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

export default function PortfolioPage() {
  const { active, all, loading } = useSchedule();
  const { persona } = usePersona();
  const copy = PERSONA_COPY[persona];

  const analytics = useMemo(() => active ? getAnalytics(active) : null, [active]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (!active || !analytics) return <EmptyState />;

  const { stats, cpm, dcma, baseline } = analytics;
  const rag = ragFromStats(stats);
  const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Persona-specific top KPI strip
  const ceoCards = [
    {
      label: "Schedule Slip",
      value: `${baseline.projectFinishVarDays >= 0 ? "+" : ""}${baseline.projectFinishVarDays}d`,
      hint: baseline.hasBaseline ? "vs baseline finish" : "no baseline imported",
      danger: baseline.projectFinishVarDays > 7,
    },
    {
      label: "DCMA Score",
      value: `${dcma.overallScore}/100`,
      hint: `${dcma.passCount} pass · ${dcma.warnCount} warn · ${dcma.failCount} fail`,
      danger: dcma.overallScore < 70,
    },
    {
      label: "Critical Path",
      value: cpm.critical.size,
      hint: `of ${stats.totalActivities} activities`,
      danger: false,
    },
  ];
  const pmoCards = [
    { label: "Activities", value: stats.totalActivities, hint: `${stats.completed} done · ${stats.inProgress} in-progress` },
    { label: "DCMA Score", value: `${dcma.overallScore}/100`, hint: `${dcma.failCount} failing checks`, danger: dcma.failCount > 3 },
    { label: "% Complete",  value: `${stats.pctComplete.toFixed(1)}%`, hint: "duration-weighted" },
    { label: "Schedule Slip", value: `${baseline.projectFinishVarDays >= 0 ? "+" : ""}${baseline.projectFinishVarDays}d`, hint: "vs baseline" },
  ];
  const plannerCards = [
    { label: "Critical Activities", value: cpm.critical.size, hint: `${((cpm.critical.size / Math.max(stats.totalActivities,1))*100).toFixed(1)}% of total`, danger: cpm.critical.size > 0 },
    { label: "Negative Float", value: dcma.checks.find((c) => c.id === "NEG_FLOAT")?.failingIds.length ?? 0, hint: "logical impossibility", danger: true },
    { label: "Logic Issues", value: dcma.checks.find((c) => c.id === "LOGIC")?.failingIds.length ?? 0, hint: "missing pred/succ" },
    { label: "Slipped Tasks", value: dcma.checks.find((c) => c.id === "MISSED")?.failingIds.length ?? 0, hint: "baseline finish past data date", danger: true },
  ];
  const cards = persona === "CEO" ? ceoCards : persona === "Planner" ? plannerCards : pmoCards;

  // Worst slipping activities
  const worstSlippages = baseline.worstSlippages
    .map((v) => ({ ...v, activity: active.activities.find((a) => a.id === v.id) }))
    .filter((v) => v.activity && v.finishVarDays > 0);

  return (
    <div className="max-w-[1360px] mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-1 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">{copy.title}</h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-primary font-semibold">
              {persona} View
            </span>
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold"
              style={{ background: `${ragColors[rag]}20`, color: ragColors[rag], border: `1px solid ${ragColors[rag]}40` }}
            >
              {rag}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {now} · <span className="font-medium text-text-primary">{active.project.name}</span> · {copy.sub}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {active.project.source.replace("_"," ")} · imported {new Date(active.project.importedAt).toLocaleDateString()} · data date {new Date(active.project.dataDate).toLocaleDateString()}
            {cpm.warnings.length > 0 && <span className="text-warning ml-2">· {cpm.warnings.length} CPM warnings</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {all.length > 1 && (
            <Link
              href="/upload"
              className="text-xs px-3 py-1.5 rounded-xl border border-border bg-surface text-text-secondary hover:text-text-primary"
            >
              Switch ({all.length})
            </Link>
          )}
          <Link
            href="/upload"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
          >
            Upload
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Persona KPI strip */}
      <div className={`grid gap-4 ${cards.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
        {cards.map((c) => (
          <div
            key={c.label}
            className={`bg-card border ${"danger" in c && c.danger ? "border-danger/40" : "border-border"} rounded-2xl p-5 hover:-translate-y-0.5 transition-transform`}
          >
            <div className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-2">{c.label}</div>
            <div className={`text-3xl font-bold font-mono ${"danger" in c && c.danger ? "text-danger" : "text-text-primary"}`}>
              {c.value}
            </div>
            <div className="text-[11px] text-text-secondary mt-2">{c.hint}</div>
          </div>
        ))}
      </div>

      {/* DCMA 14 panel */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">DCMA 14-Point Assessment</span>
          </div>
          <div className="text-xs text-text-secondary">
            Overall score: <span className={`font-mono font-bold ${
              dcma.overallScore >= 90 ? "text-success" : dcma.overallScore >= 70 ? "text-warning" : "text-danger"
            }`}>{dcma.overallScore}/100</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {dcma.checks.map((c) => {
            const Icon = checkIcon[c.status];
            return (
              <div
                key={c.id}
                title={`${c.description}\nThreshold: ${c.threshold}\n${c.metricLabel}: ${c.metricValue}`}
                className={`rounded-lg border px-3 py-2.5 ${checkBadge[c.status]}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">{c.id}</span>
                </div>
                <div className="text-[11px] font-semibold truncate">{c.name}</div>
                <div className="text-[10px] opacity-80 font-mono mt-0.5">{c.metricValue}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Worst slippages */}
      {baseline.hasBaseline && worstSlippages.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-danger" />
            <span className="text-sm font-semibold text-text-primary">Worst Slippages vs Baseline</span>
            <span className="text-xs text-text-secondary">— top 10 by finish variance</span>
          </div>
          <ul className="divide-y divide-border">
            {worstSlippages.map((v) => (
              <li key={v.id} className="py-2 flex items-center gap-3 text-xs">
                <span className="font-mono text-text-secondary w-24 shrink-0 truncate">{v.activity?.code}</span>
                <span className="flex-1 truncate text-text-primary">{v.activity?.name}</span>
                <span className="font-mono text-danger shrink-0">+{v.finishVarDays}d finish</span>
                {v.durationVarDays > 0 && (
                  <span className="font-mono text-warning shrink-0">+{v.durationVarDays}d duration</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Critical path activities */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-danger" />
          <span className="text-sm font-semibold text-text-primary">Critical Path</span>
          <span className="text-xs text-text-secondary">— total float ≤ 0 from forward/backward pass</span>
        </div>
        <ul className="divide-y divide-border">
          {active.activities
            .filter((a) => cpm.critical.has(a.id))
            .sort((a, b) => (cpm.totalFloat.get(a.id) ?? 0) - (cpm.totalFloat.get(b.id) ?? 0))
            .slice(0, 12)
            .map((a) => (
              <li key={a.id} className="py-2 flex items-center gap-3 text-xs">
                <span className="font-mono text-text-secondary w-24 shrink-0 truncate">{a.code}</span>
                <span className="flex-1 truncate text-text-primary">{a.name}</span>
                <span className="font-mono text-danger shrink-0">
                  {((cpm.totalFloat.get(a.id) ?? 0)/8).toFixed(1)}d float
                </span>
              </li>
          ))}
          {cpm.critical.size === 0 && (
            <li className="py-3 text-xs text-text-secondary text-center">No activities on the critical path.</li>
          )}
        </ul>
      </div>

      {/* Activity status */}
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
            { label: "Completed",   count: stats.completed,  bg: "bg-success/8 border-success/20", color: "text-success" },
            { label: "In Progress", count: stats.inProgress, bg: "bg-primary/8 border-primary/20", color: "text-primary" },
            { label: "Not Started", count: stats.notStarted, bg: "bg-overlay/[0.03] border-border", color: "text-text-secondary" },
          ].map((row) => (
            <div key={row.label} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${row.bg}`}>
              <div className="text-xs font-semibold text-text-primary">{row.label}</div>
              <div className={`text-2xl font-bold font-mono ${row.color}`}>{row.count}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
