"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Building2, Layers as LayersIcon, AlertCircle,
} from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { classifyProject, ASSET_LABELS, type AssetType, type Tier } from "@/lib/schedule/classifier";
import { getPortfolio } from "@/lib/schedule/portfolio";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Schedule } from "@/lib/schedule/types";

// Metrics that need full analytics — computed lazily so first paint isn't
// blocked by N× CPM/DCMA/baseline pipelines.
interface LazyMetrics { dcmaScore: number; baselineSlipDays: number; problems: number; }

const tierStyle: Record<Tier, { bg: string; text: string }> = {
  A: { bg: "bg-danger/15 border-danger/30",   text: "text-danger" },
  B: { bg: "bg-warning/15 border-warning/30", text: "text-warning" },
  C: { bg: "bg-success/15 border-success/30", text: "text-success" },
};

interface Entry {
  schedule: Schedule;
  assetType: AssetType;
  assetLabel: string;
  tier: Tier;
  headline: string;
  floors: number;
  activities: number;
}

export default function SegmentsPage() {
  const { all, selectedIds, toggleSelected, loading } = useSchedule();

  // Cheap path: classifier-only data renders synchronously on first paint.
  const entries = useMemo<Entry[]>(() => {
    return all.map((s) => {
      const snap = classifyProject(s);
      return {
        schedule: s,
        assetType: snap.assetType,
        assetLabel: snap.assetLabel,
        tier: snap.tier,
        headline: snap.headline,
        floors: snap.floors.totalAboveGrade,
        activities: snap.scale.activities,
      };
    });
  }, [all]);

  // Expensive path: full analytics deferred. Each schedule's CPM/DCMA/baseline/
  // achievability pipeline runs in its own idle tick so 20 schedules don't
  // block the main thread on first render. portfolioCache makes subsequent
  // navigations instant.
  const [lazyMetrics, setLazyMetrics] = useState<Map<string, LazyMetrics>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const yieldFn: (cb: () => void) => void =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb) => (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(cb, { timeout: 250 })
        : (cb) => { setTimeout(cb, 16); };

    const tick = () => {
      if (cancelled || i >= all.length) return;
      const s = all[i++];
      try {
        const { analytics } = getPortfolio([s]);
        if (cancelled) return;
        setLazyMetrics((prev) => {
          const next = new Map(prev);
          next.set(s.id, {
            dcmaScore: analytics.dcma.overallScore,
            baselineSlipDays: analytics.baseline.projectFinishVarDays,
            problems: analytics.achievability.problemActivities.total,
          });
          return next;
        });
      } catch {
        // schedule analytics may fail for malformed inputs — skip without blocking the queue
      }
      yieldFn(tick);
    };
    yieldFn(tick);
    return () => { cancelled = true; };
  }, [all]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0) return <EmptyState />;

  // Group by asset type
  const groups = new Map<AssetType, Entry[]>();
  for (const e of entries) {
    if (!groups.has(e.assetType)) groups.set(e.assetType, []);
    groups.get(e.assetType)!.push(e);
  }
  const groupedByCount = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

  // Tier totals across the portfolio
  const tierCounts = { A: 0, B: 0, C: 0 } as Record<Tier, number>;
  for (const e of entries) tierCounts[e.tier]++;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">Segments</span>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <LayersIcon size={18} className="text-primary" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Segments &amp; Tiers</h1>
        </div>
        <p className="text-sm text-text-secondary">
          {all.length} schedules auto-classified by asset type and complexity tier. Heuristic — based on project name,
          WBS structure, and activity keywords.
        </p>
      </div>

      {/* Tier roll-up */}
      <div className="grid grid-cols-3 gap-3">
        {(["A", "B", "C"] as Tier[]).map((t) => (
          <div key={t} className={`rounded-2xl border px-4 py-3 ${tierStyle[t].bg}`}>
            <div className={`text-[10px] uppercase tracking-wider font-bold ${tierStyle[t].text}`}>Tier {t}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-3xl font-bold font-mono ${tierStyle[t].text}`}>{tierCounts[t]}</span>
              <span className="text-xs text-text-secondary">of {all.length}</span>
            </div>
            <div className="text-[11px] text-text-secondary mt-1">
              {t === "A" ? "Mega / Complex" : t === "B" ? "Mid-Scale" : "Small / Simple"}
            </div>
          </div>
        ))}
      </div>

      {/* Per-segment groups */}
      {groupedByCount.map(([assetType, group]) => {
        // Pull lazy metrics where available; rows without metrics yet render with placeholders.
        const withMetrics = group.map((e) => ({ ...e, m: lazyMetrics.get(e.schedule.id) }));
        // Sort: rows with metrics first (by DCMA desc), then unmeasured rows.
        const sorted = [...withMetrics].sort((a, b) => {
          if (!a.m && !b.m) return 0;
          if (!a.m) return 1;
          if (!b.m) return -1;
          return b.m.dcmaScore - a.m.dcmaScore;
        });
        const tierCount = { A: 0, B: 0, C: 0 } as Record<Tier, number>;
        for (const g of group) tierCount[g.tier]++;
        const measured = withMetrics.filter((r) => r.m);
        const avgDCMA = measured.length === 0 ? null : Math.round(measured.reduce((s, g) => s + g.m!.dcmaScore, 0) / measured.length);
        const avgSlip = measured.length === 0 ? null : Math.round(measured.reduce((s, g) => s + g.m!.baselineSlipDays, 0) / measured.length);
        const isGeneric = assetType === "Generic";

        return (
          <section key={assetType} className="bg-card border border-border rounded-2xl p-5">
            <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 size={15} className="text-primary" />
                  <h2 className="text-base font-bold text-text-primary truncate">
                    {ASSET_LABELS[assetType]}
                  </h2>
                  {isGeneric && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border bg-warning/10 text-warning border-warning/30 flex items-center gap-1">
                      <AlertCircle size={9} /> Unclassified
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {group.length} schedule{group.length === 1 ? "" : "s"} ·
                  {" "}Tier mix: <span className="text-danger font-semibold">{tierCount.A}A</span> ·
                  {" "}<span className="text-warning font-semibold">{tierCount.B}B</span> ·
                  {" "}<span className="text-success font-semibold">{tierCount.C}C</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-text-secondary">Avg DCMA</div>
                  <div className={`text-lg font-bold font-mono ${
                    avgDCMA === null ? "text-text-secondary" :
                    avgDCMA >= 90 ? "text-success" : avgDCMA >= 70 ? "text-warning" : "text-danger"
                  }`}>{avgDCMA === null ? "…" : `${avgDCMA}/100`}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-text-secondary">Avg Slip</div>
                  <div className={`text-lg font-bold font-mono ${
                    avgSlip === null ? "text-text-secondary" :
                    avgSlip > 7 ? "text-danger" : avgSlip > 0 ? "text-warning" : "text-success"
                  }`}>
                    {avgSlip === null ? "…" : `${avgSlip >= 0 ? "+" : ""}${avgSlip}d`}
                  </div>
                </div>
              </div>
            </header>

            {/* Leaderboard table */}
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">Project</th>
                  <th className="text-left py-2 font-medium">Tier</th>
                  <th className="text-right py-2 font-medium">Floors</th>
                  <th className="text-right py-2 font-medium">Activities</th>
                  <th className="text-right py-2 font-medium">DCMA</th>
                  <th className="text-right py-2 font-medium">Slip</th>
                  <th className="text-right py-2 font-medium">Problems</th>
                  <th className="text-right py-2 font-medium">On dashboard</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => {
                  const ts = tierStyle[e.tier];
                  const onDash = selectedIds.includes(e.schedule.id);
                  const m = e.m;
                  return (
                    <tr key={e.schedule.id} className="border-b border-border last:border-0 hover:bg-overlay/[0.03] transition-colors">
                      <td className="py-2 text-text-secondary font-mono">{i + 1}</td>
                      <td className="py-2">
                        <div className="font-semibold text-text-primary truncate max-w-[280px]">{e.schedule.project.name}</div>
                        <div className="text-[10px] text-text-secondary truncate">{e.headline}</div>
                      </td>
                      <td className="py-2">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border ${ts.bg} ${ts.text}`}>
                          {e.tier}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-text-secondary">{e.floors || "—"}</td>
                      <td className="py-2 text-right font-mono text-text-secondary">{e.activities.toLocaleString()}</td>
                      <td className={`py-2 text-right font-mono font-semibold ${
                        !m ? "text-text-secondary" :
                        m.dcmaScore >= 90 ? "text-success" : m.dcmaScore >= 70 ? "text-warning" : "text-danger"
                      }`}>{m ? `${m.dcmaScore}/100` : "…"}</td>
                      <td className={`py-2 text-right font-mono ${
                        !m ? "text-text-secondary" :
                        m.baselineSlipDays > 7 ? "text-danger" : m.baselineSlipDays > 0 ? "text-warning" : "text-success"
                      }`}>
                        {m ? `${m.baselineSlipDays >= 0 ? "+" : ""}${m.baselineSlipDays}d` : "…"}
                      </td>
                      <td className="py-2 text-right font-mono text-text-secondary">{m ? m.problems.toLocaleString() : "…"}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => toggleSelected(e.schedule.id)}
                          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold border transition-all ${
                            onDash
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "bg-overlay/[0.04] border-border text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {onDash ? "On" : "Add"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
