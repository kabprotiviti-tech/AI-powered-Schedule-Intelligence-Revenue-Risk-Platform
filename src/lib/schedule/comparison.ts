// Compare a Schedule's analytics against benchmarks.
// Produces a side-by-side per-metric verdict with percentile rank and gap-to-best.

import type { Schedule } from "./types";
import type { ScheduleAnalytics } from "./analytics";
import { getBenchmark, type BenchmarkValues, type ProjectType, type Region } from "./benchmarks";

export type Verdict = "elite" | "good" | "average" | "below" | "poor";

export interface MetricComparison {
  id: string;
  label: string;
  yourValue: number;
  unit: string;                  // e.g. "/100", "%", "d", "ratio"
  bench: { p25: number; p50: number; p75: number; best: number };
  higherIsBetter: boolean;
  percentileRank: number;        // 0..100
  gapToMedian: number;           // your - p50 (sign indicates direction)
  gapToBest: number;             // your - best
  verdict: Verdict;
  note: string;                  // one-line interpretation
}

export interface ComparisonResult {
  type: ProjectType;
  region: Region;
  overallScore: number;          // 0..100, weighted across all metrics
  overallVerdict: Verdict;
  headline: string;              // one-sentence summary
  metrics: MetricComparison[];
  topGaps: MetricComparison[];   // 3 worst gaps to median
}

function verdictFromPercentile(pct: number): Verdict {
  if (pct >= 90) return "elite";
  if (pct >= 70) return "good";
  if (pct >= 40) return "average";
  if (pct >= 20) return "below";
  return "poor";
}

// Map a value to a percentile (0..100) given p25/p50/p75/best & direction.
function percentile(value: number, b: BenchmarkValues[keyof BenchmarkValues], higherIsBetter: boolean): number {
  // Build sorted anchor table
  const anchors = higherIsBetter
    ? [{ p: 25, v: b.p25 }, { p: 50, v: b.p50 }, { p: 75, v: b.p75 }, { p: 95, v: b.best }]
    : [{ p: 95, v: b.best }, { p: 75, v: b.p75 }, { p: 50, v: b.p50 }, { p: 25, v: b.p25 }];

  // For higherIsBetter ascending values, percentile increases with value.
  // For lowerIsBetter, percentile increases as value decreases.
  const sorted = [...anchors].sort((a, b) =>
    higherIsBetter ? a.v - b.v : b.v - a.v,
  );

  // Sample below the lowest anchor
  if ((higherIsBetter && value <= sorted[0].v) || (!higherIsBetter && value >= sorted[0].v)) {
    return Math.max(0, sorted[0].p - 15);
  }
  // Sample above the highest anchor
  if ((higherIsBetter && value >= sorted[sorted.length - 1].v) || (!higherIsBetter && value <= sorted[sorted.length - 1].v)) {
    return Math.min(100, sorted[sorted.length - 1].p + 5);
  }

  // Linear interpolate between anchors
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i], hi = sorted[i + 1];
    const inRange = higherIsBetter ? (value >= lo.v && value < hi.v) : (value <= lo.v && value > hi.v);
    if (inRange) {
      const span = hi.v - lo.v;
      const t = span === 0 ? 0 : (value - lo.v) / span;
      return Math.round(lo.p + t * (hi.p - lo.p));
    }
  }
  return 50;
}

function noteFor(m: { label: string; yourValue: number; unit: string; bench: { p50: number; best: number }; higherIsBetter: boolean; verdict: Verdict }): string {
  const yours = `${m.yourValue}${m.unit}`;
  const median = `${m.bench.p50}${m.unit}`;
  const best   = `${m.bench.best}${m.unit}`;
  const dir = m.higherIsBetter ? "higher" : "lower";
  switch (m.verdict) {
    case "elite":   return `${yours} — ${dir === "higher" ? "above" : "better than"} best-in-class (${best}).`;
    case "good":    return `${yours} — ahead of peer median (${median}); gap to best ${best}.`;
    case "average": return `${yours} — at peer median (${median}).`;
    case "below":   return `${yours} — behind peer median (${median}); ${dir} is better.`;
    case "poor":    return `${yours} — bottom quartile vs peers (median ${median}).`;
  }
}

export function compareToBenchmark(
  s: Schedule,
  a: ScheduleAnalytics,
  type: ProjectType,
  region: Region,
): ComparisonResult {
  const bench = getBenchmark(type, region);

  // Source metric values from analytics
  const dcmaScore = a.dcma.overallScore;
  const cpPct     = (a.cpm.critical.size / Math.max(s.activities.length, 1)) * 100;
  const highFloatPct = (() => {
    const c = a.dcma.checks.find((x) => x.id === "HIGH_FLOAT");
    return c?.failingPct ?? 0;
  })();
  const logicCheck = a.dcma.checks.find((x) => x.id === "LOGIC");
  const logicCompliancePct = logicCheck ? 100 - logicCheck.failingPct : 100;
  const fsCheck   = a.dcma.checks.find((x) => x.id === "REL_TYPES");
  // metricValue like "94.2%" — parse it
  const fsRelPct  = fsCheck ? parseFloat(fsCheck.metricValue) || 100 : 100;
  const hardCstr  = a.dcma.checks.find((x) => x.id === "CONSTRAINTS");
  const hardCstrPct = hardCstr?.failingPct ?? 0;

  const projDur = Math.max(1, a.stats.totalDurationDays);
  const slipPct = (a.baseline.projectFinishVarDays / projDur) * 100;

  const cpliCheck = a.dcma.checks.find((x) => x.id === "CPLI");
  const cpli      = cpliCheck ? parseFloat(cpliCheck.metricValue) || 1 : 1;
  const beiCheck  = a.dcma.checks.find((x) => x.id === "BEI");
  const bei       = beiCheck ? parseFloat(beiCheck.metricValue) || 1 : 1;

  const rawMetrics: Omit<MetricComparison, "percentileRank" | "gapToMedian" | "gapToBest" | "verdict" | "note">[] = [
    { id: "dcma",   label: "DCMA Score",          yourValue: dcmaScore,        unit: "/100", bench: bench.dcmaScore,           higherIsBetter: true  },
    { id: "cpPct",  label: "Critical Path %",     yourValue: round1(cpPct),    unit: "%",    bench: bench.criticalPathPct,     higherIsBetter: false },
    { id: "high",   label: "High Float %",        yourValue: round1(highFloatPct), unit: "%",bench: bench.highFloatPct,        higherIsBetter: false },
    { id: "logic",  label: "Logic Compliance",    yourValue: round1(logicCompliancePct), unit: "%", bench: bench.logicCompliancePct, higherIsBetter: true  },
    { id: "fs",     label: "FS Relationships",    yourValue: round1(fsRelPct), unit: "%",    bench: bench.fsRelationshipPct,   higherIsBetter: true  },
    { id: "hard",   label: "Hard Constraints",    yourValue: round1(hardCstrPct), unit: "%", bench: bench.hardConstraintPct,   higherIsBetter: false },
    { id: "slip",   label: "Schedule Slip",       yourValue: round1(slipPct),  unit: "%",    bench: bench.scheduleSlipPctOfDur,higherIsBetter: false },
    { id: "cpli",   label: "CPLI",                yourValue: round2(cpli),     unit: "",     bench: bench.cpli,                higherIsBetter: true  },
    { id: "bei",    label: "BEI",                 yourValue: round2(bei),      unit: "",     bench: bench.bei,                 higherIsBetter: true  },
  ];

  const metrics: MetricComparison[] = rawMetrics.map((m) => {
    const pct = percentile(m.yourValue, m.bench, m.higherIsBetter);
    const verdict = verdictFromPercentile(pct);
    const gapMed = round2(m.yourValue - m.bench.p50);
    const gapBest = round2(m.yourValue - m.bench.best);
    return {
      ...m,
      percentileRank: pct,
      gapToMedian: gapMed,
      gapToBest: gapBest,
      verdict,
      note: noteFor({ ...m, verdict }),
    };
  });

  // Overall score = average percentile rank
  const overallScore = Math.round(metrics.reduce((sum, m) => sum + m.percentileRank, 0) / metrics.length);
  const overallVerdict = verdictFromPercentile(overallScore);

  // Top 3 worst gaps (where percentile is lowest)
  const topGaps = [...metrics].sort((a, b) => a.percentileRank - b.percentileRank).slice(0, 3);

  const headline = headlineFor(overallVerdict, type, region);

  return { type, region, overallScore, overallVerdict, headline, metrics, topGaps };
}

function headlineFor(v: Verdict, type: ProjectType, region: Region): string {
  const peers = `peer ${type === "Generic" ? "" : type + " "}schedules in ${region === "Global" ? "the global database" : region}`;
  switch (v) {
    case "elite":   return `Elite — top decile vs ${peers}.`;
    case "good":    return `Above average — better than two-thirds of ${peers}.`;
    case "average": return `Average — broadly aligned with ${peers}.`;
    case "below":   return `Below average — behind most ${peers}.`;
    case "poor":    return `Bottom quartile — significantly behind ${peers}.`;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
