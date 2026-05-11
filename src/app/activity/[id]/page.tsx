"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, GitBranch, AlertTriangle, CheckCircle2, Calendar, Clock,
  ArrowUpRight, ArrowRight, ChevronRight,
} from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { getPortfolio } from "@/lib/schedule/portfolio";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { all, loading, overrides } = useSchedule();
  const router = useRouter();

  const data = useMemo(() => {
    if (all.length === 0) return null;
    // Find the activity across ALL imported schedules
    let owningSchedule = null;
    let activity = null;
    for (const s of all) {
      const found = s.activities.find((x) => x.id === id);
      if (found) { owningSchedule = s; activity = found; break; }
    }
    if (!activity || !owningSchedule) return null;

    // Run analytics on the owning schedule (drill-down is per-schedule, not portfolio)
    const portfolio = getPortfolio([owningSchedule], overrides);
    const analytics = portfolio.analytics;

    const tf = analytics.cpm.totalFloat.get(activity.id) ?? null;
    const ff = analytics.cpm.freeFloat.get(activity.id) ?? null;
    const isCrit = analytics.cpm.critical.has(activity.id);

    const succs = owningSchedule.activities.filter((x) => x.predecessors.some((p) => p.predId === activity!.id));
    const failedChecks = analytics.dcma.checks.filter((c) => c.failingIds.includes(activity!.id));
    const baseVar = analytics.baseline.perActivity.find((v) => v.id === activity!.id);

    return { activity, tf, ff, isCrit, succs, failedChecks, baseVar, owningSchedule };
  }, [all, id, overrides]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0)  return <EmptyState />;
  if (!data) return (
    <div className="max-w-2xl mx-auto py-12 text-center">
      <h2 className="text-lg font-bold text-text-primary mb-2">Activity not found</h2>
      <p className="text-sm text-text-secondary mb-4">No activity with id <span className="font-mono">{id}</span> in any imported schedule.</p>
      <Link href="/" className="text-xs text-primary hover:underline">Back to dashboard</Link>
    </div>
  );

  const a = data.activity;
  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const days = (h?: number | null) => h == null ? "—" : `${(h/8).toFixed(1)}d`;

  const byId = new Map(data.owningSchedule.activities.map((x) => [x.id, x]));

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span>Activity</span>
        <ChevronRight size={12} />
        <span className="text-text-primary font-mono">{a.code}</span>
      </div>

      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary transition-colors"
      >
        <ChevronLeft size={14} /> Back
      </button>

      {/* Header card */}
      <div className={`bg-card border ${data.isCrit ? "border-danger/40" : "border-border"} rounded-2xl p-6 animate-fade-in`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-text-secondary px-2 py-0.5 rounded bg-overlay/[0.04] border border-border">{a.code}</span>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${
                a.status === "Completed" ? "bg-success/15 text-success border border-success/30" :
                a.status === "InProgress" ? "bg-primary/15 text-primary border border-primary/30" :
                "bg-overlay/[0.04] text-text-secondary border border-border"
              }`}>
                {a.status}
              </span>
              {data.isCrit && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-danger/15 text-danger border border-danger/30">
                  Critical
                </span>
              )}
              {a.isMilestone && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-warning/15 text-warning border border-warning/30">
                  Milestone
                </span>
              )}
              {a.constraint && a.constraint.type !== "NONE" && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-overlay/[0.04] text-text-secondary border border-border" title={`Constraint: ${a.constraint.type}`}>
                  {a.constraint.type}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-text-primary">{a.name}</h1>
            <div className="text-[11px] text-text-secondary mt-1">
              Type: {a.type} · {a.pctComplete.toFixed(1)}% complete
            </div>
          </div>
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Planned Start"  value={fmt(a.plannedStart)} />
          <Field label="Planned Finish" value={fmt(a.plannedFinish)} />
          <Field label="Actual Start"   value={fmt(a.actualStart)} />
          <Field label="Actual Finish"  value={fmt(a.actualFinish)} />
          <Field label="Baseline Start"  value={fmt(a.baselineStart)} />
          <Field label="Baseline Finish" value={fmt(a.baselineFinish)} />
          <Field label="Early Finish"   value={fmt(a.earlyFinish)} />
          <Field label="Late Finish"    value={fmt(a.lateFinish)} />
        </div>
      </div>

      {/* Float + Variance row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI label="Total Float"  value={days(data.tf)}                 hint="from CPM forward/backward" danger={data.tf != null && data.tf <= 0} />
        <KPI label="Free Float"   value={days(data.ff)}                 hint="slack before successor delays" />
        <KPI label="Baseline Slip" value={data.baseVar ? `${data.baseVar.finishVarDays >= 0 ? "+" : ""}${data.baseVar.finishVarDays}d` : "—"} hint="finish vs baseline" danger={(data.baseVar?.finishVarDays ?? 0) > 0} />
      </div>

      {/* DCMA failures */}
      {data.failedChecks.length > 0 && (
        <div className="bg-card border border-warning/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-warning" />
            <span className="text-sm font-semibold text-text-primary">DCMA Issues</span>
            <span className="text-xs text-text-secondary">— this activity fails {data.failedChecks.length} of 14 checks</span>
          </div>
          <ul className="divide-y divide-border">
            {data.failedChecks.map((c) => (
              <li key={c.id} className="py-2.5">
                <Link
                  href={`/dcma/${c.id}`}
                  className="flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-text-primary group-hover:text-primary transition-colors">{c.name}</div>
                    <div className="text-[11px] text-text-secondary mt-0.5">{c.description}</div>
                  </div>
                  <ArrowUpRight size={13} className="text-text-secondary group-hover:text-primary shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Predecessors */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-primary" />
          <span className="text-sm font-semibold text-text-primary">Predecessors</span>
          <span className="text-xs text-text-secondary">— {a.predecessors.length}</span>
        </div>
        {a.predecessors.length === 0 ? (
          <div className="text-xs text-text-secondary">None.</div>
        ) : (
          <ul className="divide-y divide-border">
            {a.predecessors.map((p, i) => {
              const pred = byId.get(p.predId);
              return (
                <li key={`${p.predId}-${i}`} className="py-2 flex items-center gap-3 text-xs">
                  <span className="font-mono text-text-secondary w-20 shrink-0 truncate">{p.type}{p.lagHours !== 0 ? ` ${p.lagHours > 0 ? "+" : ""}${(p.lagHours/8).toFixed(1)}d` : ""}</span>
                  {pred ? (
                    <Link href={`/activity/${pred.id}`} className="flex-1 truncate text-primary hover:underline font-medium">
                      {pred.code} — {pred.name}
                    </Link>
                  ) : (
                    <span className="flex-1 truncate text-text-secondary italic">[external: {p.predId}]</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Successors */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-primary rotate-180" />
          <span className="text-sm font-semibold text-text-primary">Successors</span>
          <span className="text-xs text-text-secondary">— {data.succs.length}</span>
        </div>
        {data.succs.length === 0 ? (
          <div className="text-xs text-text-secondary">None.</div>
        ) : (
          <ul className="divide-y divide-border">
            {data.succs.map((s) => {
              const link = s.predecessors.find((p) => p.predId === a.id);
              return (
                <li key={s.id} className="py-2 flex items-center gap-3 text-xs">
                  <span className="font-mono text-text-secondary w-20 shrink-0 truncate">
                    {link ? `${link.type}${link.lagHours !== 0 ? ` ${link.lagHours > 0 ? "+" : ""}${(link.lagHours/8).toFixed(1)}d` : ""}` : "—"}
                  </span>
                  <Link href={`/activity/${s.id}`} className="flex-1 truncate text-primary hover:underline font-medium">
                    {s.code} — {s.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-overlay/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="text-xs font-semibold text-text-primary mt-0.5 font-mono">{value}</div>
    </div>
  );
}

function KPI({ label, value, hint, danger }: { label: string; value: string | number; hint?: string; danger?: boolean }) {
  return (
    <div className={`bg-card border ${danger ? "border-danger/40" : "border-border"} rounded-2xl p-4`}>
      <div className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${danger ? "text-danger" : "text-text-primary"}`}>{value}</div>
      {hint && <div className="text-[10px] text-text-secondary mt-1">{hint}</div>}
    </div>
  );
}
