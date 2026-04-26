import { PROJECTS, PORTFOLIO_OUTLOOK } from "@/lib/data/mock";
import { computePortfolioMetrics, formatAED, formatAEDShort, healthScoreFormula, revenueRiskFormula, spiFormula } from "@/lib/calculations";
import { MetricCard } from "@/components/ui/MetricCard";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { RAGBadge } from "@/components/ui/RAGBadge";
import { PortfolioOutlookChart } from "@/components/portfolio/PortfolioOutlookChart";
import { ProjectHeatmap } from "@/components/portfolio/ProjectHeatmap";
import { EscalationQueue } from "@/components/portfolio/EscalationQueue";

export default function PortfolioPage() {
  const metrics = computePortfolioMetrics(PROJECTS);
  const redProjects = PROJECTS.filter((p) => p.ragStatus === "Red");
  const amberProjects = PROJECTS.filter((p) => p.ragStatus === "Amber");

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Portfolio Overview</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            As of {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · 8 active projects · Data refreshed 4 min ago
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary border border-border rounded-lg px-3 py-1.5 bg-card">
            Reporting Period: Q2 2025
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="col-span-1 bg-card border border-border rounded-xl p-5 flex flex-col items-center justify-center">
          <HealthGauge score={metrics.avgHealthScore} size={110} />
          <div className="text-[11px] text-text-secondary uppercase tracking-wider mt-2">Portfolio Health</div>
          <div className="text-[10px] text-text-muted mt-1 cursor-pointer hover:text-primary transition-colors" title={healthScoreFormula()}>
            ⓘ How is this calculated?
          </div>
        </div>

        <MetricCard
          label="Revenue at Risk"
          value={formatAED(metrics.totalRevenueAtRisk)}
          sub={`Across ${redProjects.length + amberProjects.length} projects`}
          formula={revenueRiskFormula()}
          accent="red"
          large
        />
        <MetricCard
          label="Portfolio Budget"
          value={formatAED(metrics.totalBudget)}
          sub={`${metrics.totalProjects} projects tracked`}
          accent="blue"
        />
        <MetricCard
          label="Critical Activities"
          value={String(metrics.totalCriticalActivities)}
          sub={`${metrics.totalDelayedActivities} currently delayed`}
          accent="amber"
          formula={spiFormula()}
        />
        <MetricCard
          label="On-Time Delivery Rate"
          value={`${metrics.onTimeDeliveryRate}%`}
          sub={`${metrics.ragCounts.Green} of ${metrics.totalProjects} projects on track`}
          trend={metrics.onTimeDeliveryRate >= 50 ? "up" : "down"}
          trendLabel={metrics.onTimeDeliveryRate >= 50 ? "Improving vs last quarter" : "Declined from last quarter"}
          accent={metrics.onTimeDeliveryRate >= 60 ? "green" : metrics.onTimeDeliveryRate >= 40 ? "amber" : "red"}
        />
      </div>

      {/* RAG snapshot */}
      <div className="grid grid-cols-3 gap-3">
        {(["Red", "Amber", "Green"] as const).map((rag) => {
          const count = metrics.ragCounts[rag];
          const riskAED = PROJECTS.filter((p) => p.ragStatus === rag).reduce((s, p) => s + p.revenueAtRisk, 0);
          const colors = { Red: "border-danger/30 bg-danger/5", Amber: "border-warning/30 bg-warning/5", Green: "border-success/30 bg-success/5" };
          const textColors = { Red: "text-danger", Amber: "text-warning", Green: "text-success" };
          return (
            <div key={rag} className={`border rounded-xl px-5 py-4 flex items-center justify-between ${colors[rag]}`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${rag === "Red" ? "bg-danger" : rag === "Amber" ? "bg-warning" : "bg-success"}`} />
                <div>
                  <div className="text-sm font-semibold text-text-primary">{count} {rag} Project{count !== 1 ? "s" : ""}</div>
                  <div className="text-xs text-text-secondary">{formatAED(riskAED)} at risk</div>
                </div>
              </div>
              <div className={`text-3xl font-bold ${textColors[rag]}`}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Revenue at Risk — 6-Month Outlook</h2>
              <p className="text-xs text-text-secondary mt-0.5">Projected reduction in risk exposure if recovery plans executed</p>
            </div>
          </div>
          <PortfolioOutlookChart data={PORTFOLIO_OUTLOOK} />
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-1">SPI Benchmarks</h2>
          <p className="text-xs text-text-secondary mb-4">Schedule Performance Index by project</p>
          <div className="space-y-3">
            {PROJECTS.sort((a, b) => a.spi - b.spi).map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-24 text-[11px] text-text-secondary truncate">{p.name.split("—")[0].trim()}</div>
                <div className="flex-1 h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, p.spi * 80)}%`,
                      background: p.spi >= 0.95 ? "#10b981" : p.spi >= 0.85 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <div className="w-8 text-right text-[11px] font-mono font-medium" style={{ color: p.spi >= 0.95 ? "#10b981" : p.spi >= 0.85 ? "#f59e0b" : "#ef4444" }}>
                  {p.spi.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ProjectHeatmap projects={PROJECTS} />
        </div>
        <div>
          <EscalationQueue projects={PROJECTS} />
        </div>
      </div>
    </div>
  );
}
