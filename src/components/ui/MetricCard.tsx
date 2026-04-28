"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  sub?: string;
  formula?: string;
  insight?: string;          // Additional hover insight text
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  accent?: "default" | "red" | "amber" | "green" | "blue";
  large?: boolean;
}

const accentBorder: Record<string, string> = {
  default: "border-border",
  red:     "border-danger/30",
  amber:   "border-warning/30",
  green:   "border-success/30",
  blue:    "border-primary/30",
};

const accentGlow: Record<string, string> = {
  default: "",
  red:     "hover:shadow-glow-red",
  amber:   "hover:shadow-glow-amber",
  green:   "hover:shadow-glow-green",
  blue:    "hover:shadow-glow-blue",
};

const accentBg: Record<string, string> = {
  default: "",
  red:     "group-hover:bg-danger/[0.03]",
  amber:   "group-hover:bg-warning/[0.03]",
  green:   "group-hover:bg-success/[0.03]",
  blue:    "group-hover:bg-primary/[0.03]",
};

const accentValueColor: Record<string, string> = {
  default: "text-text-primary",
  red:     "text-danger",
  amber:   "text-warning",
  green:   "text-success",
  blue:    "text-primary",
};

export function MetricCard({
  label, value, sub, formula, insight,
  trend, trendLabel, accent = "default", large,
}: Props) {
  const [showTip, setShowTip] = useState(false);

  const trendColor =
    trend === "up"   ? "text-success" :
    trend === "down" ? "text-danger"  : "text-text-secondary";

  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";

  return (
    <div
      className={clsx(
        "group bg-card border rounded-2xl p-5 relative overflow-hidden",
        "transition-all duration-250 ease-spring",
        "hover:-translate-y-1 hover:shadow-card-hover cursor-default",
        accentBorder[accent],
        accentGlow[accent],
      )}
    >
      {/* Subtle top-edge gradient */}
      <div
        className={clsx(
          "absolute inset-x-0 top-0 h-px opacity-60 transition-opacity group-hover:opacity-100",
          accent === "red"    ? "bg-gradient-to-r from-transparent via-danger/50 to-transparent" :
          accent === "amber"  ? "bg-gradient-to-r from-transparent via-warning/50 to-transparent" :
          accent === "green"  ? "bg-gradient-to-r from-transparent via-success/50 to-transparent" :
          accent === "blue"   ? "bg-gradient-to-r from-transparent via-primary/50 to-transparent" :
                                "bg-gradient-to-r from-transparent via-border to-transparent",
        )}
      />

      {/* Background tint on hover */}
      <div className={clsx("absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 pointer-events-none", accentBg[accent])} />

      <div className={clsx("relative", accentBg[accent])}>
        {/* Label row */}
        <div className="flex items-start justify-between mb-3">
          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-none">
            {label}
          </span>
          {formula && (
            <button
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="text-text-muted hover:text-primary transition-colors"
            >
              <Info size={13} />
            </button>
          )}
        </div>

        {/* Value */}
        <div
          className={clsx(
            "font-bold metric-value tracking-tight leading-none",
            large ? "text-3xl" : "text-2xl",
            accentValueColor[accent],
          )}
        >
          {value}
        </div>

        {sub && (
          <div className="text-xs text-text-secondary mt-1.5 leading-snug">{sub}</div>
        )}

        {trendLabel && (
          <div className={clsx("flex items-center gap-1 text-xs mt-2.5 font-medium", trendColor)}>
            <span>{trendArrow}</span>
            <span>{trendLabel}</span>
          </div>
        )}

        {/* Hover insight bar */}
        {insight && (
          <div className="overflow-hidden max-h-0 group-hover:max-h-20 transition-all duration-300 mt-0 group-hover:mt-3">
            <div className={clsx(
              "pt-3 border-t text-xs text-text-secondary leading-relaxed",
              accent === "red" ? "border-danger/20" : accent === "amber" ? "border-warning/20" : "border-border",
            )}>
              {insight}
            </div>
          </div>
        )}
      </div>

      {/* Formula tooltip */}
      {showTip && formula && (
        <div className="absolute top-full left-0 mt-2 z-50 insight-card w-72 animate-scale-in">
          <div className="text-[10px] text-primary uppercase tracking-wider mb-1.5 font-semibold">Calculation</div>
          <div className="text-xs text-text-secondary leading-relaxed">{formula}</div>
        </div>
      )}
    </div>
  );
}
