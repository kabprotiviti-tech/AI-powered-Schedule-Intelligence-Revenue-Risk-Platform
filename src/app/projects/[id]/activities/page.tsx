// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
import { notFound } from "next/navigation";
import { PROJECTS } from "@/lib/data/mock";
import { formatAED, floatColor } from "@/lib/calculations";
import { RAGBadge } from "@/components/ui/RAGBadge";
import Link from "next/link";
import { ChevronRight, AlertTriangle, CheckCircle, Clock, Play } from "lucide-react";
import clsx from "clsx";
import type { Activity } from "@/lib/types";

interface Props {
  params: { id: string };
}

export async function generateStaticParams() {
  return PROJECTS.map((p) => ({ id: p.id }));
}

const statusIcons = {
  "Not Started": { icon: Clock, color: "text-text-secondary" },
  "In Progress": { icon: Play, color: "text-primary" },
  "Complete": { icon: CheckCircle, color: "text-success" },
  "Delayed": { icon: AlertTriangle, color: "text-danger" },
};

export default function ActivitiesPage({ params }: Props) {
  const project = PROJECTS.find((p) => p.id === params.id);
  if (!project) notFound();

  const allActivities: Activity[] = project.frameworks.flatMap((fw) => fw.activities);
  const delayed = allActivities.filter((a) => a.status === "Delayed");
  const critical = allActivities.filter((a) => a.isCritical);
  const totalRisk = delayed.reduce((s, a) => s + a.totalDelayCost, 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link href="/" className="hover:text-primary transition-colors">Portfolio</Link>
        <ChevronRight size={12} />
        <Link href="/projects" className="hover:text-primary transition-colors">Projects</Link>
        <ChevronRight size={12} />
        <Link href={`/projects/${project.id}`} className="hover:text-primary transition-colors">{project.name}</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">Activity Drill-down</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-text-primary">Activity-Level Detail</h1>
            <RAGBadge status={project.ragStatus} />
          </div>
          <p className="text-sm text-text-secondary">{project.name} · {allActivities.length} activities across {project.frameworks.length} frameworks</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Delayed Activities", value: delayed.length, color: "text-danger", bg: "bg-danger/8 border-danger/20" },
          { label: "Critical Path", value: critical.length, color: "text-warning", bg: "bg-warning/8 border-warning/20" },
          { label: "Total Activities", value: allActivities.length, color: "text-text-primary", bg: "bg-card border-border" },
          { label: "Revenue at Risk", value: formatAED(totalRisk), color: "text-danger", bg: "bg-danger/5 border-danger/15" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`border rounded-xl px-5 py-4 ${bg}`}>
            <div className="text-[11px] text-text-secondary uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Per-framework drill-down */}
      {project.frameworks.map((fw) => (
        <div key={fw.id} className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Framework header */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-text-primary">{fw.name}</div>
              <span className="text-[10px] text-text-secondary">{fw.totalActivities} activities</span>
              {fw.delayedActivities > 0 && (
                <span className="text-[10px] bg-danger/10 text-danger border border-danger/20 rounded-full px-2 py-0.5 font-semibold">{fw.delayedActivities} delayed</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <span>Health: <span className="font-semibold text-text-primary">{fw.healthScore}</span></span>
              <span>Complete: <span className="font-semibold text-text-primary">{fw.percentComplete}%</span></span>
            </div>
          </div>

          {/* Activity table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs data-table">
              <thead>
                <tr className="text-[10px] text-text-secondary uppercase tracking-wider border-b border-border-subtle">
                  <th className="text-left py-2.5 px-4 font-medium w-28">WBS Code</th>
                  <th className="text-left py-2.5 px-3 font-medium">Activity</th>
                  <th className="text-center py-2.5 px-3 font-medium">Status</th>
                  <th className="text-right py-2.5 px-3 font-medium">% Done</th>
                  <th className="text-right py-2.5 px-3 font-medium">Float</th>
                  <th className="text-right py-2.5 px-3 font-medium">Delay</th>
                  <th className="text-right py-2.5 px-3 font-medium">Revenue / Day</th>
                  <th className="text-left py-2.5 px-4 font-medium">Root Cause</th>
                  <th className="text-left py-2.5 pl-3 pr-4 font-medium">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {fw.activities.map((a) => {
                  const { icon: Icon, color } = statusIcons[a.status];
                  return (
                    <tr key={a.id} className={clsx("transition-colors", a.isCritical && "bg-warning/3", a.status === "Delayed" && "bg-danger/3")}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {a.isCritical && <span className="w-1 h-1 rounded-full bg-warning flex-shrink-0" title="Critical path" />}
                          <span className="font-mono text-[10px] text-text-secondary">{a.wbsCode}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-xs font-medium text-text-primary max-w-[180px] truncate">{a.name}</div>
                        <div className="text-[10px] text-text-secondary mt-0.5">{a.responsible}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Icon size={12} className={color} />
                          <span className={`text-[10px] font-medium ${color}`}>{a.status}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1 bg-border-subtle rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${a.percentComplete}%` }} />
                          </div>
                          <span className="font-mono text-[10px] text-text-secondary">{a.percentComplete}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={`font-mono text-xs font-semibold`} style={{ color: floatColor(a.float) }}>
                          {a.float > 0 ? `+${a.float}d` : `${a.float}d`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {a.delayDays > 0 ? (
                          <span className="font-mono text-xs text-danger font-semibold">+{a.delayDays}d</span>
                        ) : (
                          <span className="text-[10px] text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {a.delayDays > 0 ? (
                          <span className="font-mono text-[10px] text-warning">{formatAED(a.revenueImpactPerDay)}</span>
                        ) : (
                          <span className="text-[10px] text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {a.rootCause ? (
                          <span className="text-[10px] text-text-secondary max-w-[160px] block truncate" title={a.rootCause}>{a.rootCause}</span>
                        ) : (
                          <span className="text-[10px] text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 pl-3 pr-4">
                        {a.recommendedAction ? (
                          <span className="text-[10px] text-primary max-w-[200px] block truncate" title={a.recommendedAction}>{a.recommendedAction}</span>
                        ) : (
                          <span className="text-[10px] text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Explainability footer */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">How Metrics Are Calculated</h3>
        <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary">
          <div>
            <span className="text-primary font-semibold block mb-0.5">Float</span>
            Total slack in an activity before it impacts the project end date. Negative float = project is already past its critical path baseline.
          </div>
          <div>
            <span className="text-primary font-semibold block mb-0.5">Revenue / Day</span>
            Estimated revenue impact per day of delay for this activity, based on contract milestones, unit handover schedule, and penalty clauses.
          </div>
          <div>
            <span className="text-primary font-semibold block mb-0.5">Root Cause</span>
            Captured from site reports, RFI logs, and contractor submissions. Updated on each data refresh cycle (every 48hrs).
          </div>
          <div>
            <span className="text-primary font-semibold block mb-0.5">Critical Path</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" /> dot</span> = activity is on the longest path through the network. Any delay on this activity directly delays project completion.
          </div>
        </div>
      </div>
    </div>
  );
}
