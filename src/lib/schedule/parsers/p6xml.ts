// Primavera P6 XML parser (PMXML / APIBusinessObjects schema)
//
// Root: <APIBusinessObjects xmlns="http://xmlns.oracle.com/Primavera/P6/V8.4/API/BusinessObjects">
//   <Project>...</Project>
//   <WBS>...</WBS>
//   <Activity>...</Activity>
//   <Relationship>...</Relationship>
//   <Calendar>...</Calendar>

import { XMLParser } from "fast-xml-parser";
import type {
  Schedule,
  ScheduleActivity,
  Calendar,
  WBSNode,
  Predecessor,
  ActivityStatus,
  ActivityType,
  DependencyType,
  ConstraintType,
} from "../types";

const xml = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

const STATUS_MAP: Record<string, ActivityStatus> = {
  "Not Started": "NotStarted",
  "In Progress": "InProgress",
  "Completed":   "Completed",
};

const TYPE_MAP: Record<string, ActivityType> = {
  "Task Dependent":     "TaskDependent",
  "Resource Dependent": "ResourceDependent",
  "Start Milestone":    "Milestone",
  "Finish Milestone":   "Milestone",
  "Level of Effort":    "LOE",
  "WBS Summary":        "WBSSummary",
};

const DEP_MAP: Record<string, DependencyType> = {
  "Finish to Start":  "FS",
  "Start to Start":   "SS",
  "Finish to Finish": "FF",
  "Start to Finish":  "SF",
};

const CSTR_MAP: Record<string, ConstraintType> = {
  "Mandatory Start":             "MSO",
  "Mandatory Finish":            "MFO",
  "Start On":                    "MSO",
  "Finish On":                   "MFO",
  "Start On or After":           "SNET",
  "Start On or Before":          "SNLT",
  "Finish On or After":          "FNET",
  "Finish On or Before":         "FNLT",
  "As Late As Possible":         "ALAP",
};

function toIso(d: string | undefined): string | undefined {
  if (!d) return undefined;
  return d.endsWith("Z") ? d : `${d}.000Z`.replace(".000Z.000Z", ".000Z");
}

export function parseP6XML(text: string, fileName: string): Schedule {
  const warnings: string[] = [];
  const parsed = xml.parse(text);
  const root   = parsed.APIBusinessObjects;

  if (!root) throw new Error("Not a Primavera P6 XML file (missing <APIBusinessObjects> root).");

  const projNode = asArray(root.Project)[0];
  if (!projNode) throw new Error("No <Project> found in P6 XML.");

  // ── Calendars
  const calendars: Calendar[] = asArray(root.Calendar).map((c: Record<string, unknown>) => ({
    id:   String(c.ObjectId ?? "default"),
    name: String(c.Name ?? "Standard"),
    hoursPerDay: parseFloat(String(c.HoursPerDay ?? 8)),
    workdays: [1, 2, 3, 4, 5],
  }));
  if (calendars.length === 0) {
    calendars.push({ id: "default", name: "Standard 5-day", hoursPerDay: 8, workdays: [1, 2, 3, 4, 5] });
  }

  // ── WBS
  const wbs: WBSNode[] = asArray(root.WBS).map((w: Record<string, unknown>) => ({
    id:       String(w.ObjectId),
    parentId: w.ParentObjectId ? String(w.ParentObjectId) : undefined,
    code:     String(w.Code ?? ""),
    name:     String(w.Name ?? ""),
  }));

  // ── Activities
  const activities: ScheduleActivity[] = asArray(root.Activity).map((a: Record<string, unknown>) => {
    const status = STATUS_MAP[String(a.Status ?? "")] ?? "NotStarted";
    const type   = TYPE_MAP[String(a.Type ?? "")]     ?? "TaskDependent";
    const pct    = parseFloat(String(a.PercentComplete ?? a.PhysicalPercentComplete ?? "0"));
    const tf     = a.TotalFloat ? parseFloat(String(a.TotalFloat)) : undefined;

    const constraintLabel = String(a.PrimaryConstraintType ?? "");
    const constraint = CSTR_MAP[constraintLabel]
      ? { type: CSTR_MAP[constraintLabel], date: toIso(String(a.PrimaryConstraintDate ?? "")) }
      : undefined;

    return {
      id:    String(a.ObjectId),
      wbsId: a.WBSObjectId ? String(a.WBSObjectId) : undefined,
      code:  String(a.Id ?? a.ObjectId),
      name:  String(a.Name ?? ""),
      type,
      status,
      pctComplete: pct,

      plannedStart:  toIso(String(a.PlannedStartDate  ?? a.StartDate ?? "")) ?? "",
      plannedFinish: toIso(String(a.PlannedFinishDate ?? a.FinishDate ?? "")) ?? "",
      actualStart:   toIso(String(a.ActualStartDate ?? "")),
      actualFinish:  toIso(String(a.ActualFinishDate ?? "")),
      earlyStart:    toIso(String(a.EarlyStartDate ?? "")),
      earlyFinish:   toIso(String(a.EarlyFinishDate ?? "")),
      lateStart:     toIso(String(a.LateStartDate ?? "")),
      lateFinish:    toIso(String(a.LateFinishDate ?? "")),
      baselineStart:  toIso(String(a.BaselineStartDate  ?? "")),
      baselineFinish: toIso(String(a.BaselineFinishDate ?? "")),

      durationHours:  parseFloat(String(a.PlannedDuration ?? a.AtCompletionDuration ?? "0")),
      remainingHours: parseFloat(String(a.RemainingDuration ?? "0")),
      totalFloatHours: tf,
      freeFloatHours:  a.FreeFloat ? parseFloat(String(a.FreeFloat)) : undefined,

      isCritical:  String(a.Critical) === "true" || (tf !== undefined && tf <= 0),
      isMilestone: type === "Milestone",
      constraint,
      calendarId: a.CalendarObjectId ? String(a.CalendarObjectId) : undefined,

      predecessors: [],
    };
  });

  // ── Relationships → predecessors
  const byId = new Map(activities.map((a) => [a.id, a]));
  for (const r of asArray(root.Relationship) as Record<string, unknown>[]) {
    const succ = byId.get(String(r.SuccessorActivityObjectId));
    if (!succ) continue;
    succ.predecessors.push({
      predId:   String(r.PredecessorActivityObjectId),
      type:     DEP_MAP[String(r.Type ?? "")] ?? "FS",
      lagHours: parseFloat(String(r.Lag ?? "0")),
    });
  }

  return {
    id: crypto.randomUUID(),
    project: {
      id:   String(projNode.ObjectId ?? projNode.Id ?? crypto.randomUUID()),
      code: String(projNode.Id ?? ""),
      name: String(projNode.Name ?? fileName),
      dataDate:    toIso(String(projNode.DataDate ?? "")) ?? new Date().toISOString(),
      startDate:   toIso(String(projNode.PlannedStartDate ?? "")) ?? "",
      finishDate:  toIso(String(projNode.MustFinishByDate ?? projNode.PlannedFinishDate ?? "")) ?? "",
      baselineStart:  toIso(String(projNode.AnticipatedStartDate ?? "")),
      baselineFinish: toIso(String(projNode.AnticipatedFinishDate ?? "")),
      defaultCalendarId: calendars[0]?.id,
      source: "P6_XML",
      importedAt: new Date().toISOString(),
      fileName,
    },
    activities,
    wbs,
    calendars,
    warnings,
  };
}
