"use client";

import { useEffect, useState } from "react";
import {
  X, RefreshCw, Calculator, TrendingDown, Activity,
  Lightbulb, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, Info, ArrowUpRight,
} from "lucide-react";
import type {
  ExplainResponse, MetricStatus, ScoreComponent,
  FrameworkDriver, ActivityContributor, RecommendedAction,
} from "@/lib/explain/types";

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusColor(s: MetricStatus | "pass" | "warn" | "fail") {
  if (s === "good"  || s === "pass") return "text-success";
  if (s === "warning" || s === "warn") return "text-warning";
  return "text-danger";
}

function statusBg(s: MetricStatus | "pass" | "warn" | "fail") {
  if (s === "good"  || s === "pass") return "bg-success/10 border-success/30 text-success";
  if (s === "warning" || s === "warn") return "bg-warning/10 border-warning/30 text-warning";
  return "bg-danger/10 border-danger/30 text-danger";
}

function statusDot(s: string) {
  if (s === "pass" || s === "good")   return "bg-success";
  if (s === "warn" || s === "warning") return "bg-warning";
  return "bg-danger";
}

function effortColor(e: "Low" | "Medium" | "High") {
  return e === "Low" ? "bg-success/10 text-success" : e === "Medium" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger";
}

// ─── Mini Progress Bar ────────────────────────────────────────────────────────

function MiniBar({ value, max = 100, colorClass }: { value: number; max?: number; colorClass: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Accordion Section ────────────────────────────────────────────────────────

function Accordion({
  id, title, icon, open, onToggle, badge, children,
}: {
  id: string; title: string; icon: React.ReactNode;
  open: boolean; onToggle: () => void;
  badge?: string | number; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface/40 transition-colors text-left"
      >
        <span className="text-primary">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-text-primary">{title}</span>
        {badge !== undefined && (
          <span className="text-xs font-medium text-text-secondary bg-surface px-2 py-0.5 rounded-full mr-2">
            {badge}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

// ─── Section 1: Calculation ───────────────────────────────────────────────────

function CalcSection({ data, mode }: { data: ExplainResponse; mode: "executive" | "pmo" }) {
  const { calculation: c } = data;
  return (
    <div className="space-y-4">
      {/* Headline */}
      <p className="text-sm text-text-primary leading-relaxed">{c.headline}</p>

      {/* Score meter */}
      {data.metric_unit === "/ 100" && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>Score</span>
            <span>{data.metric_value} / 100</span>
          </div>
          <div className="h-3 bg-surface rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${data.status === "good" ? "bg-success" : data.status === "warning" ? "bg-warning" : "bg-danger"}`}
              style={{ width: `${Math.min(100, parseFloat(data.metric_value))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>0 — Poor</span><span>50 — Moderate</span><span>85 — Good</span>
          </div>
        </div>
      )}

      {/* Plain language formula */}
      <div className="bg-surface/60 rounded-lg p-3 text-sm text-text-secondary border border-border">
        <p className="font-medium text-text-primary text-xs uppercase tracking-wider mb-1.5">How It Works</p>
        <p className="leading-relaxed">{c.formula_plain}</p>
      </div>

      {/* PMO: technical formula */}
      {mode === "pmo" && (
        <div className="bg-canvas rounded-lg p-3 border border-border/60">
          <p className="font-medium text-text-primary text-xs uppercase tracking-wider mb-2">Technical Formula</p>
          <pre className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono">{c.formula_technical}</pre>
        </div>
      )}

      {/* Components table */}
      {c.components.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            {mode === "pmo" ? "Score Components" : "Key Factors"}
          </p>
          <div className="space-y-2">
            {(mode === "executive" ? c.components.slice(0, 5) : c.components).map((comp) => (
              <ComponentRow key={comp.label} comp={comp} mode={mode} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentRow({ comp, mode }: { comp: ScoreComponent; mode: "executive" | "pmo" }) {
  const barColor = comp.status === "pass" ? "bg-success" : comp.status === "warn" ? "bg-warning" : "bg-danger";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(comp.status)}`} />
        <span className="text-xs text-text-primary flex-1 truncate" title={comp.label}>{comp.label}</span>
        {mode === "pmo" && (
          <span className="text-[10px] text-text-secondary shrink-0">×{comp.weight}</span>
        )}
        <span className={`text-xs font-medium tabular-nums shrink-0 ${statusColor(comp.status)}`}>
          {comp.value.toFixed(0)}%
        </span>
      </div>
      <MiniBar value={comp.value} colorClass={barColor} />
    </div>
  );
}

// ─── Section 2: Top Drivers ───────────────────────────────────────────────────

function DriversSection({ data, mode }: { data: ExplainResponse; mode: "executive" | "pmo" }) {
  const drivers = mode === "executive" ? data.drivers.slice(0, 5) : data.drivers;

  if (drivers.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-success py-2">
        <CheckCircle2 className="w-4 h-4" />
        No contributing issues found — this metric is performing well.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drivers.map((d, i) => (
        <DriverCard key={i} driver={d} mode={mode} />
      ))}
    </div>
  );
}

function DriverCard({ driver, mode }: { driver: FrameworkDriver; mode: "executive" | "pmo" }) {
  const maxBar = 100;
  const barColor = driver.status === "pass" ? "bg-success" : driver.status === "warn" ? "bg-warning" : "bg-danger";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${statusBg(driver.status)}`}>
      <div className="flex items-start gap-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${statusBg(driver.status)}`}>
          {driver.framework}{driver.check_code ? ` · ${driver.check_code}` : ""}
        </span>
        <p className="text-xs font-medium text-text-primary flex-1 leading-snug">{driver.headline}</p>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${statusColor(driver.status)}`}>
          {driver.contribution_pct.toFixed(1)}%
        </span>
      </div>
      <MiniBar value={driver.contribution_pct} max={maxBar} colorClass={barColor} />
      {mode === "pmo" && driver.detail && (
        <p className="text-[11px] text-text-secondary leading-snug">{driver.detail}</p>
      )}
      {mode === "pmo" && driver.impact_days > 0 && (
        <div className="flex gap-3 text-[11px] text-text-secondary">
          {driver.violation_count > 0 && <span>{driver.violation_count} activities</span>}
          <span>{driver.impact_days}d schedule impact</span>
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Affected Activities ──────────────────────────────────────────

function ActivitiesSection({ data, mode }: { data: ExplainResponse; mode: "executive" | "pmo" }) {
  const activities = mode === "executive" ? data.activities.slice(0, 5) : data.activities;

  if (activities.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-success py-2">
        <CheckCircle2 className="w-4 h-4" />
        No high-risk activities identified.
      </div>
    );
  }

  return (
    <div className="space-y-1 -mx-1">
      {/* Header */}
      <div className="grid text-[10px] text-text-secondary font-medium uppercase tracking-wider px-1 pb-1 border-b border-border"
        style={{ gridTemplateColumns: "2rem 1fr 3.5rem 3rem" }}>
        <span>#</span>
        <span>Activity</span>
        <span className="text-right">Impact</span>
        <span className="text-right">Float</span>
      </div>
      {activities.map((a) => (
        <ActivityRow key={a.rank} activity={a} mode={mode} />
      ))}
      {mode === "executive" && data.activities.length > 5 && (
        <p className="text-[11px] text-text-secondary pt-1 px-1">
          +{data.activities.length - 5} more in PMO Detail view
        </p>
      )}
    </div>
  );
}

function ActivityRow({ activity: a, mode }: { activity: ActivityContributor; mode: "executive" | "pmo" }) {
  const dotColor = a.activity_status === "critical" ? "bg-danger" : a.activity_status === "warning" ? "bg-warning" : "bg-success";

  return (
    <div
      className="grid items-start px-1 py-2 rounded-md hover:bg-surface/40 transition-colors border border-transparent hover:border-border"
      style={{ gridTemplateColumns: "2rem 1fr 3.5rem 3rem" }}
    >
      <span className="text-xs text-text-secondary tabular-nums">{a.rank}</span>
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs font-medium text-text-primary truncate" title={a.name}>{a.name}</span>
          {a.is_critical && (
            <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-orange-500/20 text-orange-400">CP</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-secondary">{a.wbs_code}</span>
          {mode === "pmo" && a.issues.slice(0, 2).map((issue) => (
            <span key={issue} className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface text-text-secondary border border-border">
              {issue}
            </span>
          ))}
        </div>
        {mode === "pmo" && a.responsible_party && (
          <p className="text-[10px] text-text-secondary">Owner: {a.responsible_party}</p>
        )}
      </div>
      <div className="text-right">
        <span className="text-xs font-medium text-text-primary tabular-nums">
          {a.risk_contribution_pct.toFixed(1)}%
        </span>
      </div>
      <div className="text-right">
        {a.float_days !== undefined ? (
          <span className={`text-xs tabular-nums font-medium ${a.float_days < 0 ? "text-danger" : a.float_days <= 14 ? "text-warning" : "text-text-secondary"}`}>
            {a.float_days > 0 ? "+" : ""}{a.float_days}d
          </span>
        ) : (
          <span className="text-xs text-text-secondary">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Section 4: Actions ───────────────────────────────────────────────────────

function ActionsSection({ data, mode }: { data: ExplainResponse; mode: "executive" | "pmo" }) {
  const actions = mode === "executive" ? data.actions.slice(0, 4) : data.actions;

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <ActionCard key={action.priority} action={action} mode={mode} />
      ))}
    </div>
  );
}

function ActionCard({ action: a, mode }: { action: RecommendedAction; mode: "executive" | "pmo" }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
          {a.priority}
        </span>
        <p className="text-sm font-medium text-text-primary flex-1 leading-snug">{a.action}</p>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${effortColor(a.effort)}`}>
          {a.effort}
        </span>
      </div>

      {mode === "pmo" && (
        <>
          <div className="pl-7 space-y-1.5">
            <p className="text-xs text-text-secondary leading-relaxed">{a.rationale}</p>
            <div className="flex items-start gap-1.5 bg-primary/5 border border-primary/20 rounded p-2">
              <ArrowUpRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-primary leading-snug">{a.impact}</p>
            </div>
          </div>
          <div className="pl-7 flex items-center gap-3 text-[10px] text-text-secondary">
            <span>{a.framework}</span>
            {a.activity_count > 0 && <span>{a.activity_count} activit{a.activity_count !== 1 ? "ies" : "y"}</span>}
          </div>
        </>
      )}

      {mode === "executive" && (
        <p className="pl-7 text-xs text-text-secondary leading-relaxed">{a.rationale}</p>
      )}
    </div>
  );
}

// ─── Main ExplainPanel ────────────────────────────────────────────────────────

interface ExplainPanelProps {
  projectId:  string;
  metricId:   string | null;
  onClose:    () => void;
}

export function ExplainPanel({ projectId, metricId, onClose }: ExplainPanelProps) {
  const [data,    setData]    = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [mode,    setMode]    = useState<"executive" | "pmo">("executive");
  const [open,    setOpen]    = useState<Set<string>>(
    () => new Set(["calc", "drivers", "activities", "actions"]),
  );

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!metricId) { setData(null); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/explain?project_id=${encodeURIComponent(projectId)}&metric=${encodeURIComponent(metricId)}`)
      .then((r) => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then((d: ExplainResponse) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [metricId, projectId]);

  if (!metricId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full max-w-[540px] bg-canvas border-l border-border shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface rounded-lg text-text-secondary hover:text-text-primary transition-colors mt-0.5 shrink-0"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold mb-0.5">
              Explainability Panel
            </p>
            {data && (
              <p className="text-sm font-semibold text-text-primary truncate">{data.metric_label}</p>
            )}
            {!data && !loading && (
              <p className="text-sm text-text-secondary">Loading…</p>
            )}
          </div>

          {/* Metric value badge */}
          {data && (
            <div className="text-right shrink-0">
              <div className={`text-3xl font-bold tabular-nums leading-none ${statusColor(data.status)}`}>
                {data.metric_value}
                <span className="text-sm font-normal text-text-secondary ml-1">{data.metric_unit}</span>
              </div>
              <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBg(data.status)}`}>
                {data.status_label}
              </span>
            </div>
          )}
        </div>

        {/* ── Mode toggle + benchmark ── */}
        {data && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0 bg-surface/30">
            <div className="flex items-center bg-surface rounded-lg p-0.5 gap-0.5">
              {(["executive", "pmo"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    mode === m
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {m === "executive" ? "Executive" : "PMO Detail"}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-text-secondary">
              <Info className="w-3 h-3" />
              <span>{data.benchmark}</span>
            </div>
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-text-secondary">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm">Building explanation…</p>
            </div>
          )}

          {error && (
            <div className="m-5 flex items-start gap-2 bg-danger/10 border border-danger/20 rounded-lg p-3 text-sm text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {data && !loading && (
            <div className="divide-y divide-border/60">

              {/* Section 1 — Calculation Logic */}
              <Accordion
                id="calc"
                title="How It's Calculated"
                icon={<Calculator className="w-4 h-4" />}
                open={open.has("calc")}
                onToggle={() => toggle("calc")}
                badge={data.calculation.components.length}
              >
                <CalcSection data={data} mode={mode} />
              </Accordion>

              {/* Section 2 — Top Drivers */}
              <Accordion
                id="drivers"
                title="Top Drivers"
                icon={<TrendingDown className="w-4 h-4" />}
                open={open.has("drivers")}
                onToggle={() => toggle("drivers")}
                badge={data.drivers.filter(d => d.status !== "pass").length || undefined}
              >
                <DriversSection data={data} mode={mode} />
              </Accordion>

              {/* Section 3 — Affected Activities */}
              <Accordion
                id="activities"
                title="Affected Activities"
                icon={<Activity className="w-4 h-4" />}
                open={open.has("activities")}
                onToggle={() => toggle("activities")}
                badge={data.activities.length}
              >
                <ActivitiesSection data={data} mode={mode} />
              </Accordion>

              {/* Section 4 — Actions */}
              <Accordion
                id="actions"
                title="Recommended Actions"
                icon={<Lightbulb className="w-4 h-4" />}
                open={open.has("actions")}
                onToggle={() => toggle("actions")}
                badge={data.actions.length}
              >
                <ActionsSection data={data} mode={mode} />
              </Accordion>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {data && (
          <div className="px-5 py-3 border-t border-border shrink-0 flex items-center gap-2 bg-surface/20">
            <Info className="w-3 h-3 text-text-secondary shrink-0" />
            <p className="text-[11px] text-text-secondary">
              All figures are derived from live engine calculations — no manual overrides.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
