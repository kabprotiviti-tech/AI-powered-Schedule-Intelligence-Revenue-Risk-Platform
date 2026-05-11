"use client";
// Scenarios — what-if analysis for the active schedule.
//
// Builder lets a planner:
//   1. Pick activities by WBS path, name pattern, code prefix, or critical-only.
//   2. Apply a duration transformation (set N days OR multiply by factor).
//   3. Preview the impact: project finish delta, critical path churn, DCMA &
//      slip deltas, matched activity count.
//   4. Save the scenario for later comparison.
//
// V1 stores scenarios per schedule in IndexedDB. The list at the bottom shows
// saved scenarios with their preview metrics; click "Load" to populate the
// builder with that scenario's settings.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight, FlaskConical, Filter, GitBranch, Save, Trash2,
  Loader2, AlertCircle, Wand2, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  evaluateScenario,
  describeSelector,
  describeTransform,
  type Scenario,
  type ScenarioSelector,
  type ScenarioTransform,
  type ScenarioImpact,
  type ScenarioTransformKind,
} from "@/lib/schedule/scenario";
import {
  listScenarios,
  saveScenarioRecord,
  deleteScenarioRecord,
} from "@/lib/schedule/store";

function newId(): string {
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScenariosPage() {
  const { active, all, loading } = useSchedule();

  // Builder state
  const [name, setName] = useState("Slab cycle 7 → 10 days");
  const [selWbs, setSelWbs]       = useState("");
  const [selName, setSelName]     = useState("slab");
  const [selCode, setSelCode]     = useState("");
  const [selCritOnly, setCrit]    = useState(false);
  const [tKind, setTKind]         = useState<ScenarioTransformKind>("setDurationDays");
  const [tValue, setTValue]       = useState<number>(10);

  const [impact, setImpact]   = useState<ScenarioImpact | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Persisted scenarios for the active schedule
  const [saved, setSaved] = useState<Scenario[]>([]);
  const [savedImpacts, setSavedImpacts] = useState<Record<string, ScenarioImpact | undefined>>({});
  const [savedLoading, setSavedLoading] = useState(false);

  const refreshSaved = useCallback(async () => {
    if (!active) { setSaved([]); return; }
    setSavedLoading(true);
    try {
      const list = await listScenarios(active.id);
      list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setSaved(list);
    } finally {
      setSavedLoading(false);
    }
  }, [active]);

  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  // Build a scenario object from the current form state
  const currentScenario = useMemo<Scenario | null>(() => {
    if (!active) return null;
    const sel: ScenarioSelector = {};
    if (selWbs.trim())  sel.wbsContains = selWbs.trim();
    if (selName.trim()) sel.namePattern = selName.trim();
    if (selCode.trim()) sel.codePrefix  = selCode.trim();
    if (selCritOnly)    sel.criticalOnly = true;
    const transform: ScenarioTransform = { kind: tKind, value: Number(tValue) || 0 };
    return {
      id: newId(),
      scheduleId: active.id,
      name: name.trim() || "Untitled scenario",
      selector: sel,
      transform,
      createdAt: new Date().toISOString(),
    };
  }, [active, name, selWbs, selName, selCode, selCritOnly, tKind, tValue]);

  const preview = useCallback(() => {
    if (!active || !currentScenario) return;
    setRunning(true);
    setError(null);
    // Run in idle to keep UI responsive on big schedules
    const job = () => {
      try {
        const result = evaluateScenario(active, currentScenario);
        setImpact(result.impact);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(job, { timeout: 250 });
    } else {
      setTimeout(job, 16);
    }
  }, [active, currentScenario]);

  const save = useCallback(async () => {
    if (!currentScenario) return;
    await saveScenarioRecord(currentScenario);
    await refreshSaved();
  }, [currentScenario, refreshSaved]);

  const remove = useCallback(async (id: string) => {
    await deleteScenarioRecord(id);
    await refreshSaved();
  }, [refreshSaved]);

  const load = useCallback((sc: Scenario) => {
    setName(sc.name);
    setSelWbs(sc.selector.wbsContains ?? "");
    setSelName(sc.selector.namePattern ?? "");
    setSelCode(sc.selector.codePrefix ?? "");
    setCrit(!!sc.selector.criticalOnly);
    setTKind(sc.transform.kind);
    setTValue(sc.transform.value);
    setImpact(null);
  }, []);

  // Compute impacts for saved scenarios in idle ticks
  useEffect(() => {
    if (!active || saved.length === 0) return;
    let cancelled = false;
    let i = 0;
    const yieldFn: (cb: () => void) => void =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb) => (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(cb, { timeout: 250 })
        : (cb) => { setTimeout(cb, 16); };
    const tick = () => {
      if (cancelled || i >= saved.length) return;
      const sc = saved[i++];
      try {
        const { impact } = evaluateScenario(active, sc);
        if (cancelled) return;
        setSavedImpacts((prev) => ({ ...prev, [sc.id]: impact }));
      } catch {
        // Ignore individual scenario errors so the rest of the list keeps rendering
      }
      yieldFn(tick);
    };
    yieldFn(tick);
    return () => { cancelled = true; };
  }, [active, saved]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0) return <EmptyState />;
  if (!active) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h2 className="text-lg font-bold text-text-primary mb-2">Pick a schedule first</h2>
        <p className="text-sm text-text-secondary mb-4">Scenarios run against a single schedule. Select one from <Link href="/upload" className="text-primary hover:underline">Import</Link>.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">Scenarios</span>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={18} className="text-primary" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Scenarios — What-If Analysis</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Pick activities, change their duration, see how the project finish, critical path, and DCMA score move.
          Working against <span className="text-text-primary font-semibold">{active.project.name}</span> ({active.activities.length.toLocaleString()} activities).
        </p>
      </div>

      {/* Builder */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wand2 size={15} className="text-primary" />
          <span className="text-sm font-semibold text-text-primary">Scenario Builder</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Selector */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Filter size={13} className="text-text-secondary" />
              <span className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">1. Pick activities</span>
            </div>
            <div className="space-y-2.5">
              <Field
                label="WBS path contains"
                value={selWbs}
                onChange={setSelWbs}
                placeholder="e.g. Superstructure, Tower A, MEP"
                hint="Matches if any WBS node in the activity's parent chain contains this text."
              />
              <Field
                label="Activity name contains"
                value={selName}
                onChange={setSelName}
                placeholder="e.g. slab, pour, install"
                hint='Case-insensitive substring on activity name.'
              />
              <Field
                label="Activity code starts with"
                value={selCode}
                onChange={setSelCode}
                placeholder="e.g. A1, STR, MEP-"
              />
              <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={selCritOnly}
                  onChange={(e) => setCrit(e.target.checked)}
                  className="accent-primary"
                />
                <span>Critical-path only</span>
              </label>
            </div>
          </div>

          {/* Transform */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={13} className="text-text-secondary" />
              <span className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">2. Apply transformation</span>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1.5">Kind</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTKind("setDurationDays")}
                    className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                      tKind === "setDurationDays"
                        ? "bg-primary/15 border-primary/50 text-primary"
                        : "bg-surface border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    Set duration (days)
                  </button>
                  <button
                    onClick={() => setTKind("multiplyDuration")}
                    className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                      tKind === "multiplyDuration"
                        ? "bg-primary/15 border-primary/50 text-primary"
                        : "bg-surface border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    Multiply duration (×)
                  </button>
                </div>
              </div>
              <Field
                label={tKind === "setDurationDays" ? "Target duration (days)" : "Multiplier"}
                value={String(tValue)}
                onChange={(v) => setTValue(Number(v) || 0)}
                type="number"
                placeholder={tKind === "setDurationDays" ? "e.g. 10" : "e.g. 1.43"}
                hint={tKind === "setDurationDays"
                  ? "Every matched activity will get this duration."
                  : "Every matched activity's duration is multiplied by this factor."}
              />
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1.5">Scenario name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-overlay/[0.04] border border-border rounded-lg text-text-primary outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <button
            onClick={preview}
            disabled={running}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Preview impact
          </button>
          <button
            onClick={save}
            disabled={running || !impact}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <Save size={12} />
            Save scenario
          </button>
          {currentScenario && (
            <span className="text-[11px] text-text-secondary">
              Selector: {describeSelector(currentScenario.selector)} · {describeTransform(currentScenario.transform)}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger flex items-start gap-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Impact preview */}
      {impact && (
        <ImpactCard impact={impact} />
      )}

      {/* Saved scenarios */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-text-primary">Saved scenarios</span>
          <span className="text-[11px] text-text-secondary">{saved.length} for {active.project.name}</span>
        </div>
        {savedLoading && saved.length === 0 && (
          <div className="text-xs text-text-secondary py-2">Loading…</div>
        )}
        {!savedLoading && saved.length === 0 && (
          <div className="text-xs text-text-secondary py-2">No saved scenarios yet. Build one above and click Save.</div>
        )}
        <ul className="divide-y divide-border">
          {saved.map((sc) => {
            const im = savedImpacts[sc.id];
            return (
              <li key={sc.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary truncate">{sc.name}</span>
                    {!im && <span className="text-[10px] uppercase tracking-wider text-text-secondary">…</span>}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-0.5">
                    {describeSelector(sc.selector)} · {describeTransform(sc.transform)}
                  </div>
                  {im && (
                    <div className="text-[11px] mt-1 flex items-center gap-3 flex-wrap font-mono">
                      <DeltaPill label="Finish" value={im.finishDeltaDays} unit="d" worseIfPositive />
                      <DeltaPill label="Slip"   value={im.slipDelta}        unit="d" worseIfPositive />
                      <DeltaPill label="DCMA"   value={im.dcmaDelta}        unit=""  worseIfPositive={false} />
                      <span className="text-text-secondary">{im.matchedCount.toLocaleString()} acts matched</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => load(sc)}
                    className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border border-border text-text-secondary hover:text-text-primary hover:border-primary/40"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => remove(sc.id)}
                    className="text-text-secondary hover:text-danger p-1"
                    title="Delete scenario"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, hint, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm bg-overlay/[0.04] border border-border rounded-lg text-text-primary outline-none focus:border-primary/50"
      />
      {hint && <p className="text-[10px] text-text-secondary mt-1">{hint}</p>}
    </div>
  );
}

function ImpactCard({ impact }: { impact: ScenarioImpact }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical size={15} className="text-primary" />
        <span className="text-sm font-semibold text-text-primary">Impact preview</span>
        <span className="text-xs text-text-secondary">
          · {impact.matchedCount.toLocaleString()} of {impact.totalActivities.toLocaleString()} activities affected
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Project Finish"
          value={`${impact.finishDeltaDays >= 0 ? "+" : ""}${impact.finishDeltaDays}d`}
          tone={impact.finishDeltaDays > 7 ? "danger" : impact.finishDeltaDays > 0 ? "warning" : "success"}
          hint={`Base ${new Date(impact.baseFinish).toLocaleDateString()} → New ${new Date(impact.newFinish).toLocaleDateString()}`}
        />
        <MetricCard
          label="Baseline Slip"
          value={`${impact.slipDelta >= 0 ? "+" : ""}${impact.slipDelta}d`}
          tone={impact.slipDelta > 7 ? "danger" : impact.slipDelta > 0 ? "warning" : "success"}
          hint={`Base ${impact.slipBaseDays}d → New ${impact.slipScenarioDays}d`}
        />
        <MetricCard
          label="DCMA Score"
          value={`${impact.dcmaDelta >= 0 ? "+" : ""}${impact.dcmaDelta}`}
          tone={impact.dcmaDelta < -3 ? "danger" : impact.dcmaDelta < 0 ? "warning" : "success"}
          hint={`Base ${impact.dcmaScoreBase}/100 → New ${impact.dcmaScoreScenario}/100`}
        />
        <MetricCard
          label="Critical Path Churn"
          value={`+${impact.criticalAdded.length} / −${impact.criticalRemoved.length}`}
          tone={impact.criticalAdded.length > impact.criticalRemoved.length ? "warning" : "neutral"}
          hint={`Activities entering / leaving the critical path`}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label, value, tone, hint,
}: { label: string; value: string; tone: "danger" | "warning" | "success" | "neutral"; hint?: string }) {
  const text =
    tone === "danger"  ? "text-danger"  :
    tone === "warning" ? "text-warning" :
    tone === "success" ? "text-success" : "text-text-primary";
  const border =
    tone === "danger"  ? "border-danger/40"  :
    tone === "warning" ? "border-warning/40" :
    tone === "success" ? "border-success/40" : "border-border";
  return (
    <div className={`bg-card border ${border} rounded-2xl p-5`}>
      <div className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-2">{label}</div>
      <div className={`text-3xl font-bold font-mono ${text}`}>{value}</div>
      {hint && <div className="text-[10px] text-text-secondary mt-2">{hint}</div>}
    </div>
  );
}

function DeltaPill({
  label, value, unit, worseIfPositive,
}: { label: string; value: number; unit: string; worseIfPositive: boolean }) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero     = value === 0;
  const isWorse = worseIfPositive ? isPositive : isNegative;
  const isBetter = worseIfPositive ? isNegative : isPositive;
  const cls = isZero ? "text-text-secondary" : isWorse ? "text-danger" : isBetter ? "text-success" : "text-text-secondary";
  const Icon = isWorse ? TrendingUp : isBetter ? TrendingDown : Minus;
  return (
    <span className={`flex items-center gap-1 ${cls}`}>
      <Icon size={11} />
      <span className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</span>
      <span className="font-bold">{value >= 0 ? "+" : ""}{value}{unit}</span>
    </span>
  );
}
