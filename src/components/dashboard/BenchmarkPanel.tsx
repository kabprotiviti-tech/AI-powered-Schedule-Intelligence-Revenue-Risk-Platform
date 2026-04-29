"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Globe, MapPin, Award, AlertTriangle, ChevronDown, BookOpen,
  CheckCircle2, XCircle, Info, ArrowUpRight,
} from "lucide-react";
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
  compact?:  boolean;
}

export function BenchmarkPanel({ schedule, analytics, compact }: Props) {
  const { type, region, setType, setRegion } = useBenchmark();
  const [showPeerAll, setShowPeerAll] = useState(!compact);
  const [showStdAll,  setShowStdAll]  = useState(true);

  const result = useMemo(
    () => compareToBenchmark(schedule, analytics, type, region),
    [schedule, analytics, type, region],
  );

  const v = verdictStyle[result.overallVerdict];
  const stdMetrics = result.metrics.filter((m) => m.standardThreshold);
  const stdPass = stdMetrics.filter((m) => m.standardThreshold!.passed).length;
  const peerMetrics = showPeerAll ? result.metrics : result.topGaps;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={15} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-text-primary">Benchmark Comparison</span>
        </div>
        <div className="flex items-center gap-2">
          <Selector icon={<MapPin size={11} />} value={type}   options={PROJECT_TYPES} onChange={(v) => setType(v as typeof type)} />
          <Selector icon={<Globe size={11} />}  value={region} options={REGIONS}       onChange={(v) => setRegion(v as typeof region)} />
        </div>
      </div>

      {/* SECTION 1 — Standards Compliance (real, sourced) */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={13} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
              Standards Compliance
            </span>
            <span className="text-[10px] text-text-secondary">
              · public-domain thresholds (DCMA · GAO · PMI · AACE)
            </span>
          </div>
          <div className="text-xs">
            <span className={`font-mono font-bold ${stdPass === stdMetrics.length ? "text-success" : stdPass >= stdMetrics.length * 0.6 ? "text-warning" : "text-danger"}`}>
              {stdPass}/{stdMetrics.length}
            </span>
            <span className="text-text-secondary ml-1">passed</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {(showStdAll ? stdMetrics : stdMetrics.slice(0, 4)).map((m) => (
            <StandardRow key={m.id} m={m} />
          ))}
        </div>
        {stdMetrics.length > 4 && (
          <button
            onClick={() => setShowStdAll((v) => !v)}
            className="mt-2 text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            {showStdAll ? "Collapse" : `Show ${stdMetrics.length - 4} more standards`}
            <ChevronDown size={10} className={showStdAll ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        )}
      </div>

      {/* SECTION 2 — Peer Distribution (illustrative) */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-warning" />
            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
              Peer Distribution
            </span>
            <span
              className="text-[10px] text-warning bg-warning/10 border border-warning/30 px-1.5 py-0.5 rounded font-semibold"
              title="The peer-percentile data is plausible reference values, not sourced from a real schedule corpus. Will be replaced when ≥50 customer-uploaded schedules form a live cohort."
            >
              illustrative · v1
            </span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${v.bg}`}>
            <Award size={13} className={v.text} />
            <span className={`text-xs font-bold ${v.text}`}>{v.label}</span>
            <span className={`font-mono text-sm font-bold ${v.text}`}>P{result.overallScore}</span>
          </div>
        </div>

        <div className="text-[11px] text-text-secondary mb-3 leading-relaxed bg-overlay/[0.02] border border-border rounded-lg px-3 py-2">
          <Info size={11} className="inline mr-1 -mt-0.5" />
          Peer quartiles below are reference defaults composed from public industry sources (DCMA TAR, AACE TCM, GAO audits) — not from a live cohort.
          A real percentile rank requires ≥50 anonymised peer schedules. <span className="text-text-primary">Roadmap: customer-corpus mode.</span>
        </div>

        {!showPeerAll && (
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={11} className="text-warning" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Biggest gaps to peer median</span>
          </div>
        )}
        <div className="space-y-1.5">
          {peerMetrics.map((m) => <PeerRow key={m.id} m={m} />)}
        </div>

        <button
          onClick={() => setShowPeerAll((v) => !v)}
          className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
        >
          {showPeerAll ? "Show top gaps only" : `Show all 9 metrics`}
          <ChevronDown size={11} className={showPeerAll ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border text-[10px] text-text-secondary leading-relaxed">
        Standards compliance is computed against published thresholds.
        Peer distribution is illustrative until live cohort connects.
        Last updated: 29 Apr 2026 · v1.
      </div>
    </div>
  );
}

function StandardRow({ m }: { m: MetricComparison }) {
  if (!m.standardThreshold) return null;
  const passed = m.standardThreshold.passed;
  const color = passed ? "text-success" : "text-danger";
  const Icon  = passed ? CheckCircle2 : XCircle;
  const inner = (
    <>
      <Icon size={14} className={`${color} shrink-0`} />
      <div className="min-w-[140px] shrink-0">
        <div className="text-xs font-semibold text-text-primary">{m.label}</div>
        <div className="text-[10px] text-text-secondary truncate">{m.standardSource}</div>
      </div>
      <div className="flex-1 min-w-0 text-[11px] text-text-secondary">
        Threshold: <span className="font-mono">{m.standardThreshold.label}</span>
      </div>
      <span className={`font-mono text-sm font-bold ${color} shrink-0`}>
        {m.yourValue}{m.unit}
      </span>
      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border shrink-0 ${
        passed ? "bg-success/10 text-success border-success/30" : "bg-danger/10 text-danger border-danger/30"
      }`}>
        {passed ? "Pass" : "Fail"}
      </span>
      {m.drillTo && <ArrowUpRight size={11} className="text-text-secondary shrink-0" />}
    </>
  );
  const cls = "flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-overlay/[0.02] transition-colors";
  return m.drillTo
    ? <Link href={m.drillTo} className={`${cls} hover:bg-overlay/[0.04] hover:border-primary/30 group cursor-pointer`}>{inner}</Link>
    : <div className={cls}>{inner}</div>;
}

function PeerRow({ m }: { m: MetricComparison }) {
  const v = verdictStyle[m.verdict];
  const inner = (
    <>
      <div className="min-w-[140px] shrink-0">
        <div className="text-xs font-semibold text-text-primary">{m.label}</div>
        <div className="text-[10px] text-text-secondary">
          you {m.yourValue}{m.unit} · median {m.bench.p50}{m.unit} · best {m.bench.best}{m.unit}
        </div>
      </div>
      <div className="flex-1 h-2 rounded-full bg-overlay/[0.04] relative overflow-hidden">
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
      {m.drillTo && <ArrowUpRight size={11} className="text-text-secondary shrink-0" />}
    </>
  );
  const cls = "flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-overlay/[0.02] transition-colors";
  return m.drillTo
    ? <Link href={m.drillTo} className={`${cls} hover:bg-overlay/[0.04] hover:border-primary/30 cursor-pointer`}>{inner}</Link>
    : <div className={cls}>{inner}</div>;
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
