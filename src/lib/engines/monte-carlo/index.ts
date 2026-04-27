import type { IFrameworkEngine, EngineInput, EngineDescriptor } from "../core/interface";
import type { EngineOutput, ValidationResult, ExecutionContext, ActivityIssue, RiskContribution, ScheduleActivity } from "../core/types";
import { CPMEngine } from "../cpm/index";

// ─── Seeded PRNG (Mulberry32 — fast, deterministic) ──────────────────────────

function mulberry32(seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Distribution samplers ───────────────────────────────────────────────────

function samplePERT(a: number, m: number, b: number, rng: () => number): number {
  // PERT via Beta approximation: mean = (a + 4m + b) / 6, std = (b - a) / 6
  const mean   = (a + 4 * m + b) / 6;
  const stdDev = (b - a) / 6;
  // Box-Muller for normal approximation
  const u1 = Math.max(1e-10, rng()), u2 = rng();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(a, Math.min(b, Math.round(mean + z * stdDev)));
}

function sampleTriangular(a: number, m: number, b: number, rng: () => number): number {
  const u  = rng();
  const fc = (m - a) / (b - a);
  if (u < fc) return Math.round(a + Math.sqrt(u * (b - a) * (m - a)));
  return Math.round(b - Math.sqrt((1 - u) * (b - a) * (b - m)));
}

function sampleDuration(activity: ScheduleActivity, rng: () => number): number {
  const base = activity.remaining_duration || activity.planned_duration || 1;
  const a = activity.duration_optimistic  ?? Math.round(base * 0.80);
  const m = activity.duration_most_likely ?? base;
  const b = activity.duration_pessimistic ?? Math.round(base * 1.30);

  switch (activity.duration_distribution) {
    case "PERT":       return samplePERT(a, m, b, rng);
    case "Triangular": return sampleTriangular(a, m, b, rng);
    case "Uniform":    return Math.round(a + rng() * (b - a));
    case "Normal": {
      const stdDev = (b - a) / 4;
      const u1 = Math.max(1e-10, rng()), u2 = rng();
      const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(1, Math.round(m + z * stdDev));
    }
    default: return m;
  }
}

// ─── Spearman rank correlation ───────────────────────────────────────────────

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const rank = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return arr.map((v) => sorted.indexOf(v) + 1);
  };
  const xr = rank(x), yr = rank(y);
  const dSq = xr.reduce((s, r, i) => s + Math.pow(r - yr[i], 2), 0);
  return 1 - (6 * dSq) / (n * (n * n - 1));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IterationResult {
  finish_duration:  number;           // total working days
  critical_path:    Set<string>;      // activity_ids on critical path this iteration
  durations:        Map<string, number>; // sampled duration per activity
}

export interface ConfidenceDate { level: number; label: string; days: number; }
export interface CriticalityRecord { activity_id: string; name: string; external_id: string; sci: number; label: string; }
export interface TornadoItem {
  activity_id: string; name: string; external_id: string;
  sensitivity: number; range_days: number; risk_contribution_pct: number;
  optimistic_finish: number; pessimistic_finish: number;
}
export interface HistogramBin { min_day: number; max_day: number; count: number; cumulative_pct: number; }

export interface MonteCarloOutput extends EngineOutput {
  engine_id: "MONTE_CARLO";
  detail: {
    iterations:              number;
    seed:                    number;
    confidence_dates:        ConfidenceDate[];
    planned_finish_confidence: number;    // % of iterations that finish on time
    p50_days: number; p80_days: number; p90_days: number;
    mean_days:     number;
    std_dev_days:  number;
    min_days:      number;
    max_days:      number;
    criticality_index: CriticalityRecord[];
    tornado:           TornadoItem[];
    histogram:         HistogramBin[];
  };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class MonteCarloEngine implements IFrameworkEngine<EngineInput, MonteCarloOutput> {
  readonly engineId = "MONTE_CARLO" as const;
  readonly version  = "1.0.0";
  private cpm = new CPMEngine();

  validate(input: EngineInput): ValidationResult {
    const errors: string[] = [];
    if (!input.activities?.length) errors.push("activities array is required");
    if (!input.relationships)      errors.push("relationships array is required");
    const n = input.options.mc_iterations ?? 1000;
    if (n < 100 || n > 50_000)     errors.push("mc_iterations must be between 100 and 50,000");
    return { valid: errors.length === 0, errors };
  }

  async execute(input: EngineInput, ctx: ExecutionContext): Promise<MonteCarloOutput> {
    const t0         = Date.now();
    const iterations = input.options.mc_iterations ?? 1000;
    const seed       = input.options.mc_seed       ?? Date.now();
    const levels     = input.options.confidence_levels ?? [0.5, 0.7, 0.8, 0.85, 0.9, 0.95];
    const rng        = mulberry32(seed);

    // ── Run N iterations ──────────────────────────────────────────────────
    const results: IterationResult[] = [];

    for (let i = 0; i < iterations; i++) {
      // Sample durations for every activity
      const sampledActivities = input.activities.map((a) => ({
        ...a,
        remaining_duration: sampleDuration(a, rng),
      }));

      // Run CPM on sampled schedule (sync, no DB write)
      const cpmResult = this.cpm.executeSync({
        ...input,
        activities: sampledActivities,
        options:    { ...input.options, force_recompute: true },
      });

      results.push({
        finish_duration: cpmResult.detail.critical_path_duration as number,
        critical_path:   new Set(cpmResult.detail.critical_path as string[]),
        durations:       new Map(sampledActivities.map((a) => [a.activity_id, a.remaining_duration])),
      });
    }

    // ── Confidence dates ──────────────────────────────────────────────────
    const sortedDays = results.map((r) => r.finish_duration).sort((a, b) => a - b);
    const n          = sortedDays.length;

    const confidenceDates: ConfidenceDate[] = levels.map((level) => ({
      level,
      label:  `P${Math.round(level * 100)}`,
      days:   sortedDays[Math.min(n - 1, Math.ceil(level * n) - 1)],
    }));

    // Planned finish confidence: % of iterations finishing ≤ planned_duration
    const onTimePct = (results.filter((r) => r.finish_duration <= input.planned_duration).length / n) * 100;

    // ── Statistics ────────────────────────────────────────────────────────
    const mean   = sortedDays.reduce((s, d) => s + d, 0) / n;
    const stdDev = Math.sqrt(sortedDays.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / n);
    const p50    = confidenceDates.find((c) => c.label === "P50")?.days ?? mean;
    const p80    = confidenceDates.find((c) => c.label === "P80")?.days ?? mean;
    const p90    = confidenceDates.find((c) => c.label === "P90")?.days ?? mean;

    // ── Schedule Criticality Index (SCI) per activity ─────────────────────
    const activityIds  = input.activities.map((a) => a.activity_id);
    const critCounts   = new Map<string, number>(activityIds.map((id) => [id, 0]));

    for (const { critical_path } of results) {
      for (const id of critical_path) {
        critCounts.set(id, (critCounts.get(id) ?? 0) + 1);
      }
    }

    const criticalityIndex: CriticalityRecord[] = input.activities
      .map((a) => {
        const sci = (critCounts.get(a.activity_id) ?? 0) / n;
        return {
          activity_id: a.activity_id, name: a.name, external_id: a.external_id,
          sci: parseFloat(sci.toFixed(4)),
          label: sci >= 0.9 ? "Always Critical" : sci >= 0.5 ? "Often Critical" : sci >= 0.2 ? "Occasionally" : "Rarely",
        };
      })
      .sort((a, b) => b.sci - a.sci);

    // ── Sensitivity — Spearman correlation (tornado chart) ────────────────
    const finishDays = results.map((r) => r.finish_duration);

    const tornado: TornadoItem[] = input.activities
      .map((a) => {
        const durations = results.map((r) => r.durations.get(a.activity_id) ?? a.remaining_duration);
        const corr = spearmanCorrelation(durations, finishDays);
        const base = a.remaining_duration;
        const optFin  = Math.round(mean - Math.abs(corr) * (base * 0.20));
        const pessFin = Math.round(mean + Math.abs(corr) * (base * 0.30));
        return {
          activity_id: a.activity_id, name: a.name, external_id: a.external_id,
          sensitivity: parseFloat(corr.toFixed(4)),
          range_days:  pessFin - optFin,
          risk_contribution_pct: 0,   // filled below
          optimistic_finish:  optFin,
          pessimistic_finish: pessFin,
        };
      })
      .sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity))
      .slice(0, 20);

    const totalRange = tornado.reduce((s, t) => s + t.range_days, 0) || 1;
    tornado.forEach((t) => {
      t.risk_contribution_pct = parseFloat(((t.range_days / totalRange) * 100).toFixed(1));
    });

    // ── Histogram ────────────────────────────────────────────────────────
    const minDay = sortedDays[0];
    const maxDay = sortedDays[n - 1];
    const binCount = Math.min(30, Math.ceil(Math.sqrt(n)));
    const binWidth = Math.max(1, Math.ceil((maxDay - minDay) / binCount));
    const histogram: HistogramBin[] = [];
    let cumCount = 0;

    for (let b = 0; b < binCount; b++) {
      const lo = minDay + b * binWidth;
      const hi = lo + binWidth;
      const count = sortedDays.filter((d) => d >= lo && d < hi).length;
      cumCount += count;
      histogram.push({ min_day: lo, max_day: hi, count, cumulative_pct: parseFloat(((cumCount / n) * 100).toFixed(1)) });
    }

    // ── Issues — activities with high criticality ─────────────────────────
    const issues: ActivityIssue[] = criticalityIndex
      .filter((c) => c.sci >= 0.5)
      .slice(0, 20)
      .map((c) => {
        const act = input.activities.find((a) => a.activity_id === c.activity_id)!;
        return {
          activity_id: c.activity_id, external_id: c.external_id,
          name: c.name, wbs_code: act?.wbs_code ?? "", engine_id: "MONTE_CARLO" as const,
          issue_code:   "MC_HIGH_CRITICALITY",
          issue_type:   "High Schedule Criticality Index",
          severity:     c.sci >= 0.9 ? "Critical" as const : "High" as const,
          impact:       c.sci,
          schedule_impact_days: Math.round(c.sci * (p90 - p50)),
          cost_impact_aed: 0,
          description:  `${c.external_id} was on the critical path in ${(c.sci * 100).toFixed(0)}% of ${iterations} simulation iterations (SCI = ${c.sci.toFixed(2)}).`,
          evidence:     { sci: c.sci, iterations, critical_in: Math.round(c.sci * n) },
          recommended_action: c.sci >= 0.9
            ? "Activity is effectively always critical. Any delay is a project delay. Prioritise resource allocation and risk mitigation."
            : "Activity frequently drives the critical path. Monitor closely and maintain float buffer.",
        };
      });

    // Risk contributions from tornado (sensitivity-based)
    const riskContributions: RiskContribution[] = tornado.slice(0, 15).map((t) => ({
      activity_id:      t.activity_id,
      name:             t.name,
      risk_factor:      "schedule_sensitivity",
      contribution_pct: t.risk_contribution_pct,
      absolute_value:   t.range_days,
      unit:             "days",
      direction:        t.sensitivity >= 0 ? "increases_risk" as const : "decreases_risk" as const,
      engine_id:        "MONTE_CARLO" as const,
    }));

    const score = Math.round(Math.min(100, Math.max(0, onTimePct)));

    return {
      engine_id: "MONTE_CARLO", version: this.version,
      execution_id: ctx.execution_id, project_id: ctx.project_id,
      update_id: ctx.update_id, computed_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, status: "success",

      summary: {
        score,
        pass: onTimePct >= 80,
        headline: `${onTimePct.toFixed(0)}% on-time probability · P80 = ${p80}d · P90 = ${p90}d · ${iterations.toLocaleString()} iterations`,
        key_metrics: [
          { key: "on_time_pct", label: "On-Time Probability", value: parseFloat(onTimePct.toFixed(1)), unit: "%",     status: onTimePct >= 80 ? "ok" : onTimePct >= 50 ? "warn" : "critical", formula: "count(finish ≤ planned_duration) / iterations × 100" },
          { key: "p50_days",    label: "P50 (Median)",        value: Math.round(p50),                  unit: "days",  status: p50 <= input.planned_duration ? "ok" : "warn",                   formula: "50th percentile of simulated finish durations" },
          { key: "p80_days",    label: "P80",                 value: Math.round(p80),                  unit: "days",  status: p80 <= input.planned_duration ? "ok" : "warn",                   formula: "80th percentile of simulated finish durations" },
          { key: "p90_days",    label: "P90",                 value: Math.round(p90),                  unit: "days",  status: p90 <= input.planned_duration ? "ok" : "critical",               formula: "90th percentile of simulated finish durations" },
          { key: "std_dev",     label: "Std Dev",             value: parseFloat(stdDev.toFixed(1)),    unit: "days",  status: stdDev <= 30 ? "ok" : stdDev <= 60 ? "warn" : "critical",        formula: "√(Σ(d − mean)² / n)" },
        ],
        formula_inputs: { iterations, seed, mean, stdDev, onTimePct, p50, p80, p90 },
      },

      activity_issues:    issues,
      risk_contributions: riskContributions,

      detail: {
        iterations, seed, confidence_dates: confidenceDates,
        planned_finish_confidence: parseFloat(onTimePct.toFixed(2)),
        p50_days: Math.round(p50), p80_days: Math.round(p80), p90_days: Math.round(p90),
        mean_days: parseFloat(mean.toFixed(1)), std_dev_days: parseFloat(stdDev.toFixed(1)),
        min_days: sortedDays[0], max_days: sortedDays[n - 1],
        criticality_index: criticalityIndex, tornado, histogram,
      },
    };
  }

  describe(): EngineDescriptor {
    return {
      engineId:    "MONTE_CARLO",
      version:     this.version,
      name:        "Monte Carlo Schedule Simulation",
      description: "Runs N iterations of the project network, sampling activity durations from PERT/Triangular/Normal distributions. Produces P50/P80/P90 finish dates, Schedule Criticality Index per activity, and Tornado chart sensitivity rankings.",
      inputs:      ["activities (duration distributions)", "relationships", "mc_iterations", "mc_seed", "confidence_levels"],
      outputs:     ["P50/P80/P90 dates", "on-time probability", "SCI per activity", "Tornado chart (top-20)", "histogram"],
    };
  }
}
