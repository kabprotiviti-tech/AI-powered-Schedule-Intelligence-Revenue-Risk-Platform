"use client";
import Link from "next/link";
import { ArrowUpRight, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { RAGBadge } from "./RAGBadge";
import { formatAED } from "@/lib/calculations";
import type { Project } from "@/lib/types";
import clsx from "clsx";

interface Props {
  project: Project;
  index?: number;
}

const hoverGlow: Record<string, string> = {
  Red:   "card-red-hover",
  Amber: "card-amber-hover",
  Green: "card-green-hover",
};

const revColor: Record<string, string> = {
  Red:   "text-danger",
  Amber: "text-warning",
  Green: "text-success",
};

const spiColor = (spi: number) =>
  spi >= 0.95 ? "#10b981" : spi >= 0.85 ? "#f59e0b" : "#ef4444";

// Stagger classes — up to 8 cards
const staggerClass = ["stagger-1","stagger-2","stagger-3","stagger-4","stagger-5","stagger-6","stagger-7","stagger-8"];

export function ProjectCard({ project: p, index = 0 }: Props) {
  const stagger = staggerClass[Math.min(index, 7)];

  return (
    <Link href={`/projects/${p.id}`} className={clsx("block group", stagger)}>
      <div
        className={clsx(
          "bg-card border border-border rounded-2xl p-5 h-full",
          "transition-all duration-250 ease-spring cursor-pointer",
          "hover:-translate-y-1.5",
          hoverGlow[p.ragStatus],
        )}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors leading-snug truncate">
              {p.name}
            </h3>
            <p className="text-[11px] text-text-secondary mt-0.5 truncate">
              {p.location} · {p.type}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <RAGBadge status={p.ragStatus} size="sm" />
            <ArrowUpRight
              size={13}
              className="text-text-muted group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
            />
          </div>
        </div>

        {/* ── Revenue at risk — CEO number ─────────────────── */}
        <div className="mb-4">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Revenue at Risk</div>
          <div className={clsx("text-2xl font-bold font-mono metric-value", revColor[p.ragStatus])}>
            {formatAED(p.revenueAtRisk)}
          </div>
        </div>

        {/* ── Health bar ───────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider">Health</span>
            <span
              className="text-[11px] font-mono font-semibold"
              style={{ color: p.healthScore >= 75 ? "#10b981" : p.healthScore >= 50 ? "#f59e0b" : "#ef4444" }}
            >
              {p.healthScore}
            </span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bar-animate"
              style={{
                width: `${p.healthScore}%`,
                background: p.healthScore >= 75 ? "#10b981" : p.healthScore >= 50 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>

        {/* ── Key metrics strip ────────────────────────────── */}
        <div className="grid grid-cols-3 gap-1 mb-4">
          {[
            {
              label: "SPI",
              value: p.spi.toFixed(2),
              icon: <TrendingUp size={10} />,
              color: spiColor(p.spi),
            },
            {
              label: "Delay",
              value: p.delayDays > 0 ? `–${p.delayDays}d` : "On time",
              icon: <Clock size={10} />,
              color: p.delayDays > 0 ? "#ef4444" : "#10b981",
            },
            {
              label: "Done",
              value: `${p.percentComplete}%`,
              icon: null,
              color: "#e2e8f0",
            },
          ].map(({ label, value, icon, color }) => (
            <div
              key={label}
              className="bg-surface/60 border border-border/60 rounded-xl px-2 py-2 text-center"
            >
              <div className="flex items-center justify-center gap-0.5 mb-0.5" style={{ color: "#64748b" }}>
                {icon}
                <span className="text-[9px] uppercase tracking-wide">{label}</span>
              </div>
              <div className="text-[12px] font-mono font-bold metric-value" style={{ color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Milestone dots ───────────────────────────────── */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[10px] text-text-muted">Milestones</span>
          <div className="flex items-center gap-1">
            {p.milestones.slice(0, 7).map((m) => (
              <div
                key={m.id}
                className="w-2 h-2 rounded-full transition-transform group-hover:scale-110"
                title={`${m.name}: ${m.status}`}
                style={{
                  background:
                    m.status === "Complete"  ? "#10b981" :
                    m.status === "On Track"  ? "#3b82f6" :
                    m.status === "At Risk"   ? "#f59e0b" : "#ef4444",
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Hover reveal: contractor + top risk ─────────── */}
        <div className="overflow-hidden max-h-0 group-hover:max-h-24 transition-all duration-300">
          <div className="pt-3 border-t border-border/60 space-y-1.5">
            <div className="text-[11px] text-text-secondary">
              <span className="text-text-primary font-medium">{p.contractor}</span>
              {" · "}PM: {p.projectManager}
            </div>
            {p.topRisk && (
              <div className="flex items-start gap-1.5 text-[11px] text-warning/80">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                <span className="leading-snug line-clamp-2">{p.topRisk}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
