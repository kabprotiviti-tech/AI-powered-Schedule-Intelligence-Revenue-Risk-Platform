"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Target, ShieldCheck, AlertTriangle, ChevronDown, ArrowUpRight,
  CheckCircle2, AlertCircle, XCircle,
} from "lucide-react";
import type { Schedule } from "@/lib/schedule/types";
import type { AchievabilityResult, Verdict, RiskActivity } from "@/lib/schedule/achievability";

const verdictStyle: Record<Verdict, { bg: string; text: string; label: string }> = {
  strong:   { bg: "bg-success/15 border-success/40", text: "text-success", label: "Strong" },
  adequate: { bg: "bg-success/10 border-success/30", text: "text-success", label: "Adequate" },
  weak:     { bg: "bg-warning/15 border-warning/40", text: "text-warning", label: "Weak" },
  poor:     { bg: "bg-danger/15 border-danger/40",   text: "text-danger",  label: "Poor" },
};

const bandStyle: Record<AchievabilityResult["onTimeDelivery"]["band"], { bg: string; text: string; label: string }> = {
  "very-likely":   { bg: "bg-success/15 border-success/40", text: "text-success", label: "Very likely" },
  "likely":        { bg: "bg-success/10 border-success/30", text: "text-success", label: "Likely" },
  "uncertain":     { bg: "bg-warning/15 border-warning/40", text: "text-warning", label: "Uncertain" },
  "unlikely":      { bg: "bg-danger/10 border-danger/30",   text: "text-danger",  label: "Unlikely" },
  "very-unlikely": { bg: "bg-danger/20 border-danger/40",   text: "text-danger",  label: "Very unlikely" },
};

const sevStyle: Record<RiskActivity["severity"], string> = {
  critical: "bg-danger/15 text-danger border-danger/30",
  high:     "bg-warning/15 text-warning border-warning/30",
  medium:   "bg-primary/10 text-primary border-primary/30",
  low:      "bg-overlay/[0.04] text-text-secondary border-border",
};

interface Props {
  schedule:      Schedule;
  achievability: AchievabilityResult;
  compact?:      boolean;   // CEO mode: just headline + top 3 problems
}

export function AchievabilityPanel({ achievability, compact }: Props) {
  const [showAll, setShowAll]  = useState(!compact);
  const { baselinePreparedness, onTimeDelivery, problemActivities } = achievability;
  const prep = verdictStyle[baselinePreparedness.verdict];
  const otd  = bandStyle[onTimeDelivery.band];

  const visibleProblems = compact && !showAll ? problemActivities.top.slice(0, 3) : problemActivities.top;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Target size={15} className="text-primary" />
        <span className="text-sm font-semibold text-text-primary">Achievability Assessment</span>
        <span className="text-xs text-text-secondary">— is this baseline credible? will it deliver on plan?</span>
      </div>

      {/* Two big banners side-by-side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Baseline preparedness */}
        <div className={`rounded-xl border ${prep.bg} px-4 py-3 flex items-center gap-3`}>
          <ShieldCheck size={18} className={`${prep.text} shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] uppercase tracking-wider font-bold ${prep.text}`}>Baseline preparedness</div>
            <div className="text-xs text-text-primary mt-0.5 leading-snug">{baselinePreparedness.headline}</div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-3xl font-bold font-mono ${prep.text}`}>{baselinePreparedness.overall}</div>
            <div className="text-[10px] uppercase tracking-wider text-text-secondary">/ 100</div>
          </div>
        </div>

        {/* On-time delivery */}
        <div className={`rounded-xl border ${otd.bg} px-4 py-3 flex items-center gap-3`}>
          <Target size={18} className={`${otd.text} shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] uppercase tracking-wider font-bold ${otd.text}`}>On-time delivery · {otd.label}</div>
            <div className="text-xs text-text-primary mt-0.5 leading-snug">{onTimeDelivery.headline}</div>
            <div className="text-[10px] text-text-secondary mt-0.5">Confidence: {onTimeDelivery.confidence}</div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-3xl font-bold font-mono ${otd.text}`}>{onTimeDelivery.probability}%</div>
          </div>
        </div>
      </div>

      {/* Drivers */}
      {onTimeDelivery.drivers.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">Why this projection</div>
          <ul className="space-y-1">
            {onTimeDelivery.drivers.map((d, i) => (
              <li key={i} className="text-xs text-text-primary leading-relaxed">• {d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sub-scores (preparedness breakdown) */}
      {showAll && (
        <div className="mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">Preparedness breakdown</div>
          <div className="space-y-1.5">
            {baselinePreparedness.subScores.map((s) => {
              const v = verdictStyle[s.verdict];
              return (
                <div key={s.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-overlay/[0.02]">
                  <div className="min-w-[160px] shrink-0">
                    <div className="text-xs font-semibold text-text-primary">{s.label}</div>
                    <div className="text-[10px] text-text-secondary truncate">{s.source}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-text-secondary leading-snug">{s.rationale}</div>
                  </div>
                  <div className="h-2 w-16 rounded-full bg-overlay/[0.04] overflow-hidden shrink-0">
                    <div
                      className={`h-full ${
                        s.verdict === "strong" || s.verdict === "adequate" ? "bg-success" :
                        s.verdict === "weak"                                ? "bg-warning" :
                                                                              "bg-danger"
                      }`}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border ${v.bg} ${v.text} shrink-0`}>
                    {v.label}
                  </span>
                  <span className="font-mono text-xs text-text-secondary w-8 text-right shrink-0">{s.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Problem activities */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-warning" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              Activities not factored correctly
            </span>
            <span className="text-[10px] text-text-secondary">
              {problemActivities.total} flagged ·
              {" "}<span className="text-danger font-semibold">{problemActivities.bySeverity.critical} critical</span> ·
              {" "}<span className="text-warning font-semibold">{problemActivities.bySeverity.high} high</span>
            </span>
          </div>
        </div>

        {visibleProblems.length === 0 ? (
          <div className="text-xs text-text-secondary py-2">No problem activities flagged.</div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleProblems.map((a) => (
              <li key={a.id} className="py-2.5">
                <Link
                  href={`/activity/${a.id}`}
                  className="flex items-start gap-3 group"
                >
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border shrink-0 mt-0.5 ${sevStyle[a.severity]}`}>
                    {a.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs flex items-center gap-2">
                      <span className="font-mono text-text-secondary truncate max-w-[140px]">{a.code}</span>
                      <span className="text-text-primary truncate group-hover:text-primary transition-colors">{a.name}</span>
                      {a.isOnCriticalPath && (
                        <span className="text-[9px] uppercase tracking-wider text-danger font-bold">CP</span>
                      )}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {a.reasons.map((r, i) => (
                        <li key={i} className="text-[11px] text-text-secondary leading-snug">– {r.detail}</li>
                      ))}
                    </ul>
                  </div>
                  <ArrowUpRight size={12} className="text-text-secondary group-hover:text-primary shrink-0 mt-1" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {compact && problemActivities.top.length > 3 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
          >
            {showAll ? "Show top 3 only" : `Show all ${problemActivities.top.length} flagged`}
            <ChevronDown size={11} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        )}
      </div>
    </div>
  );
}
