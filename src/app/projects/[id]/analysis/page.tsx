"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  ChevronRight, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Zap, TrendingUp, Activity, Cpu, Info,
} from "lucide-react";
import type { OrchestratorResult } from "@/lib/engines/orchestrator";
import type { DCMAOutput } from "@/lib/engines/dcma/index";
import type { CPMOutput }  from "@/lib/engines/cpm/index";
import type { EVMOutput }  from "@/lib/engines/evm/index";
import type { MonteCarloOutput } from "@/lib/engines/monte-carlo/index";
import { PROJECTS } from "@/lib/data/mock";
import { formatAED } from "@/lib/calculations";

// ─── helpers ────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
}
function scoreLabel(s: number) {
  return s >= 75 ? "Good" : s >= 50 ? "Moderate" : "Poor";
}
function statusIcon(pass: boolean) {
  return pass
    ? <CheckCircle2 className="w-4 h-4 text-success" />
    : <XCircle className="w-4 h-4 text-danger" />;
}
function fmt2(n: number | null | undefined) {
  return n == null ? "—" : n.toFixed(2);
}
function fmtInt(n: number | null | undefined) {
  return n == null ? "—" : Math.round(n).toLocaleString();
}

// ─── Score Ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={55} cy={55} r={r} fill="none" stroke="#1a2d45" strokeWidth={10} />
        <circle
          cx={55} cy={55} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
        />
        <text x={55} y={52} textAnchor="middle" fill={color} fontSize={20} fontWeight="700">{score}</text>
        <text x={55} y={68} textAnchor="middle" fill="#94a3b8" fontSize={10}>{scoreLabel(score)}</text>
      </svg>
      <span className="text-xs text-text-secondary font-medium">{label}</span>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, icon, children, score }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; score?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {icon}
          {title}
        </div>
        {score !== undefined && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ color: scoreColor(score), background: `${scoreColor(score)}1a` }}
          >
            Score {score}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── DCMA Panel ──────────────────────────────────────────────────────────────

function DCMAPanel({ data }: { data: DCMAOutput }) {
  const { detail } = data;
  return (
    <Section
      title="DCMA 14-Point Schedule Assessment"
      icon={<CheckCircle2 className="w-4 h-4 text-primary" />}
      score={data.summary.score}
    >
      {/* Headline metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(() => {
          const passed = detail.check_results.filter((c) => c.status === "Pass").length;
          const total  = detail.check_results.filter((c) => c.status !== "N/A").length;
          const critFails = detail.critical_failures.length;
          const highFails = detail.check_results.filter((c) => c.status === "Fail" && c.severity_weight === 2).length;
          return [
            { label: "Checks Passed",  value: `${passed} / ${total}` },
            { label: "Critical Fails", value: critFails, danger: critFails > 0 },
            { label: "High Fails",     value: highFails, warn: highFails > 0 },
            { label: "Activities",     value: fmtInt(detail.total_activities) },
          ];
        })().map(({ label, value, danger, warn }) => (
          <div key={label} className="bg-surface rounded-lg p-3 text-center">
            <div className={`text-xl font-bold ${danger ? "text-danger" : warn ? "text-warning" : "text-text-primary"}`}>
              {value}
            </div>
            <div className="text-xs text-text-secondary mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Check table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left py-2 pr-3 font-medium">Check</th>
              <th className="text-right py-2 px-2 font-medium">Pass%</th>
              <th className="text-right py-2 px-2 font-medium">Threshold</th>
              <th className="text-right py-2 pl-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.check_results.map((c) => (
              <tr key={c.check_code} className="border-b border-border/40 hover:bg-surface/50">
                <td className="py-1.5 pr-3 text-text-primary">{c.check_name}</td>
                <td className="text-right px-2 tabular-nums">
                  {c.status === "N/A" ? "N/A" : `${c.pass_rate_pct.toFixed(1)}%`}
                </td>
                <td className="text-right px-2 tabular-nums text-text-secondary">
                  {c.status === "N/A" ? "—" : `≥${c.threshold_pct}%`}
                </td>
                <td className="text-right pl-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    c.status === "Pass"    ? "bg-success/10 text-success" :
                    c.status === "Warning" ? "bg-warning/10 text-warning" :
                    c.status === "N/A"     ? "bg-surface text-text-secondary" :
                    "bg-danger/10 text-danger"
                  }`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top issues */}
      {data.activity_issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Top Issues ({data.activity_issues.length})
          </p>
          {data.activity_issues.slice(0, 5).map((iss, i) => (
            <div key={i} className="flex items-start gap-2 bg-surface rounded p-2">
              <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iss.severity === "Critical" ? "text-danger" : "text-warning"}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{iss.name}</p>
                <p className="text-[11px] text-text-secondary">{iss.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── CPM Panel ───────────────────────────────────────────────────────────────

function CPMPanel({ data }: { data: CPMOutput }) {
  const d = data.detail;

  // Build float distribution buckets from float_records
  const floatBuckets = [
    { label: "Negative",  count: d.negative_float_count,  color: "#ef4444" },
    { label: "Near-Crit", count: d.near_critical_count,   color: "#fb923c" },
    { label: "Zero/Other",
      count: d.float_records.filter((r) => r.total_float === 0).length,
      color: "#f59e0b" },
    { label: "Normal",
      count: d.float_records.filter((r) => r.total_float > 14 && r.total_float <= 44).length,
      color: "#3b82f6" },
    { label: "High",
      count: d.float_records.filter((r) => r.total_float > 44).length,
      color: "#10b981" },
  ];

  return (
    <Section
      title="Critical Path Method (CPM)"
      icon={<Activity className="w-4 h-4 text-warning" />}
      score={data.summary.score}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Critical Activities",  value: d.critical_path.length },
          { label: "Path Duration (days)", value: fmtInt(d.critical_path_duration) },
          { label: "CPLI",                 value: fmt2(d.cpli), warn: d.cpli < 0.95 },
          { label: "Finish Variance",      value: `${d.finish_variance_days > 0 ? "+" : ""}${d.finish_variance_days}d`, warn: d.finish_variance_days > 0 },
        ].map(({ label, value, warn }) => (
          <div key={label} className="bg-surface rounded-lg p-3 text-center">
            <div className={`text-xl font-bold ${warn ? "text-warning" : "text-text-primary"}`}>{value}</div>
            <div className="text-xs text-text-secondary mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Float distribution bar chart */}
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Float Distribution</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={floatBuckets} barSize={32}>
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{ background: "#111d2e", border: "1px solid #1a2d45", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "#1a2d45" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {floatBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Critical path activities */}
      {d.critical_path.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Critical Path ({d.critical_path.length} activities)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {d.critical_path.slice(0, 20).map((id) => (
              <span key={id} className="text-[11px] px-2 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">
                {id.split("-").pop()?.toUpperCase()}
              </span>
            ))}
            {d.critical_path.length > 20 && (
              <span className="text-[11px] text-text-secondary">+{d.critical_path.length - 20} more</span>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── EVM Panel ───────────────────────────────────────────────────────────────

function EVMPanel({ data }: { data: EVMOutput }) {
  const d = data.detail;

  const metrics = [
    { key: "SPI", value: d.spi, warn: d.spi < 0.95, crit: d.spi < 0.85, formula: "EV / PV" },
    { key: "CPI", value: d.cpi, warn: d.cpi < 0.95, crit: d.cpi < 0.85, formula: "EV / AC" },
    { key: "TCPI", value: d.tcpi, warn: d.tcpi > 1.1, crit: d.tcpi > 1.2, formula: "(BAC−EV)/(BAC−AC)" },
    { key: "IEAC(t)", value: `${d.ieac_t.toFixed(0)}d`, warn: d.schedule_overrun_days > 0, formula: "Planned Dur / SPI" },
  ];

  const evmBarData = [
    { label: "PV",  value: d.pv  / 1e6, color: "#3b82f6" },
    { label: "EV",  value: d.ev  / 1e6, color: "#10b981" },
    { label: "AC",  value: d.ac  / 1e6, color: "#f59e0b" },
    { label: "BAC", value: d.bac / 1e6, color: "#6366f1" },
    { label: "EAC", value: d.eac / 1e6, color: d.eac > d.bac ? "#ef4444" : "#10b981" },
  ];

  return (
    <Section
      title="Earned Value Management (EVM)"
      icon={<TrendingUp className="w-4 h-4 text-success" />}
      score={data.summary.score}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(({ key, value, warn, crit, formula }) => (
          <div key={key} className="bg-surface rounded-lg p-3 text-center group relative cursor-default">
            <div className={`text-xl font-bold ${crit ? "text-danger" : warn ? "text-warning" : "text-success"}`}>
              {typeof value === "number" ? value.toFixed(3) : value}
            </div>
            <div className="text-xs text-text-secondary mt-1">{key}</div>
            {/* Formula tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-canvas border border-border rounded text-[11px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {formula}
            </div>
          </div>
        ))}
      </div>

      {/* EVM bar chart */}
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">EVM Financials (M AED)</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={evmBarData} barSize={36}>
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(1)} M AED`]}
              contentStyle={{ background: "#111d2e", border: "1px solid #1a2d45", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "#1a2d45" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {evmBarData.map((b, i) => <Cell key={i} fill={b.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Forecast summary */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        {[
          { label: "EAC (CPI)",      value: formatAED(d.eac),           bad: d.eac > d.bac },
          { label: "VAC",            value: formatAED(d.vac),           bad: d.vac < 0 },
          { label: "Schedule Δ",     value: `${d.schedule_overrun_days > 0 ? "+" : ""}${d.schedule_overrun_days}d`, bad: d.schedule_overrun_days > 0 },
        ].map(({ label, value, bad }) => (
          <div key={label} className="bg-surface rounded p-2 text-center">
            <div className={`font-bold ${bad ? "text-danger" : "text-success"}`}>{value}</div>
            <div className="text-text-secondary mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Monte Carlo Panel ───────────────────────────────────────────────────────

function MonteCarloPanel({ data }: { data: MonteCarloOutput }) {
  const d = data.detail;

  // Tornado chart — top 10 (field is "tornado", sensitivity = correlation)
  const tornado = d.tornado.slice(0, 10).map((t) => ({
    name: t.activity_id.split("-").pop()?.toUpperCase() ?? t.activity_id,
    fullName: t.name,
    value: t.sensitivity,
    days:  t.range_days,
  }));

  // Histogram — bin label uses midpoint of min_day/max_day
  const histData = d.histogram.map((bin) => ({
    label: `${Math.round((bin.min_day + bin.max_day) / 2)}d`,
    count: bin.count,
  }));

  // Confidence dates from confidence_dates array
  const confColors: Record<string, string> = {
    P50: "#10b981", P70: "#3b82f6", P80: "#6366f1",
    P85: "#a855f7", P90: "#f59e0b", P95: "#ef4444",
  };
  const confLevels = d.confidence_dates
    .filter((c) => c.label in confColors)
    .map((c) => ({ pct: c.label, days: c.days, color: confColors[c.label] }));

  return (
    <Section
      title="Monte Carlo Simulation"
      icon={<Cpu className="w-4 h-4 text-purple-400" />}
      score={data.summary.score}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-text-primary">{d.iterations.toLocaleString()}</div>
          <div className="text-text-secondary mt-1">Iterations</div>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-text-primary">{d.mean_days.toFixed(0)}d</div>
          <div className="text-text-secondary mt-1">Mean Duration</div>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className={`text-xl font-bold ${d.planned_finish_confidence < 50 ? "text-danger" : d.planned_finish_confidence < 70 ? "text-warning" : "text-success"}`}>
            {d.planned_finish_confidence.toFixed(0)}%
          </div>
          <div className="text-text-secondary mt-1">On-Time Probability</div>
        </div>
      </div>

      {/* Confidence levels */}
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Confidence Levels (days from start)</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {confLevels.map(({ pct, days, color }) => (
            <div key={pct} className="bg-surface rounded p-2 text-center">
              <div className="text-sm font-bold" style={{ color }}>{days}d</div>
              <div className="text-[11px] text-text-secondary">{pct}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution histogram */}
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Finish Duration Distribution</p>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={histData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2d45" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: "#111d2e", border: "1px solid #1a2d45", borderRadius: 8, fontSize: 11 }}
              cursor={{ fill: "#1a2d4550" }}
            />
            <Area type="monotone" dataKey="count" stroke="#a855f7" fill="url(#mcGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tornado chart */}
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Sensitivity (Spearman Rank Correlation)</p>
        <div className="space-y-1.5">
          {tornado.map((t, i) => {
            const abs  = Math.abs(t.value);
            const pct  = (abs * 100).toFixed(0);
            const barW = `${Math.round(abs * 100)}%`;
            return (
              <div key={i} className="flex items-center gap-2 text-xs group" title={t.fullName}>
                <span className="w-16 text-right text-text-secondary shrink-0">{t.name}</span>
                <div className="flex-1 h-5 bg-surface rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end pr-1.5 text-[10px] font-medium text-white"
                    style={{
                      width: barW,
                      background: t.value >= 0
                        ? "linear-gradient(90deg, #3b82f620, #3b82f6)"
                        : "linear-gradient(90deg, #ef444420, #ef4444)",
                    }}
                  >
                    {pct}%
                  </div>
                </div>
                <span className="w-10 text-text-secondary text-right shrink-0">±{t.days}d</span>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const project = PROJECTS.find((p) => p.id === params.id);

  const [result,  setResult]  = useState<OrchestratorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/engines/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: params.id }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: OrchestratorResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { run(); }, [run]);

  if (!project) {
    return (
      <div className="p-8 text-text-secondary text-sm">Project not found.</div>
    );
  }

  const dcma = result?.results.DCMA as DCMAOutput | undefined;
  const cpm  = result?.results.CPM  as CPMOutput  | undefined;
  const evm  = result?.results.EVM  as EVMOutput  | undefined;
  const mc   = result?.results.MONTE_CARLO as MonteCarloOutput | undefined;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link href="/"        className="hover:text-text-primary">Portfolio</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/projects" className="hover:text-text-primary">Projects</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/projects/${project.id}`} className="hover:text-text-primary">{project.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-text-primary">Engine Analysis</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Schedule Intelligence Analysis</h1>
          <p className="text-sm text-text-secondary mt-0.5">{project.name} · {project.type}</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Running…" : "Re-run Engines"}
        </button>
      </div>

      {/* Overall scores row */}
      {result && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-5">
            <Zap className="w-4 h-4 text-primary" />
            Overall Engine Scores
            <span className="ml-auto text-xs text-text-secondary font-normal">
              {result.duration_ms}ms · {result.summary.engines_run.length} engines
            </span>
          </div>
          <div className="flex flex-wrap justify-around gap-6">
            {(["DCMA","CPM","EVM","MONTE_CARLO"] as const).map((id) => {
              const r = result.results[id];
              const label = id === "MONTE_CARLO" ? "Monte Carlo" : id;
              return r ? (
                <ScoreRing key={id} score={r.summary.score} label={label} />
              ) : (
                <div key={id} className="flex flex-col items-center gap-1">
                  <div className="w-[110px] h-[110px] rounded-full border-4 border-surface flex items-center justify-center">
                    <span className="text-xs text-text-secondary">
                      {result.errors[id] ? "Error" : "—"}
                    </span>
                  </div>
                  <span className="text-xs text-text-secondary">{label}</span>
                </div>
              );
            })}
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={result.summary.overall_score} label="Overall" />
            </div>
          </div>

          {/* Errors */}
          {Object.entries(result.errors).map(([eng, msg]) => (
            <div key={eng} className="mt-3 flex items-start gap-2 bg-danger/10 rounded-lg p-3 text-xs text-danger border border-danger/20">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><strong>{eng}:</strong> {msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0,1,2,3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-72 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-xl p-4 text-sm text-danger">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Engine panels */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {dcma && <DCMAPanel data={dcma} />}
          {cpm  && <CPMPanel  data={cpm}  />}
          {evm  && <EVMPanel  data={evm}  />}
          {mc   && <MonteCarloPanel data={mc} />}
        </div>
      )}

      {/* Explainability footer */}
      <div className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3 text-xs text-text-secondary">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          All scores are derived from activity-level data with no black-box calculations.
          DCMA score = earned points / 27 × 100 (14 checks, weighted Critical=3 / High=2 / Medium=1).
          CPM uses Kahn topological sort → forward ES/EF → backward LS/LF → float.
          EVM indices (SPI, CPI) estimated from percent complete and budget allocation when cost data is unavailable.
          Monte Carlo uses {mc?.detail.iterations?.toLocaleString() ?? "500"} PERT-sampled iterations with seeded PRNG for deterministic replay.
        </p>
      </div>
    </div>
  );
}
