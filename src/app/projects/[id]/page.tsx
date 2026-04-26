import { notFound } from "next/navigation";
import { PROJECTS } from "@/lib/data/mock";
import { formatAED, healthColor, healthScoreFormula, revenueRiskFormula, spiFormula } from "@/lib/calculations";
import { RAGBadge } from "@/components/ui/RAGBadge";
import { MetricCard } from "@/components/ui/MetricCard";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { SPITrendChart } from "@/components/project/SPITrendChart";
import { MilestoneTracker } from "@/components/project/MilestoneTracker";
import Link from "next/link";
import { ChevronRight, ArrowRight, Layers } from "lucide-react";

interface Props {
  params: { id: string };
}

export async function generateStaticParams() {
  return PROJECTS.map((p) => ({ id: p.id }));
}

export default function ProjectDetailPage({ params }: Props) {
  const project = PROJECTS.find((p) => p.id === params.id);
  if (!project) notFound();

  const delayedMs = project.milestones.filter((m) => m.status === "Delayed" || m.status === "At Risk").length;
  const milestoneAdherence = Math.round(((project.milestones.length - delayedMs) / project.milestones.length) * 100);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link href="/" className="hover:text-primary transition-colors">Portfolio</Link>
        <ChevronRight size={12} />
        <Link href="/projects" className="hover:text-primary transition-colors">Projects</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
            <RAGBadge status={project.ragStatus} />
          </div>
          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span>{project.location}</span>
            <span>·</span>
            <span>{project.type}</span>
            <span>·</span>
            <span>PM: <span className="text-text-primary">{project.projectManager}</span></span>
            <span>·</span>
            <span>Contractor: <span className="text-text-primary">{project.contractor}</span></span>
          </div>
        </div>
        <Link
          href={`/projects/${project.id}/activities`}
          className="flex items-center gap-2 text-xs bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dim transition-colors font-medium"
        >
          <Layers size={13} />
          Activity Drill-down
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center">
          <HealthGauge score={project.healthScore} size={100} />
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">Health Score</div>
        </div>
        <MetricCard label="Revenue at Risk" value={formatAED(project.revenueAtRisk)} formula={revenueRiskFormula()} accent={project.revenueAtRisk > 500_000_000 ? "red" : "amber"} />
        <MetricCard label="SPI" value={project.spi.toFixed(2)} sub="Schedule Perf. Index" formula={spiFormula()} accent={project.spi >= 0.95 ? "green" : project.spi >= 0.85 ? "amber" : "red"} />
        <MetricCard label="% Complete" value={`${project.percentComplete}%`} sub={`Budget: ${formatAED(project.budget)}`} />
        <MetricCard
          label="Forecast Delay"
          value={project.delayDays > 0 ? `+${project.delayDays} days` : `${Math.abs(project.delayDays)}d ahead`}
          sub={`Forecast end: ${project.forecastEnd}`}
          accent={project.delayDays > 30 ? "red" : project.delayDays > 0 ? "amber" : "green"}
        />
        <MetricCard
          label="Milestone Adherence"
          value={`${milestoneAdherence}%`}
          sub={`${delayedMs} of ${project.milestones.length} at risk`}
          accent={milestoneAdherence >= 80 ? "green" : milestoneAdherence >= 60 ? "amber" : "red"}
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-5">
        {/* SPI Trend */}
        <div className="col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">SPI / CPI Trend — 9 Months</h2>
              <p className="text-xs text-text-secondary mt-0.5">Blue dashed line = target (1.0). Hover for values.</p>
            </div>
          </div>
          <SPITrendChart data={project.spiHistory} />

          {/* Insight banner */}
          {project.spi < 0.90 && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-danger/8 border border-danger/20">
              <div className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-semibold text-danger mb-0.5">SPI Trend Alert</div>
                <div className="text-[11px] text-text-secondary">SPI has declined below 0.90 for 3+ consecutive months. At current trajectory, forecast overrun increases by ~{Math.round((1 - project.spi) * 100)}% unless corrective action is taken within 30 days.</div>
              </div>
            </div>
          )}
        </div>

        {/* Critical stats */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Activity Summary</h3>
            <div className="space-y-3">
              {[
                { label: "Total Activities", value: project.totalActivities, color: "text-text-primary" },
                { label: "On Critical Path", value: project.criticalActivities, color: "text-warning" },
                { label: "Currently Delayed", value: project.delayedActivities, color: "text-danger" },
                { label: "Total Float", value: `${project.totalFloat} days`, color: project.totalFloat > 0 ? "text-success" : "text-danger" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{label}</span>
                  <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Top Risk Signal</h3>
            <div className="text-xs text-text-secondary leading-relaxed">{project.topRisk}</div>
            <div className="mt-3 text-[11px] text-primary cursor-pointer hover:underline">→ See recovery recommendation</div>
          </div>
        </div>
      </div>

      {/* Frameworks + Milestones */}
      <div className="grid grid-cols-2 gap-5">
        {/* Frameworks */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4">WBS Framework Health</h2>
          <div className="space-y-3">
            {project.frameworks.map((fw) => (
              <div key={fw.id} className="p-3 rounded-lg bg-surface border border-border-subtle">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-text-primary">{fw.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-danger">{fw.delayedActivities} delayed</span>
                    <span className="text-[10px] font-mono font-semibold" style={{ color: healthColor(fw.healthScore) }}>{fw.healthScore}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-border-subtle rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${fw.percentComplete}%`, background: healthColor(fw.healthScore) }} />
                  </div>
                  <span className="text-[10px] text-text-secondary w-8 text-right">{fw.percentComplete}%</span>
                </div>
                <div className="flex items-center gap-4 mt-1.5">
                  <span className="text-[10px] text-text-secondary">{fw.totalActivities} activities</span>
                  <span className="text-[10px] text-warning">{fw.criticalActivities} critical</span>
                  <span className="text-[10px] text-text-secondary">Float consumed: {fw.floatConsumedPct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Milestones */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Milestone Tracker</h2>
            <div className="flex items-center gap-2 text-[10px] text-text-secondary">
              {(["Complete", "On Track", "At Risk", "Delayed"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s === "Complete" ? "#10b981" : s === "On Track" ? "#3b82f6" : s === "At Risk" ? "#f59e0b" : "#ef4444" }} />
                  {s}
                </span>
              ))}
            </div>
          </div>
          <MilestoneTracker milestones={project.milestones} />
        </div>
      </div>
    </div>
  );
}
