"use client";
import { useMemo, useState } from "react";
import { Globe, MapPin, Award, AlertTriangle, ChevronDown, TrendingUp } from "lucide-react";
import type { Schedule } from "@/lib/schedule/types";
import type { ScheduleAnalytics } from "@/lib/schedule/analytics";
import { compareToBenchmark, type MetricComparison, type Verdict } from "@/lib/schedule/comparison";
import { PROJECT_TYPES, REGIONS } from "@/lib/schedule/benchmarks";
import { useBenchmark } from "@/lib/schedule/BenchmarkContext";

const verdictStyle: Record<Verdict, { bg: string; text: string; label: string }> = {
  elite:   { bg: "bg-success/15 border-success/40", text: "text-success", label: "Elite" },
  good:    { bg: "bg-success/10 border-success/30", text: "text-success", label: "Good" },
  average: { bg: "bg-warning/10 border-warning/30", text: "text-warning", label: "Average" },
  below:   { bg: "bg-warning/15 border-warning/40", text: "text-warning", label: "Below avg" },
  poor:    { bg: "bg-danger/15 border-danger/40",   text: "text-danger",  label: "Poor" },
};

interface Props {
  schedule:  Schedule;
  analytics: ScheduleAnalytics;
  compact?:  boolean;          // CEO view shows only headline + top gaps
}

export function BenchmarkPanel({ schedule, analytics, compact }: Props) {
  const { type, region, setType, setRegion } = useBenchmark();
  const [showAll, setShowAll] = useState(!compact);

  const result = useMemo(
    () => compareToBenchmark(schedule, analytics, type, region),
    [schedule, analytics, type, region],
  );

  const v = verdictStyle[result.overallVerdict];
  const visibleMetrics = showAll ? result.metrics : result.topGaps;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={15} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-text-primary">Benchmark Intelligence</span>
          <span className="text-xs text-text-secondary">— peer & global comparison</span>
        </div>
        <div className="flex items-center gap-2">
          <Selector
            icon={<MapPin size={11} />}
            value={type}
            options={PROJECT_TYPES}
            onChange={(v) => setType(v as typeof type)}
          />
          <Selector
            icon={<Globe size={11} />}
            value={region}
            options={REGIONS}
            onChange={(v) => setRegion(v as typeof region)}
          />
        </div>
      </div>

      {/* Verdict banner */}
      <div className={`rounded-xl border ${v.bg} px-4 py-3 mb-4 flex items-center gap-3`}>
        <Award size={18} className={`${v.text} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className={`text-xs uppercase tracking-wider font-bold ${v.text}`}>{v.label}</div>
          <div className="text-sm text-text-primary mt-0.5">{result.headline}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold font-mono ${v.text}`}>{result.overallScore}</div>
          <div className="text-[10px] uppercase tracking-wider text-text-secondary">Percentile</div>
        </div>
      </div>

      {/* Top gaps preview (always shown) */}
      {!showAll && result.topGaps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={12} className="text-warning" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Biggest Gaps to Peer Median</span>
          </div>
          {visibleMetrics.map((m) => <Row key={m.id} m={m} />)}
        </div>
      )}

      {/* Full table */}
      {showAll && (
        <div className="space-y-1.5">
          {visibleMetrics.map((m) => <Row key={m.id} m={m} />)}
        </div>
      )}

      {/* Toggle */}
      <button
        onClick={() => setShowAll((v) => !v)}
        className="mt-4 text-xs text-primary hover:underline flex items-center gap-1"
      >
        {showAll ? "Show top gaps only" : `Show all 9 metrics`}
        <ChevronDown size={11} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
    </div>
  );
}

function Row({ m }: { m: MetricComparison }) {
  const v = verdictStyle[m.verdict];
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-overlay/[0.02]">
      <div className="min-w-[140px] shrink-0">
        <div className="text-xs font-semibold text-text-primary">{m.label}</div>
        <div className="text-[10px] text-text-secondary">
          you {m.yourValue}{m.unit} · median {m.bench.p50}{m.unit} · best {m.bench.best}{m.unit}
        </div>
      </div>
      {/* Percentile bar */}
      <div className="flex-1 h-2 rounded-full bg-overlay/[0.04] relative overflow-hidden">
        {/* Median marker */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-text-secondary/40" />
        <div
          className={`h-full rounded-full ${
            m.verdict === "elite" || m.verdict === "good" ? "bg-success" :
            m.verdict === "average"                       ? "bg-warning" :
                                                            "bg-danger"
          }`}
          style={{ width: `${m.percentileRank}%` }}
        />
      </div>
      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border ${v.bg} ${v.text} shrink-0`}>
        {v.label}
      </span>
      <span className="font-mono text-xs text-text-secondary w-10 text-right shrink-0">P{m.percentileRank}</span>
    </div>
  );
}

function Selector<T extends string>({
  icon, value, options, onChange,
}: {
  icon: React.ReactNode;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-overlay/[0.04] text-xs text-text-secondary cursor-pointer hover:border-primary/40">
      {icon}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-transparent outline-none text-text-primary text-xs"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-card text-text-primary">{o.label}</option>
        ))}
      </select>
    </label>
  );
}
