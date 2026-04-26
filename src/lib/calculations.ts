import type { Project, PortfolioMetrics } from "./types";

export function computeHealthScore(spi: number, milestoneAdherence: number, floatPct: number, completionRate: number): number {
  const spiScore = Math.min(100, Math.max(0, spi * 100));
  const milestoneScore = Math.min(100, milestoneAdherence);
  const floatScore = Math.min(100, Math.max(0, floatPct));
  const completionScore = Math.min(100, completionRate);
  return Math.round(spiScore * 0.4 + milestoneScore * 0.25 + floatScore * 0.2 + completionScore * 0.15);
}

export function healthScoreFormula(): string {
  return "Health Score = (SPI × 40%) + (Milestone Adherence × 25%) + (Float Position × 20%) + (Activity Completion Rate × 15%)";
}

export function revenueRiskFormula(): string {
  return "Revenue at Risk = Σ (Delayed Activities × Revenue Impact per Day × Delay Days)";
}

export function spiFormula(): string {
  return "SPI = Earned Value (EV) ÷ Planned Value (PV). SPI > 1.0 = Ahead. SPI < 1.0 = Behind.";
}

export function computePortfolioMetrics(projects: Project[]): PortfolioMetrics {
  const ragCounts = { Green: 0, Amber: 0, Red: 0 };
  projects.forEach((p) => ragCounts[p.ragStatus]++);

  return {
    totalProjects: projects.length,
    totalBudget: projects.reduce((s, p) => s + p.budget, 0),
    totalRevenueAtRisk: projects.reduce((s, p) => s + p.revenueAtRisk, 0),
    avgHealthScore: Math.round(projects.reduce((s, p) => s + p.healthScore, 0) / projects.length),
    ragCounts,
    totalDelayedActivities: projects.reduce((s, p) => s + p.delayedActivities, 0),
    totalCriticalActivities: projects.reduce((s, p) => s + p.criticalActivities, 0),
    forecastVarianceDays: Math.round(projects.reduce((s, p) => s + p.delayDays, 0) / projects.length),
    onTimeDeliveryRate: Math.round((ragCounts.Green / projects.length) * 100),
  };
}

export function formatAED(value: number): string {
  if (value >= 1_000_000_000) return `AED ${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `AED ${(value / 1_000).toFixed(0)}K`;
  return `AED ${value.toLocaleString()}`;
}

export function formatAEDShort(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000).toFixed(0)}K`;
}

export function ragColor(status: string): string {
  if (status === "Green") return "#10b981";
  if (status === "Amber") return "#f59e0b";
  return "#ef4444";
}

export function spiColor(spi: number): string {
  if (spi >= 0.95) return "#10b981";
  if (spi >= 0.85) return "#f59e0b";
  return "#ef4444";
}

export function healthColor(score: number): string {
  if (score >= 75) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

export function floatColor(float: number): string {
  if (float > 14) return "#10b981";
  if (float > 0) return "#f59e0b";
  return "#ef4444";
}
