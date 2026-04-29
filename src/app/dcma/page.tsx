"use client";
import Link from "next/link";
import { useMemo } from "react";
import {
  ChevronRight, ShieldCheck, CheckCircle2, AlertCircle, XCircle, MinusCircle, ArrowUpRight,
} from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { getPortfolio } from "@/lib/schedule/portfolio";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CheckStatus } from "@/lib/schedule/dcma";

const checkBadge: Record<CheckStatus, string> = {
  pass: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  fail: "bg-danger/15 text-danger border-danger/30",
  "n/a": "bg-overlay/[0.04] text-text-secondary border-border",
};
const checkIcon: Record<CheckStatus, React.ElementType> = {
  pass: CheckCircle2, warn: AlertCircle, fail: XCircle, "n/a": MinusCircle,
};

export default function DCMAIndexPage() {
  const { selected, all, loading } = useSchedule();

  const portfolio = useMemo(() => {
    const pool = selected.length > 0 ? selected : all;
    return pool.length > 0 ? getPortfolio(pool) : null;
  }, [selected, all]);

  if (loading) return <div className="text-center text-text-secondary py-20 text-sm">Loading…</div>;
  if (all.length === 0) return <EmptyState />;
  if (!portfolio) return null;

  const { dcma } = portfolio.analytics;

  return (
    <div className="max-w-[1100px] mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-2 text-xs text-text-secondary animate-fade-in">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">DCMA 14-Point Assessment</span>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <ShieldCheck size={22} className="text-primary mt-0.5" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-text-primary">DCMA 14-Point Assessment</h1>
            <p className="text-sm text-text-secondary mt-1">
              Defense Contract Management Agency standard schedule quality criteria. Click any row for failing activities and detail.
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold font-mono ${
              dcma.overallScore >= 90 ? "text-success" : dcma.overallScore >= 70 ? "text-warning" : "text-danger"
            }`}>{dcma.overallScore}</div>
            <div className="text-[10px] uppercase tracking-wider text-text-secondary">/ 100</div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {dcma.checks.map((c) => {
          const Icon = checkIcon[c.status];
          return (
            <Link
              key={c.id}
              href={`/dcma/${c.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-overlay/[0.03] transition-colors group"
            >
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border w-16 text-center shrink-0 ${checkBadge[c.status]}`}>
                <Icon size={10} className="inline mr-1 -mt-0.5" />{c.status}
              </span>
              <div className="min-w-[200px] shrink-0">
                <div className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">{c.id} — {c.name}</div>
                <div className="text-[11px] text-text-secondary">{c.threshold}</div>
              </div>
              <div className="flex-1 min-w-0 text-[11px] text-text-secondary truncate">{c.description}</div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold text-text-primary">{c.metricValue}</div>
                <div className="text-[10px] text-text-secondary">{c.metricLabel}</div>
              </div>
              <ArrowUpRight size={13} className="text-text-secondary group-hover:text-primary shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
