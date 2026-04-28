"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ShieldCheck, CheckCircle2, AlertCircle, XCircle, MinusCircle, ArrowUpRight, Search, X,
} from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { getAnalytics } from "@/lib/schedule/analytics";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CheckStatus } from "@/lib/schedule/dcma";

const checkBadge: Record<CheckStatus, string> = {
  pass: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  fail: "bg-danger/15 text-danger border-danger/30",
  "n/a": "bg-overlay/[0.04] text-text-secondary border-border",
};
const checkIcon: Record<CheckStatus, React.ElementType> = {
  pass: CheckCircle2,
  warn: AlertCircle,
  fail: XCircle,
  "n/a": MinusCircle,
};

export default function DCMACheckPage() {
  const { checkId } = useParams<{ checkId: string }>();
  const { active, loading } = useSchedule();
  const [q, setQ] = useState("");

  const data = useMemo(() => {
    if (!active) return null;
    const analytics = getAnalytics(active);
    const check = analytics.dcma.checks.find((c) => c.id === checkId);
    if (!check) return null;
    const acts = check.failingIds
      .map((id) => active.activities.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a);
    return { check, acts, analytics };
  }, [active, checkId]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (!active)  return <EmptyState />;
  if (!data) return (
    <div className="max-w-2xl mx-auto py-12 text-center">
      <h2 className="text-lg font-bold text-text-primary mb-2">Check not found</h2>
      <p className="text-sm text-text-secondary mb-4">DCMA check id <span className="font-mono">{checkId}</span> is not recognised.</p>
      <Link href="/" className="text-xs text-primary hover:underline">Back to dashboard</Link>
    </div>
  );

  const { check, acts } = data;
  const Icon = checkIcon[check.status];

  const term = q.trim().toLowerCase();
  const filtered = !term ? acts : acts.filter(
    (a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term),
  );

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span>DCMA</span>
        <ChevronRight size={12} />
        <span className="text-text-primary font-mono">{check.id}</span>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 animate-fade-in">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${checkBadge[check.status]}`}>
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-text-secondary px-2 py-0.5 rounded bg-overlay/[0.04] border border-border">{check.id}</span>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold border ${checkBadge[check.status]}`}>
                {check.status}
              </span>
            </div>
            <h1 className="text-xl font-bold text-text-primary">{check.name}</h1>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed">{check.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <Field label="Threshold"      value={check.threshold} />
          <Field label={check.metricLabel} value={check.metricValue} />
          <Field label="Failing %"      value={`${check.failingPct.toFixed(1)}%`} />
        </div>
      </div>

      {/* Activity list */}
      {acts.length === 0 ? (
        <div className="bg-card border border-success/30 rounded-2xl p-8 text-center">
          <CheckCircle2 size={28} className="text-success mx-auto mb-2" />
          <div className="text-sm font-semibold text-text-primary mb-1">No failing activities</div>
          <div className="text-xs text-text-secondary">This check passes — there are no activities to drill into.</div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-primary" />
              <span className="text-sm font-semibold text-text-primary">Failing Activities</span>
              <span className="text-xs text-text-secondary">{filtered.length} of {acts.length}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-overlay/[0.04] border border-border rounded-xl text-xs flex-1 max-w-xs">
              <Search size={12} className="text-text-secondary shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by code or name…"
                className="flex-1 bg-transparent outline-none text-text-primary placeholder:text-text-secondary"
              />
              {q && (
                <button onClick={() => setQ("")} className="text-text-secondary hover:text-text-primary"><X size={12} /></button>
              )}
            </div>
          </div>

          <ul className="divide-y divide-border">
            {filtered.slice(0, 200).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/activity/${a.id}`}
                  className="flex items-center gap-3 py-2.5 hover:bg-overlay/[0.03] -mx-3 px-3 rounded-lg transition-colors group"
                >
                  <span className="font-mono text-[11px] text-text-secondary w-24 shrink-0 truncate">{a.code}</span>
                  <span className="flex-1 truncate text-xs text-text-primary group-hover:text-primary transition-colors">{a.name}</span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border bg-overlay/[0.04] text-text-secondary border-border shrink-0">
                    {a.status}
                  </span>
                  <ArrowUpRight size={13} className="text-text-secondary group-hover:text-primary shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
          {filtered.length > 200 && (
            <div className="text-xs text-text-secondary text-center pt-3">
              Showing first 200 of {filtered.length}. Refine the filter to narrow.
            </div>
          )}
        </div>
      )}
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
