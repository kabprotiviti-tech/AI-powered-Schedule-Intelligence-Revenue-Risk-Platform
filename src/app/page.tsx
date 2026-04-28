"use client";
import { PROJECTS } from "@/lib/data/mock";
import { computePortfolioMetrics, formatAED } from "@/lib/calculations";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { EscalationQueue } from "@/components/portfolio/EscalationQueue";
import Link from "next/link";
import { TrendingDown, AlertTriangle, Clock, BarChart3, ChevronRight, ArrowRight } from "lucide-react";
import { usePersona } from "@/components/layout/PersonaContext";

const PERSONA_COPY = {
  CEO:     { title: "Executive Portfolio",   sub: "Revenue exposure & critical projects only" },
  PMO:     { title: "Portfolio Intelligence", sub: "Governance, milestones, escalation queue" },
  Planner: { title: "Schedule Operations",    sub: "All projects ranked by schedule slip" },
} as const;

export default function PortfolioPage() {
  const { persona } = usePersona();
  const copy = PERSONA_COPY[persona];

  // Persona-driven sort/filter
  const PERSONA_PROJECTS = (() => {
    if (persona === "CEO") {
      return [...PROJECTS]
        .filter((p) => p.ragStatus !== "Green")
        .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
    }
    if (persona === "Planner") {
      return [...PROJECTS].sort((a, b) => b.delayDays - a.delayDays);
    }
    return [...PROJECTS].sort((a, b) => {
      const rank = { Red: 0, Amber: 1, Green: 2 };
      if (rank[a.ragStatus] !== rank[b.ragStatus]) return rank[a.ragStatus] - rank[b.ragStatus];
      return b.revenueAtRisk - a.revenueAtRisk;
    });
  })();
  const SORTED = PERSONA_PROJECTS;
  const m = computePortfolioMetrics(PROJECTS);
  const red   = PROJECTS.filter((p) => p.ragStatus === "Red");
  const amber = PROJECTS.filter((p) => p.ragStatus === "Amber");
  const green = PROJECTS.filter((p) => p.ragStatus === "Green");
  const redAED   = red.reduce((s, p) => s + p.revenueAtRisk, 0);
  const amberAED = amber.reduce((s, p) => s + p.revenueAtRisk, 0);
  const greenAED = green.reduce((s, p) => s + p.revenueAtRisk, 0);
  const avgDelay = Math.round(PROJECTS.reduce((s, p) => s + p.delayDays, 0) / PROJECTS.length);
  const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-[1360px] mx-auto space-y-8 pb-12">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pt-1 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">{copy.title}</h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-primary font-semibold">
              {persona} View
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {now} · {SORTED.length} of {PROJECTS.length} projects · {copy.sub}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-xl border border-border bg-surface text-text-secondary font-medium">
            Q2 2026
          </span>
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
          >
            All Projects
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* ── CEO Hero: 3 numbers ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Revenue at risk */}
        <div className="hero-num bg-card rounded-2xl border border-danger/30 p-6 relative overflow-hidden glow-red group cursor-default">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-danger/60 to-transparent" />
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-danger/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg bg-danger/15 border border-danger/25">
              <TrendingDown size={14} className="text-danger" />
            </span>
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Revenue at Risk</span>
          </div>
          <div className="text-4xl font-bold text-danger font-mono metric-value leading-none">
            {formatAED(m.totalRevenueAtRisk)}
          </div>
          <div className="text-xs text-text-secondary mt-2">
            Across {red.length + amber.length} projects · {((m.totalRevenueAtRisk / m.totalBudget) * 100).toFixed(1)}% of portfolio budget
          </div>
        </div>

        {/* Critical projects */}
        <div className="hero-num-2 bg-card rounded-2xl border border-warning/30 p-6 relative overflow-hidden glow-amber group cursor-default">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-warning/60 to-transparent" />
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-warning/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg bg-warning/15 border border-warning/25">
              <AlertTriangle size={14} className="text-warning" />
            </span>
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Projects Off Track</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-warning font-mono metric-value leading-none">{red.length + amber.length}</span>
            <span className="text-sm text-text-secondary">of {PROJECTS.length}</span>
          </div>
          <div className="text-xs text-text-secondary mt-2">
            {red.length} Critical · {amber.length} At Risk · {green.length} On Track
          </div>
        </div>

        {/* Schedule delay */}
        <div className="hero-num-3 bg-card rounded-2xl border border-border p-6 relative overflow-hidden group cursor-default">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg bg-primary/15 border border-primary/25">
              <Clock size={14} className="text-primary" />
            </span>
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Avg Schedule Slip</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-text-primary font-mono metric-value leading-none">{avgDelay > 0 ? `–${avgDelay}` : `+${Math.abs(avgDelay)}`}</span>
            <span className="text-lg text-text-secondary font-medium">days</span>
          </div>
          <div className="text-xs text-text-secondary mt-2">
            {m.totalDelayedActivities} activities delayed · {m.totalCriticalActivities} on critical path
          </div>
        </div>
      </div>

      {/* ── RAG distribution bar ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">Portfolio Health Distribution</span>
          </div>
          <span className="text-xs text-text-secondary">
            Health Score: <span className="font-mono font-semibold text-text-primary">{m.avgHealthScore}/100</span>
          </span>
        </div>

        {/* Stacked bar */}
        <div className="flex rounded-full overflow-hidden h-2.5 mb-4 gap-0.5">
          <div
            className="bg-danger h-full rounded-l-full transition-all bar-animate"
            style={{ width: `${(red.length / PROJECTS.length) * 100}%` }}
            title={`Critical: ${red.length}`}
          />
          <div
            className="bg-warning h-full transition-all bar-animate"
            style={{ width: `${(amber.length / PROJECTS.length) * 100}%`, animationDelay: "0.1s" }}
            title={`At Risk: ${amber.length}`}
          />
          <div
            className="bg-success h-full rounded-r-full transition-all bar-animate"
            style={{ width: `${(green.length / PROJECTS.length) * 100}%`, animationDelay: "0.2s" }}
            title={`On Track: ${green.length}`}
          />
        </div>

        {/* RAG legend rows */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Critical",  count: red.length,   aed: redAED,   color: "#ef4444", bg: "bg-danger/8  border-danger/20",  textColor: "text-danger" },
            { label: "At Risk",   count: amber.length, aed: amberAED, color: "#f59e0b", bg: "bg-warning/8 border-warning/20", textColor: "text-warning" },
            { label: "On Track",  count: green.length, aed: greenAED, color: "#10b981", bg: "bg-success/8 border-success/20", textColor: "text-success" },
          ].map(({ label, count, aed, color, bg, textColor }) => (
            <div key={label} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${bg}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <div>
                  <div className="text-xs font-semibold text-text-primary">{label}</div>
                  <div className="text-[11px] text-text-secondary">{formatAED(aed)}</div>
                </div>
              </div>
              <div className={`text-3xl font-bold font-mono ${textColor}`}>{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Project grid + sidebar ───────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-start">

        {/* Project cards: 3-col within the 4-col grid */}
        <div className="xl:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Projects — {persona === "CEO" ? "At-Risk by Revenue" : persona === "Planner" ? "By Schedule Slip" : "Severity Order"}
            </h2>
            <Link
              href="/projects"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              View all
              <ChevronRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SORTED.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
        </div>

        {/* Right sidebar: escalation queue */}
        <div className="xl:col-span-1 space-y-4">
          <div className="animate-slide-in-right" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-text-primary">Escalation Queue</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/25 font-semibold">
                {red.length + amber.length}
              </span>
            </div>
            <EscalationQueue projects={PROJECTS} />
          </div>

          {/* SPI benchmarks */}
          <div className="bg-card border border-border rounded-2xl p-4 animate-slide-in-right" style={{ animationDelay: "0.3s" }}>
            <h3 className="text-xs font-semibold text-text-primary mb-3">SPI Benchmarks</h3>
            <div className="space-y-2.5">
              {[...PROJECTS].sort((a, b) => a.spi - b.spi).map((p) => {
                const color = p.spi >= 0.95 ? "#10b981" : p.spi >= 0.85 ? "#f59e0b" : "#ef4444";
                return (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2.5 group">
                    <div className="w-[72px] text-[11px] text-text-secondary truncate group-hover:text-primary transition-colors shrink-0">
                      {p.name.split("—")[0].trim().split(" ").slice(0, 2).join(" ")}
                    </div>
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bar-animate"
                        style={{ width: `${Math.min(100, p.spi * 85)}%`, background: color }}
                      />
                    </div>
                    <div className="w-9 text-right text-[11px] font-mono font-semibold shrink-0" style={{ color }}>
                      {p.spi.toFixed(2)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
