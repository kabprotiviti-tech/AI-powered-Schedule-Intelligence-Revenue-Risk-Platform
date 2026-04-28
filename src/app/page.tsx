"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { usePersona } from "@/components/layout/PersonaContext";
import { getAnalytics } from "@/lib/schedule/analytics";
import { ragFromStats } from "@/lib/schedule/stats";
import { EmptyState } from "@/components/ui/EmptyState";
import { CEODashboard }     from "@/components/dashboard/CEODashboard";
import { PMODashboard }     from "@/components/dashboard/PMODashboard";
import { PlannerDashboard } from "@/components/dashboard/PlannerDashboard";

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

  const analytics = useMemo(() => active ? getAnalytics(active) : null, [active]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (!active || !analytics) return <EmptyState />;

  const rag = ragFromStats(analytics.stats);
  const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-[1360px] mx-auto space-y-6 pb-12">
      {/* Header — common to all personas */}
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
            {analytics.cpm.warnings.length > 0 && <span className="text-warning ml-2">· {analytics.cpm.warnings.length} CPM warnings</span>}
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

      {/* Persona-specific composition */}
      {persona === "CEO"     && <CEODashboard     schedule={active} analytics={analytics} />}
      {persona === "PMO"     && <PMODashboard     schedule={active} analytics={analytics} />}
      {persona === "Planner" && <PlannerDashboard schedule={active} analytics={analytics} />}
    </div>
  );
}
