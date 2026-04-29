"use client";
import Link from "next/link";
import { TrendingDown, AlertTriangle, ShieldCheck, Target, ArrowRight } from "lucide-react";
import type { Schedule } from "@/lib/schedule/types";
import type { ScheduleAnalytics } from "@/lib/schedule/analytics";
import { ragFromStats } from "@/lib/schedule/stats";
import { BenchmarkPanel } from "./BenchmarkPanel";

const ragColors = { Red: "var(--danger)", Amber: "var(--warning)", Green: "var(--success)" } as const;

export function CEODashboard({ schedule, analytics }: { schedule: Schedule; analytics: ScheduleAnalytics }) {
  const { stats, cpm, dcma, baseline } = analytics;
  const rag = ragFromStats(stats);

  // CEO narrative bullets — what needs attention right now
  const insights: { icon: React.ElementType; text: string; tone: "danger" | "warning" | "success" }[] = [];
  if (baseline.hasBaseline && baseline.projectFinishVarDays > 7) {
    insights.push({ icon: TrendingDown, text: `Project will finish ${baseline.projectFinishVarDays} days late vs baseline.`, tone: "danger" });
  } else if (baseline.hasBaseline && baseline.projectFinishVarDays > 0) {
    insights.push({ icon: TrendingDown, text: `Project tracking ${baseline.projectFinishVarDays} days behind baseline.`, tone: "warning" });
  } else if (baseline.hasBaseline) {
    insights.push({ icon: Target, text: `On track — finishing ${Math.abs(baseline.projectFinishVarDays)} days ahead/at baseline.`, tone: "success" });
  }
  if (dcma.overallScore < 70) {
    insights.push({ icon: ShieldCheck, text: `DCMA score ${dcma.overallScore}/100 — below 70 threshold; ${dcma.failCount} checks failing.`, tone: "danger" });
  } else if (dcma.overallScore < 90) {
    insights.push({ icon: ShieldCheck, text: `DCMA score ${dcma.overallScore}/100 — ${dcma.warnCount} checks warning.`, tone: "warning" });
  }
  const negFloat = dcma.checks.find((c) => c.id === "NEG_FLOAT")?.failingIds.length ?? 0;
  if (negFloat > 0) {
    insights.push({ icon: AlertTriangle, text: `${negFloat} activities have negative float — schedule is logically infeasible.`, tone: "danger" });
  }
  if (cpm.critical.size > stats.totalActivities * 0.3) {
    insights.push({ icon: AlertTriangle, text: `Critical path is ${((cpm.critical.size / stats.totalActivities) * 100).toFixed(0)}% of activities — highly fragile.`, tone: "warning" });
  }
  if (insights.length === 0) {
    insights.push({ icon: Target, text: "No critical issues detected — schedule is healthy.", tone: "success" });
  }

  // Top 5 worst slippages or, if no baseline, top 5 critical
  const topRisks = baseline.hasBaseline && baseline.worstSlippages.length > 0
    ? baseline.worstSlippages
        .filter((v) => v.finishVarDays > 0)
        .slice(0, 5)
        .map((v) => ({
          id: v.id,
          activity: schedule.activities.find((a) => a.id === v.id),
          metric: `+${v.finishVarDays}d`,
          metricLabel: "behind baseline",
        }))
    : schedule.activities
        .filter((a) => cpm.critical.has(a.id))
        .sort((a, b) => (cpm.totalFloat.get(a.id) ?? 0) - (cpm.totalFloat.get(b.id) ?? 0))
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          activity: a,
          metric: `${((cpm.totalFloat.get(a.id) ?? 0) / 8).toFixed(1)}d`,
          metricLabel: "float",
        }));

  return (
    <div className="space-y-8">
      {/* Three hero numbers — all clickable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Hero
          href="/activities?filter=delayed&title=Delayed%20Activities"
          label="Schedule Slip"
          value={`${baseline.projectFinishVarDays >= 0 ? "+" : ""}${baseline.projectFinishVarDays}d`}
          subtitle={baseline.hasBaseline ? "vs baseline · click for delayed activities" : "no baseline imported"}
          tone={baseline.projectFinishVarDays > 7 ? "danger" : baseline.projectFinishVarDays > 0 ? "warning" : "success"}
        />
        <Hero
          href="/dcma/CP_TEST"
          label="DCMA Score"
          value={`${dcma.overallScore}`}
          suffix="/100"
          subtitle={`${dcma.failCount} fail · ${dcma.warnCount} warn · ${dcma.passCount} pass`}
          tone={dcma.overallScore >= 90 ? "success" : dcma.overallScore >= 70 ? "warning" : "danger"}
        />
        <Hero
          href="/activities?filter=critical&title=Critical%20Path"
          label="Critical Path"
          value={`${cpm.critical.size}`}
          subtitle={`of ${stats.totalActivities} activities · ${stats.pctComplete.toFixed(0)}% complete`}
          tone={cpm.critical.size > stats.totalActivities * 0.3 ? "warning" : "neutral"}
        />
      </div>

      {/* Benchmark intelligence */}
      <BenchmarkPanel schedule={schedule} analytics={analytics} compact />


      {/* What needs attention */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-wider">What Needs Your Attention</h2>
        <div className="space-y-3">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            const colorClass = ins.tone === "danger" ? "text-danger" : ins.tone === "warning" ? "text-warning" : "text-success";
            const bgClass    = ins.tone === "danger" ? "bg-danger/8 border-danger/20" : ins.tone === "warning" ? "bg-warning/8 border-warning/20" : "bg-success/8 border-success/20";
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${bgClass}`}>
                <Icon size={16} className={`${colorClass} shrink-0 mt-0.5`} />
                <p className="text-sm text-text-primary leading-relaxed flex-1">{ins.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 5 risks */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Top 5 Risk Activities</h2>
          <Link href="/projects" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {topRisks.map((r) => r.activity && (
            <li key={r.id}>
              <Link
                href={`/activity/${r.id}`}
                className="flex items-center gap-3 py-3 hover:bg-overlay/[0.03] -mx-3 px-3 rounded-lg transition-colors group"
              >
                <span className="font-mono text-[11px] text-text-secondary w-24 shrink-0 truncate">{r.activity.code}</span>
                <span className="flex-1 truncate text-sm text-text-primary group-hover:text-primary transition-colors">{r.activity.name}</span>
                <span className="text-right shrink-0">
                  <div className="font-mono text-sm font-bold text-danger">{r.metric}</div>
                  <div className="text-[10px] text-text-secondary uppercase tracking-wider">{r.metricLabel}</div>
                </span>
              </Link>
            </li>
          ))}
          {topRisks.length === 0 && (
            <li className="py-6 text-sm text-text-secondary text-center">No high-risk activities flagged.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Hero({
  label, value, suffix, subtitle, tone, href,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  subtitle: string;
  tone: "danger" | "warning" | "success" | "neutral";
  href?: string;
}) {
  const border = tone === "danger" ? "border-danger/40" : tone === "warning" ? "border-warning/40" : tone === "success" ? "border-success/40" : "border-border";
  const text   = tone === "danger" ? "text-danger"      : tone === "warning" ? "text-warning"      : tone === "success" ? "text-success"      : "text-text-primary";
  const glow   = tone === "danger" ? "glow-red"         : tone === "warning" ? "glow-amber"        : "";
  const inner = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-3">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-5xl font-bold font-mono ${text}`}>{value}</span>
        {suffix && <span className="text-lg text-text-secondary font-medium">{suffix}</span>}
      </div>
      <div className="text-xs text-text-secondary mt-3">{subtitle}</div>
    </>
  );
  const cls = `bg-card border ${border} ${glow} rounded-2xl p-6 hover:-translate-y-0.5 transition-transform block`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
