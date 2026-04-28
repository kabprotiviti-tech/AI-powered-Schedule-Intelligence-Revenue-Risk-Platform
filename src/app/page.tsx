"use client";
import Link from "next/link";
import { TrendingDown, AlertTriangle, Clock, BarChart3, ChevronRight, ArrowRight, Activity, GitBranch } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { usePersona } from "@/components/layout/PersonaContext";
import { computeStats, ragFromStats } from "@/lib/schedule/stats";
import { EmptyState } from "@/components/ui/EmptyState";

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

export default function PortfolioPage() {
  const { active, all, loading } = useSchedule();
  const { persona } = usePersona();
  const copy = PERSONA_COPY[persona];

  if (loading) {
    return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  }

  if (!active) return <EmptyState />;

  const stats = computeStats(active);
  const rag   = ragFromStats(stats);
  const now   = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Persona-specific card sets
  const ceoCards = [
    { label: "Schedule Slip", value: `${stats.baselineSlipDays >= 0 ? "+" : ""}${stats.baselineSlipDays}d`, hint: "vs baseline finish", danger: stats.baselineSlipDays > 7 },
    { label: "Activities At-Risk", value: stats.delayedActivities, total: stats.totalActivities, hint: "forecasting late finish", danger: stats.delayedActivities > 0 },
    { label: "Critical Path Length", value: stats.critical, hint: `of ${stats.totalActivities} activities`, danger: false },
  ];

  const pmoCards = [
    { label: "Activities", value: stats.totalActivities, hint: `${stats.completed} done · ${stats.inProgress} in-progress` },
    { label: "Milestones", value: stats.milestones, hint: "tracked checkpoints" },
    { label: "% Complete", value: `${stats.pctComplete.toFixed(1)}%`, hint: "duration-weighted" },
    { label: "Schedule Slip", value: `${stats.baselineSlipDays >= 0 ? "+" : ""}${stats.baselineSlipDays}d`, hint: "vs baseline" },
  ];

  const plannerCards = [
    { label: "Critical Activities", value: stats.critical, hint: `${((stats.critical / Math.max(stats.totalActivities,1))*100).toFixed(1)}% of total` },
    { label: "Delayed", value: stats.delayedActivities, hint: "finish > baseline" },
    { label: "Project Span", value: `${stats.totalDurationDays}d`, hint: `${new Date(stats.earliestStart).toLocaleDateString("en-GB")} → ${new Date(stats.latestFinish).toLocaleDateString("en-GB")}` },
    { label: "Calendars", value: active.calendars.length, hint: `${active.wbs.length} WBS nodes` },
  ];

  const cards = persona === "CEO" ? ceoCards : persona === "Planner" ? plannerCards : pmoCards;

  return (
    <div className="max-w-[1360px] mx-auto space-y-8 pb-12">

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
          </p>
        </div>
        <div className="flex items-center gap-2">
          {all.length > 1 && (
            <Link
              href="/upload"
              className="text-xs px-3 py-1.5 rounded-xl border border-border bg-surface text-text-secondary hover:text-text-primary"
            >
              Switch schedule ({all.length})
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

      {/* Persona-specific cards */}
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
            <div className="text-[11px] text-text-secondary mt-2">
              {"total" in c && c.total ? `of ${c.total} · ` : ""}{c.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Activity status breakdown */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">Activity Status Distribution</span>
          </div>
          <span className="text-xs text-text-secondary">
            {stats.totalActivities.toLocaleString()} total
          </span>
        </div>

        <div className="flex rounded-full overflow-hidden h-2.5 mb-4">
          <div className="bg-success" style={{ width: `${(stats.completed/stats.totalActivities)*100}%` }} />
          <div className="bg-primary"  style={{ width: `${(stats.inProgress/stats.totalActivities)*100}%` }} />
          <div className="bg-border"   style={{ width: `${(stats.notStarted/stats.totalActivities)*100}%` }} />
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

      {/* Top critical activities */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-danger" />
          <span className="text-sm font-semibold text-text-primary">Top Critical Activities</span>
          <span className="text-xs text-text-secondary">— total float ≤ 0</span>
        </div>
        <ul className="divide-y divide-border">
          {active.activities
            .filter((a) => a.isCritical)
            .sort((a, b) => (a.totalFloatHours ?? 0) - (b.totalFloatHours ?? 0))
            .slice(0, 8)
            .map((a) => (
              <li key={a.id} className="py-2 flex items-center gap-3 text-xs">
                <span className="font-mono text-text-secondary w-24 shrink-0 truncate">{a.code}</span>
                <span className="flex-1 truncate text-text-primary">{a.name}</span>
                <span className="font-mono text-danger shrink-0">
                  {a.totalFloatHours !== undefined ? `${(a.totalFloatHours/8).toFixed(1)}d float` : "critical"}
                </span>
              </li>
          ))}
          {active.activities.filter((a) => a.isCritical).length === 0 && (
            <li className="py-3 text-xs text-text-secondary text-center">No activities flagged critical.</li>
          )}
        </ul>
      </div>

    </div>
  );
}
