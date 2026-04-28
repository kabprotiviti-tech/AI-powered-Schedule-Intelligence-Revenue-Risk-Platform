// Canonical internal schedule model — all parsers normalize to this.

export type ScheduleSource = "P6_XER" | "P6_XML" | "MSP_XML";
export type ConstraintType =
  | "NONE"
  | "MSO"   // Must Start On
  | "MFO"   // Must Finish On
  | "SNET"  // Start No Earlier Than
  | "SNLT"  // Start No Later Than
  | "FNET"  // Finish No Earlier Than
  | "FNLT"  // Finish No Later Than
  | "ASAP"
  | "ALAP";

export type DependencyType = "FS" | "SS" | "FF" | "SF";
export type ActivityType   = "TaskDependent" | "ResourceDependent" | "Milestone" | "LOE" | "WBSSummary";
export type ActivityStatus = "NotStarted" | "InProgress" | "Completed";

export interface Calendar {
  id: string;
  name: string;
  hoursPerDay: number;
  workdays: number[];                // [1..7] = Mon..Sun (ISO)
  exceptions?: { date: string; working: boolean; hours?: number }[];
}

export interface WBSNode {
  id: string;
  parentId?: string;
  code: string;
  name: string;
}

export interface Predecessor {
  predId: string;
  type: DependencyType;
  lagHours: number;
}

export interface ScheduleActivity {
  id: string;
  wbsId?: string;
  code: string;                       // user-visible activity ID
  name: string;
  type: ActivityType;
  status: ActivityStatus;
  pctComplete: number;                // 0..100

  plannedStart: string;               // ISO
  plannedFinish: string;              // ISO
  actualStart?: string;
  actualFinish?: string;
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  baselineStart?: string;
  baselineFinish?: string;

  durationHours: number;              // original duration
  remainingHours: number;
  totalFloatHours?: number;
  freeFloatHours?: number;

  isCritical?: boolean;
  isMilestone?: boolean;
  constraint?: { type: ConstraintType; date?: string };
  calendarId?: string;

  predecessors: Predecessor[];

  // Cost / resource (optional, populated when present)
  budgetCost?: number;
  actualCost?: number;
  remainingCost?: number;
  responsible?: string;
}

export interface ScheduleProject {
  id: string;
  code: string;
  name: string;
  dataDate: string;                   // ISO — schedule "as of"
  startDate: string;
  finishDate: string;
  baselineStart?: string;
  baselineFinish?: string;
  defaultCalendarId?: string;
  source: ScheduleSource;
  importedAt: string;
  fileName: string;
  totalBudget?: number;
  currency?: string;
}

export interface Schedule {
  id: string;                         // uuid generated at import
  project: ScheduleProject;
  activities: ScheduleActivity[];
  wbs: WBSNode[];
  calendars: Calendar[];
  warnings: string[];                 // parser warnings
}

// Convenience aggregates (computed, never persisted)
export interface ScheduleStats {
  activityCount: number;
  milestoneCount: number;
  criticalCount: number;
  completedPct: number;
  totalDurationDays: number;
  earliestStart: string;
  latestFinish: string;
}
