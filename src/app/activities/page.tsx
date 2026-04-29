"use client";
import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Search, X, ArrowUpRight } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { getPortfolio } from "@/lib/schedule/portfolio";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ScheduleActivity } from "@/lib/schedule/types";

type Filter =
  | "all"
  | "critical"           // CPM critical path
  | "negFloat"           // negative float
  | "delayed"            // forecast > baseline
  | "completed"
  | "inProgress"
  | "notStarted"
  | "milestone"
  | "highFloat"          // > 44d
  | "logic";             // missing pred & succ

interface FilterMeta { id: Filter; label: string; }

function ActivitiesView() {
  const sp = useSearchParams();
  const filterParam = (sp.get("filter") as Filter) ?? "all";
  const titleParam  = sp.get("title") ?? "";
  const { selected, all, loading } = useSchedule();
  const [q, setQ] = useState("");

  const data = useMemo(() => {
    const pool = selected.length > 0 ? selected : all;
    if (pool.length === 0) return null;
    const portfolio = getPortfolio(pool);
    const analytics = portfolio.analytics;
    const allActs = pool.flatMap((s) => s.activities);

    const succsOf = new Map<string, number>();
    for (const a of allActs) {
      for (const p of a.predecessors) succsOf.set(p.predId, (succsOf.get(p.predId) ?? 0) + 1);
    }

    const filtered = allActs.filter((a) => {
      switch (filterParam) {
        case "critical":   return analytics.cpm.critical.has(a.id);
        case "negFloat":   return (analytics.cpm.totalFloat.get(a.id) ?? 0) < -0.01;
        case "delayed":    return a.baselineFinish && a.plannedFinish &&
                                  new Date(a.plannedFinish).getTime() > new Date(a.baselineFinish).getTime();
        case "completed":  return a.status === "Completed";
        case "inProgress": return a.status === "InProgress";
        case "notStarted": return a.status === "NotStarted";
        case "milestone":  return a.isMilestone;
        case "highFloat":  return (analytics.cpm.totalFloat.get(a.id) ?? 0) > 44 * 8;
        case "logic":      return a.predecessors.length === 0 && (succsOf.get(a.id) ?? 0) === 0
                                  && a.type !== "LOE" && a.type !== "WBSSummary";
        default:           return true;
      }
    });

    return { analytics, filtered };
  }, [selected, all, filterParam]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0) return <EmptyState />;
  if (!data)   return null;
  const pool = selected.length > 0 ? selected : all;
  const totalActs = pool.reduce((s, x) => s + x.activities.length, 0);
  const projectLabel = pool.length === 1 ? pool[0].project.name : `${pool.length} schedules`;

  const filterMeta: Record<Filter, FilterMeta> = {
    all:        { id: "all",        label: "All Activities" },
    critical:   { id: "critical",   label: "Critical Path" },
    negFloat:   { id: "negFloat",   label: "Negative Float" },
    delayed:    { id: "delayed",    label: "Delayed (vs Baseline)" },
    completed:  { id: "completed",  label: "Completed" },
    inProgress: { id: "inProgress", label: "In Progress" },
    notStarted: { id: "notStarted", label: "Not Started" },
    milestone:  { id: "milestone",  label: "Milestones" },
    highFloat:  { id: "highFloat",  label: "High Float (> 44d)" },
    logic:      { id: "logic",      label: "Missing Logic" },
  };
  const meta = filterMeta[filterParam] ?? filterMeta.all;

  const term = q.trim().toLowerCase();
  const list = !term ? data.filtered : data.filtered.filter(
    (a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term),
  );

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">Activities</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">{titleParam || meta.label}</h1>
        <p className="text-sm text-text-secondary mt-1">
          {data.filtered.length.toLocaleString()} of {totalActs.toLocaleString()} activities · {projectLabel}
        </p>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {Object.values(filterMeta).map((f) => (
          <Link
            key={f.id}
            href={`/activities?filter=${f.id}`}
            className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
              f.id === filterParam
                ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                : "bg-overlay/[0.04] border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-overlay/[0.04] border border-border rounded-xl text-xs max-w-sm">
        <Search size={12} className="text-text-secondary shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by code or name…"
          className="flex-1 bg-transparent outline-none text-text-primary placeholder:text-text-secondary"
        />
        {q && <button onClick={() => setQ("")} className="text-text-secondary hover:text-text-primary"><X size={12} /></button>}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-overlay/[0.02]">
            <tr className="text-text-secondary">
              <th className="text-left py-2.5 px-4 font-medium">Code</th>
              <th className="text-left py-2.5 px-4 font-medium">Activity</th>
              <th className="text-right py-2.5 px-4 font-medium">Status</th>
              <th className="text-right py-2.5 px-4 font-medium">Duration</th>
              <th className="text-right py-2.5 px-4 font-medium">Float</th>
              <th className="text-right py-2.5 px-4 font-medium">% Done</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 500).map((a) => <Row key={a.id} a={a} cpm={data.analytics.cpm} />)}
            {list.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-text-secondary">No matching activities.</td></tr>
            )}
          </tbody>
        </table>
        {list.length > 500 && (
          <div className="text-center py-3 text-[11px] text-text-secondary border-t border-border">
            Showing first 500 of {list.length.toLocaleString()}. Refine the filter or search to narrow.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ a, cpm }: { a: ScheduleActivity; cpm: ReturnType<typeof getPortfolio>["analytics"]["cpm"] }) {
  const tf = cpm.totalFloat.get(a.id) ?? 0;
  const isCrit = cpm.critical.has(a.id);
  return (
    <tr className="border-b border-border last:border-0 hover:bg-overlay/[0.03] transition-colors">
      <td className="py-2 px-4 font-mono text-text-secondary">
        <Link href={`/activity/${a.id}`} className="hover:text-primary">{a.code}</Link>
      </td>
      <td className="py-2 px-4 text-text-primary truncate max-w-md">
        <Link href={`/activity/${a.id}`} className="hover:text-primary">{a.name}</Link>
      </td>
      <td className="py-2 px-4 text-right">
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border ${
          a.status === "Completed"  ? "bg-success/15 text-success border-success/30" :
          a.status === "InProgress" ? "bg-primary/15 text-primary border-primary/30" :
                                      "bg-overlay/[0.04] text-text-secondary border-border"
        }`}>{a.status}</span>
      </td>
      <td className="py-2 px-4 text-right font-mono text-text-secondary">{(a.durationHours / 8).toFixed(1)}d</td>
      <td className={`py-2 px-4 text-right font-mono ${isCrit ? "text-danger" : "text-text-secondary"}`}>{(tf / 8).toFixed(1)}d</td>
      <td className="py-2 px-4 text-right font-mono text-text-secondary">{a.pctComplete.toFixed(0)}%</td>
      <td className="py-2 px-2 text-right">
        <Link href={`/activity/${a.id}`}><ArrowUpRight size={12} className="text-text-secondary hover:text-primary" /></Link>
      </td>
    </tr>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<div className="text-center text-text-secondary py-20 text-sm">Loading…</div>}>
      <ActivitiesView />
    </Suspense>
  );
}
