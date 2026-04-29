"use client";
import Link from "next/link";
import { ChevronRight, ArrowRight, FileCheck2 } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { computeStats, ragFromStats } from "@/lib/schedule/stats";
import { EmptyState } from "@/components/ui/EmptyState";

const ragColors = { Red: "var(--danger)", Amber: "var(--warning)", Green: "var(--success)" } as const;

export default function ProjectsPage() {
  const { selectedIds, all, toggleSelected, loading } = useSchedule();

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0) return <EmptyState title="No imported schedules yet" />;

  return (
    <div className="max-w-[1360px] mx-auto space-y-8 pb-12">
      <div className="flex items-start justify-between gap-4 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
            <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
            <ChevronRight size={12} />
            <span className="text-text-primary">Schedules</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Imported Schedules</h1>
          <p className="text-sm text-text-secondary mt-1">{all.length} schedule{all.length === 1 ? "" : "s"} imported</p>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
        >
          Upload another
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {all.map((s) => {
          const stats = computeStats(s);
          const rag   = ragFromStats(stats);
          const isActive = selectedIds.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSelected(s.id)}
              className={`text-left bg-card border ${isActive ? "border-primary/40" : "border-border"} rounded-2xl p-5 hover:-translate-y-0.5 transition-all`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-text-primary truncate">{s.project.name}</div>
                  <div className="text-[11px] text-text-secondary mt-0.5">
                    {s.project.source.replace("_", " ")} · {new Date(s.project.importedAt).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold shrink-0"
                  style={{ background: `${ragColors[rag]}20`, color: ragColors[rag], border: `1px solid ${ragColors[rag]}40` }}
                >
                  {rag}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="Activities" value={stats.totalActivities} />
                <Stat label="Critical"   value={stats.critical} accent="danger" />
                <Stat label="% Done"     value={`${stats.pctComplete.toFixed(0)}%`} />
              </div>

              <div className="flex items-center justify-between text-[11px] text-text-secondary">
                <span>Slip vs baseline</span>
                <span className={`font-mono font-semibold ${stats.baselineSlipDays > 7 ? "text-danger" : stats.baselineSlipDays > 0 ? "text-warning" : "text-success"}`}>
                  {stats.baselineSlipDays >= 0 ? "+" : ""}{stats.baselineSlipDays}d
                </span>
              </div>

              {isActive && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-primary font-semibold">
                  <FileCheck2 size={11} /> ON DASHBOARD
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-overlay/[0.02] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`text-sm font-bold font-mono ${accent === "danger" ? "text-danger" : "text-text-primary"}`}>{value}</div>
    </div>
  );
}
