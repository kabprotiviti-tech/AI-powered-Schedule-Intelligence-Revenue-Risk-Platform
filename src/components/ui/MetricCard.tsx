"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  sub?: string;
  formula?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  accent?: "default" | "red" | "amber" | "green" | "blue";
  large?: boolean;
}

export function MetricCard({ label, value, sub, formula, trend, trendLabel, accent = "default", large }: Props) {
  const [showFormula, setShowFormula] = useState(false);

  const accentMap = {
    default: "border-border",
    red: "border-danger/30 glow-red",
    amber: "border-warning/30 glow-amber",
    green: "border-success/30 glow-green",
    blue: "border-primary/30",
  };

  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-text-secondary";

  return (
    <div className={clsx("bg-card border rounded-xl p-5 relative", accentMap[accent])}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</span>
        {formula && (
          <button
            onMouseEnter={() => setShowFormula(true)}
            onMouseLeave={() => setShowFormula(false)}
            className="text-text-muted hover:text-primary transition-colors"
          >
            <Info size={13} />
          </button>
        )}
      </div>

      <div className={clsx("font-bold text-text-primary", large ? "text-3xl" : "text-2xl")}>{value}</div>

      {sub && <div className="text-xs text-text-secondary mt-1">{sub}</div>}

      {trendLabel && (
        <div className={clsx("text-xs mt-2 font-medium", trendColor)}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendLabel}
        </div>
      )}

      {showFormula && formula && (
        <div className="absolute top-full left-0 mt-2 z-50 nexus-tooltip w-72">
          <div className="text-[10px] text-primary uppercase tracking-wider mb-1 font-semibold">Formula</div>
          <div className="text-xs text-text-secondary leading-relaxed">{formula}</div>
        </div>
      )}
    </div>
  );
}
