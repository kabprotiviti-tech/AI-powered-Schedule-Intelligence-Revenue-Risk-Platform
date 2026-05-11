"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { usePersona } from "@/components/layout/PersonaContext";
import { getPortfolio } from "@/lib/schedule/portfolio";
import { ragFromStats } from "@/lib/schedule/stats";
import { EmptyState } from "@/components/ui/EmptyState";
import { CEODashboard }     from "@/components/dashboard/CEODashboard";
import { PMODashboard }     from "@/components/dashboard/PMODashboard";
import { PlannerDashboard } from "@/components/dashboard/PlannerDashboard";
import { SchedulePicker }   from "@/components/dashboard/SchedulePicker";

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
  const { selected, all, loading, overrides } = useSchedule();
  const { persona } = usePersona();
  const copy = PERSONA_COPY[persona];

  const portfolio = useMemo(
    () => selected.length > 0 ? getPortfolio(selected, overrides) : null,
    [selected, overrides],
  );

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;

  // No imported schedules at all
  if (all.length === 0) return <EmptyState />;

  // Have imports but nothing selected → still show picker so user can re-select
  if (!portfolio) {
    return (
      <div className="max-w-[1360px] mx-auto space-y-6 pb-12">
        <SchedulePicker />
        <div className="bg-card border border-warning/30 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-bold text-text-primary mb-2">No schedules selected</h2>
          <p className="text-sm text-text-secondary">Pick at least one schedule from the bar above to see analytics.</p>
        </div>
      </div>
    );
  }

  const { schedule, analytics } = portfolio;
  const rag = ragFromStats(analytics.stats);
  const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const isPortfolioMode = selected.length > 1;

  return (
    <div className="max-w-[1360px] mx-auto space-y-6 pb-12">
      {/* Schedule picker — always visible when ≥1 imported */}
      <SchedulePicker />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-1 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">{copy.title}</h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-primary font-semibold">
              {persona} View
            </span>
            {isPortfolioMode && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-border bg-overlay/[0.04] text-text-secondary font-semibold">
                Cumulative · {selected.length} schedules
              </span>
            )}
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold"
              style={{ background: `${ragColors[rag]}20`, color: ragColors[rag], border: `1px solid ${ragColors[rag]}40` }}
            >
              {rag}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {now} · <span className="font-medium text-text-primary">{schedule.project.name}</span> · {copy.sub}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {isPortfolioMode
              ? `${selected.length} schedules · ${analytics.stats.totalActivities.toLocaleString()} activities aggregated`
              : `${schedule.project.source.replace("_"," ")} · imported ${new Date(schedule.project.importedAt).toLocaleDateString()} · data date ${new Date(schedule.project.dataDate).toLocaleDateString()}`}
            {analytics.cpm.warnings.length > 0 && <span className="text-warning ml-2">· {analytics.cpm.warnings.length} CPM warnings</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/upload"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
          >
            Add schedule
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Persona-specific composition (renders against synthetic portfolio when multi-selected) */}
      {persona === "CEO"     && <CEODashboard     schedule={schedule} analytics={analytics} />}
      {persona === "PMO"     && <PMODashboard     schedule={schedule} analytics={analytics} />}
      {persona === "Planner" && <PlannerDashboard schedule={schedule} analytics={analytics} />}
    </div>
  );
}
