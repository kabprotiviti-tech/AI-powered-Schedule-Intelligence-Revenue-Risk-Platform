export type RAGStatus = "Green" | "Amber" | "Red";
export type ActivityStatus = "Not Started" | "In Progress" | "Complete" | "Delayed";
export type MilestoneStatus = "Complete" | "On Track" | "At Risk" | "Delayed";
export type ProjectType = "Residential" | "Commercial" | "Mixed-Use" | "Infrastructure";
export type Persona = "CEO" | "PMO" | "Planner";

export interface Activity {
  id: string;
  wbsCode: string;
  name: string;
  frameworkId: string;
  frameworkName: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  forecastEnd: string;
  duration: number;
  remainingDuration: number;
  percentComplete: number;
  float: number;
  isCritical: boolean;
  status: ActivityStatus;
  predecessors: string[];
  successors: string[];
  revenueImpactPerDay: number;
  totalDelayCost: number;
  responsible: string;
  delayDays: number;
  rootCause?: string;
  recommendedAction?: string;
}

export interface Framework {
  id: string;
  name: string;
  percentComplete: number;
  healthScore: number;
  totalActivities: number;
  delayedActivities: number;
  criticalActivities: number;
  floatConsumedPct: number;
  activities: Activity[];
}

export interface Milestone {
  id: string;
  name: string;
  plannedDate: string;
  forecastDate: string;
  actualDate?: string;
  status: MilestoneStatus;
  revenueImpact: number;
  delayDays: number;
}

export interface SPIDataPoint {
  month: string;
  spi: number;
  cpi: number;
  planned: number;
  actual: number;
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  location: string;
  contractor: string;
  plannedStart: string;
  plannedEnd: string;
  forecastEnd: string;
  percentComplete: number;
  budget: number;
  spentToDate: number;
  spi: number;
  cpi: number;
  totalFloat: number;
  criticalActivities: number;
  delayedActivities: number;
  totalActivities: number;
  milestones: Milestone[];
  frameworks: Framework[];
  healthScore: number;
  ragStatus: RAGStatus;
  revenueAtRisk: number;
  delayDays: number;
  topRisk: string;
  spiHistory: SPIDataPoint[];
  projectManager: string;
  units?: number;
  soldUnits?: number;
}

export interface PortfolioMetrics {
  totalProjects: number;
  totalBudget: number;
  totalRevenueAtRisk: number;
  avgHealthScore: number;
  ragCounts: { Green: number; Amber: number; Red: number };
  totalDelayedActivities: number;
  totalCriticalActivities: number;
  forecastVarianceDays: number;
  onTimeDeliveryRate: number;
}
