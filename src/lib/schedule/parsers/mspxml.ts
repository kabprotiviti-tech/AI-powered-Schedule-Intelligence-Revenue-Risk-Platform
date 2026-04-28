// Microsoft Project XML parser (Project 2003+ XML export schema)
// Schema namespace: http://schemas.microsoft.com/project
//
// Top-level shape:
//   <Project>
//     <Name>...</Name>
//     <StartDate>...</StartDate>
//     <FinishDate>...</FinishDate>
//     <Calendars><Calendar>...</Calendar>...</Calendars>
//     <Tasks><Task>...</Task>...</Tasks>
//   </Project>
//
// Tasks contain UID, ID (display), Name, Start, Finish, Duration (PT...H/M format),
// PercentComplete, Predecessors as <PredecessorLink>, Critical, Milestone, etc.

import { XMLParser } from "fast-xml-parser";
import type {
  Schedule,
  ScheduleActivity,
  Calendar,
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

// MSP encodes durations as ISO-8601: PT80H0M0S
function parseDurationToHours(d: string | undefined): number {
  if (!d) return 0;
  const m = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, h = "0", min = "0", s = "0"] = m;
  return parseInt(h) + parseInt(min) / 60 + parseInt(s) / 3600;
}

// MSP enumerated values
const TYPE_MAP: Record<string, DependencyType> = {
  "0": "FF",
  "1": "FS",
  "2": "SF",
  "3": "SS",
};

const CONSTRAINT_MAP: Record<string, ConstraintType> = {
  "0": "ASAP",
  "1": "ALAP",
  "2": "MSO",
  "3": "MFO",
  "4": "SNET",
  "5": "SNLT",
  "6": "FNET",
  "7": "FNLT",
};

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function toIso(d: string | undefined): string | undefined {
  if (!d) return undefined;
  // MSP uses local time without TZ — append Z for consistency.
  return d.endsWith("Z") ? d : `${d}.000Z`.replace(".000Z.000Z", ".000Z");
}

export function parseMSPXML(text: string, fileName: string): Schedule {
  const warnings: string[] = [];
  const parsed = xml.parse(text);
  const proj = parsed.Project;

  if (!proj || !proj.Tasks) {
    throw new Error("Not a Microsoft Project XML file (missing <Project>/<Tasks> root).");
  }

  // ── Calendars
  const calNodes = asArray(proj.Calendars?.Calendar);
  const calendars: Calendar[] = calNodes.map((c: Record<string, unknown>) => ({
    id:   String(c.UID ?? "default"),
    name: String(c.Name ?? "Standard"),
    hoursPerDay: 8,
    workdays: [1, 2, 3, 4, 5],
  }));
  if (calendars.length === 0) {
    calendars.push({ id: "default", name: "Standard 5-day", hoursPerDay: 8, workdays: [1, 2, 3, 4, 5] });
  }

  // ── Activities
  const taskNodes = asArray(proj.Tasks.Task);
  const activities: ScheduleActivity[] = [];

  for (const t of taskNodes as Record<string, unknown>[]) {
    const uid = String(t.UID ?? "");
    if (uid === "0") continue; // task UID 0 is the project summary row in MSP

    const isMilestone = String(t.Milestone) === "1";
    const isSummary   = String(t.Summary)   === "1";
    const type: ActivityType = isMilestone ? "Milestone" : isSummary ? "WBSSummary" : "TaskDependent";

    const pct = parseFloat(String(t.PercentComplete ?? "0"));
    const status: ActivityStatus = pct >= 100 ? "Completed" : pct > 0 ? "InProgress" : "NotStarted";

    const constraint = t.ConstraintType
      ? {
          type: CONSTRAINT_MAP[String(t.ConstraintType)] ?? "NONE",
          date: toIso(String(t.ConstraintDate ?? "")),
        }
      : undefined;

    const preds: Predecessor[] = asArray(t.PredecessorLink as unknown).map((p) => {
      const pp = p as Record<string, unknown>;
      return {
        predId:   String(pp.PredecessorUID ?? ""),
        type:     TYPE_MAP[String(pp.Type)] ?? "FS",
        lagHours: parseDurationToHours(String(pp.LinkLag ?? "")) / 10, // MSP stores lag in 10ths of minutes
      };
    });

    activities.push({
      id: uid,
      code: String(t.ID ?? uid),
      name: String(t.Name ?? `Task ${uid}`),
      type,
      status,
      pctComplete: pct,

      plannedStart:  toIso(String(t.Start ?? "")) ?? "",
      plannedFinish: toIso(String(t.Finish ?? "")) ?? "",
      actualStart:   toIso(String(t.ActualStart ?? "")),
      actualFinish:  toIso(String(t.ActualFinish ?? "")),
      earlyStart:    toIso(String(t.EarlyStart ?? "")),
      earlyFinish:   toIso(String(t.EarlyFinish ?? "")),
      lateStart:     toIso(String(t.LateStart ?? "")),
      lateFinish:    toIso(String(t.LateFinish ?? "")),
      baselineStart:  toIso(String(t.Baseline?.["Start"]  ?? t.BaselineStart  ?? "")),
      baselineFinish: toIso(String(t.Baseline?.["Finish"] ?? t.BaselineFinish ?? "")),

      durationHours:  parseDurationToHours(String(t.Duration ?? "")),
      remainingHours: parseDurationToHours(String(t.RemainingDuration ?? "")),
      totalFloatHours: t.TotalSlack ? parseDurationToHours(String(t.TotalSlack)) : undefined,
      freeFloatHours:  t.FreeSlack  ? parseDurationToHours(String(t.FreeSlack))  : undefined,

      isCritical:  String(t.Critical) === "1",
      isMilestone,
      constraint,
      calendarId: t.CalendarUID ? String(t.CalendarUID) : undefined,

      predecessors: preds,
      budgetCost:    t.Cost      ? parseFloat(String(t.Cost))     : undefined,
      actualCost:    t.ActualCost ? parseFloat(String(t.ActualCost)) : undefined,
      remainingCost: t.RemainingCost ? parseFloat(String(t.RemainingCost)) : undefined,
    });
  }

  if (activities.length === 0) warnings.push("No tasks found in MSP XML.");

  return {
    id: crypto.randomUUID(),
    project: {
      id:   String(proj.UID ?? proj.GUID ?? crypto.randomUUID()),
      code: String(proj.Name ?? fileName),
      name: String(proj.Title ?? proj.Name ?? fileName),
      dataDate:    toIso(String(proj.CurrentDate ?? proj.StatusDate ?? "")) ?? new Date().toISOString(),
      startDate:   toIso(String(proj.StartDate  ?? "")) ?? "",
      finishDate:  toIso(String(proj.FinishDate ?? "")) ?? "",
      baselineStart:  toIso(String(proj.BaselineStart ?? "")),
      baselineFinish: toIso(String(proj.BaselineFinish ?? "")),
      defaultCalendarId: calendars[0]?.id,
      source: "MSP_XML",
      importedAt: new Date().toISOString(),
      fileName,
      currency: String(proj.CurrencySymbol ?? "AED"),
    },
    activities,
    wbs: [],
    calendars,
    warnings,
  };
}
