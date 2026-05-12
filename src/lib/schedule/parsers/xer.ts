// Primavera P6 XER parser — tab-delimited table dump format
// Spec reference: Oracle Primavera P6 XER 14.0+ schema (forward-compatible).
//
// File structure:
//   ERMHDR\t<version>\t<date>\t...
//   %T\t<TABLE_NAME>
//   %F\tcol1\tcol2\t...colN
//   %R\tval1\tval2\t...valN
//   %R\t...
//   %T\t<NEXT_TABLE>
//   ...
//   %E   ← end

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

interface XERTable {
  name: string;
  fields: string[];
  rows: Record<string, string>[];
}

function parseTables(text: string): Map<string, XERTable> {
  const tables = new Map<string, XERTable>();
  const lines = text.split(/\r?\n/);
  let current: XERTable | null = null;

  for (const raw of lines) {
    if (!raw) continue;
    const cols = raw.split("\t");
    const tag = cols[0];

    if (tag === "%T") {
      current = { name: cols[1], fields: [], rows: [] };
      tables.set(current.name, current);
    } else if (tag === "%F" && current) {
      current.fields = cols.slice(1);
    } else if (tag === "%R" && current) {
      const row: Record<string, string> = {};
      current.fields.forEach((f, i) => (row[f] = cols[i + 1] ?? ""));
      current.rows.push(row);
    } else if (tag === "%E") {
      break;
    }
  }
  return tables;
}

// ── helpers ────────────────────────────────────────────────────────────────
const isoOrNull = (xerDate: string | undefined): string | undefined => {
  if (!xerDate || xerDate === "") return undefined;
  // P6 dates: "YYYY-MM-DD HH:MM" or "YYYY-MM-DD"
  const m = xerDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, hh = "00", mm = "00"] = m;
  return `${y}-${mo}-${d}T${hh}:${mm}:00.000Z`;
};

const num = (v: string | undefined, fallback = 0): number => {
  if (v === undefined || v === "") return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

const STATUS_MAP: Record<string, ActivityStatus> = {
  TK_NotStart: "NotStarted",
  TK_Active:   "InProgress",
  TK_Complete: "Completed",
};

const TYPE_MAP: Record<string, ActivityType> = {
  TT_Task:   "TaskDependent",
  TT_Rsrc:   "ResourceDependent",
  TT_Mile:   "Milestone",   // Start Milestone
  TT_FinMile:"Milestone",   // Finish Milestone
  TT_LOE:    "LOE",
  TT_WBS:    "WBSSummary",
};

const DEP_MAP: Record<string, DependencyType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

const CONSTRAINT_MAP: Record<string, ConstraintType> = {
  CS_MSO:    "MSO",
  CS_MFO:    "MFO",
  CS_MEO:    "MFO",
  CS_MEOA:   "MFO",
  CS_MEOB:   "MFO",
  CS_MANDFIN:"MFO",
  CS_MANDSTART:"MSO",
  CS_ALAP:   "ALAP",
  CS_ASAP:   "ASAP",
  CS_SNET:   "SNET",
  CS_SNLT:   "SNLT",
  CS_FNET:   "FNET",
  CS_FNLT:   "FNLT",
};

// ── main ────────────────────────────────────────────────────────────────────
export function parseXER(text: string, fileName: string): Schedule {
  const warnings: string[] = [];
  const tables = parseTables(text);

  const projectRows  = tables.get("PROJECT")?.rows ?? [];
  const wbsRows      = tables.get("PROJWBS")?.rows ?? [];
  const taskRows     = tables.get("TASK")?.rows    ?? [];
  const predRows     = tables.get("TASKPRED")?.rows ?? [];
  const calendarRows = tables.get("CALENDAR")?.rows ?? [];

  if (projectRows.length === 0) {
    throw new Error("No PROJECT table in XER file — invalid or empty schedule export.");
  }

  // Take first project (XER can carry many; user uploads one at a time)
  const proj = projectRows[0];
  const projId = proj.proj_id;

  // ── Calendars
  const calendars: Calendar[] = calendarRows
    .filter((c) => !projId || c.proj_id === projId || c.proj_id === "" || c.clndr_type === "CA_Base")
    .map((c) => ({
      id:   c.clndr_id,
      name: c.clndr_name || `Calendar ${c.clndr_id}`,
      hoursPerDay: num(c.day_hr_cnt, 8),
      workdays: [1, 2, 3, 4, 5], // P6 calendar XML data is in clndr_data field; deferred for v2
    }));
  if (calendars.length === 0) {
    calendars.push({ id: "default", name: "Standard 5-day", hoursPerDay: 8, workdays: [1, 2, 3, 4, 5] });
    warnings.push("No calendars in XER, using default 5-day 8h.");
  }

  // ── WBS (only nodes belonging to this project)
  const wbs: WBSNode[] = wbsRows
    .filter((w) => w.proj_id === projId)
    .map((w) => ({
      id:       w.wbs_id,
      parentId: w.parent_wbs_id || undefined,
      code:     w.wbs_short_name || "",
      name:     w.wbs_name || "",
    }));

  // ── Activities
  const activities: ScheduleActivity[] = taskRows
    .filter((t) => t.proj_id === projId)
    .map((t) => {
      const status = STATUS_MAP[t.status_code] ?? "NotStarted";
      const type   = TYPE_MAP[t.task_type] ?? "TaskDependent";
      const pct    = num(t.phys_complete_pct);

      const plannedStart  = isoOrNull(t.target_start_date) ?? isoOrNull(t.early_start_date) ?? proj.plan_start_date ?? "";
      const plannedFinish = isoOrNull(t.target_end_date)   ?? isoOrNull(t.early_end_date)   ?? proj.plan_end_date   ?? "";

      const constraint =
        t.cstr_type && CONSTRAINT_MAP[t.cstr_type]
          ? { type: CONSTRAINT_MAP[t.cstr_type], date: isoOrNull(t.cstr_date) }
          : undefined;

      return {
        id:    t.task_id,
        wbsId: t.wbs_id || undefined,
        code:  t.task_code || t.task_id,
        name:  t.task_name || `Task ${t.task_id}`,
        type,
        status,
        pctComplete: pct,

        plannedStart,
        plannedFinish,
        actualStart:    isoOrNull(t.act_start_date),
        actualFinish:   isoOrNull(t.act_end_date),
        earlyStart:     isoOrNull(t.early_start_date),
        earlyFinish:    isoOrNull(t.early_end_date),
        lateStart:      isoOrNull(t.late_start_date),
        lateFinish:     isoOrNull(t.late_end_date),
        baselineStart:  isoOrNull(t.target_start_date),
        baselineFinish: isoOrNull(t.target_end_date),

        durationHours:  num(t.target_drtn_hr_cnt, num(t.remain_drtn_hr_cnt)),
        remainingHours: num(t.remain_drtn_hr_cnt),
        totalFloatHours: t.total_float_hr_cnt ? num(t.total_float_hr_cnt) : undefined,
        freeFloatHours:  t.free_float_hr_cnt  ? num(t.free_float_hr_cnt)  : undefined,

        isCritical:  t.driving_path_flag === "Y" || num(t.total_float_hr_cnt) <= 0,
        isMilestone: type === "Milestone",
        constraint,
        calendarId: t.clndr_id || undefined,

        // Cost data for EVM. P6 splits actual into regular + overtime; sum them.
        // Many schedules leave cost fields empty if the planner only tracks
        // time, in which case EVM panel falls back to "no cost data".
        budgetCost:    t.target_cost  !== undefined ? num(t.target_cost)  : undefined,
        actualCost:    (t.act_reg_cost || t.act_ot_cost) !== undefined ? num(t.act_reg_cost) + num(t.act_ot_cost) : undefined,
        remainingCost: t.remain_cost  !== undefined ? num(t.remain_cost)  : undefined,

        predecessors: [],   // filled below
      } satisfies ScheduleActivity;
    });

  // Index activities for predecessor lookup
  const byId = new Map(activities.map((a) => [a.id, a]));

  for (const r of predRows) {
    if (r.proj_id !== projId) continue;
    const succ = byId.get(r.task_id);
    if (!succ) continue;
    const dep: Predecessor = {
      predId:   r.pred_task_id,
      type:     DEP_MAP[r.pred_type] ?? "FS",
      lagHours: num(r.lag_hr_cnt),
    };
    succ.predecessors.push(dep);
  }

  // Roll up project dates from activities if missing
  const allStarts = activities.map((a) => a.plannedStart).filter(Boolean).sort();
  const allFinish = activities.map((a) => a.plannedFinish).filter(Boolean).sort();
  const startDate  = isoOrNull(proj.plan_start_date) ?? allStarts[0] ?? "";
  const finishDate = isoOrNull(proj.plan_end_date)   ?? allFinish[allFinish.length - 1] ?? "";

  return {
    id: crypto.randomUUID(),
    project: {
      id:   projId,
      code: proj.proj_short_name || projId,
      name: proj.proj_short_name || proj.proj_id,
      dataDate:  isoOrNull(proj.last_recalc_date) ?? new Date().toISOString(),
      startDate,
      finishDate,
      baselineStart:  isoOrNull(proj.plan_start_date),
      baselineFinish: isoOrNull(proj.plan_end_date),
      defaultCalendarId: proj.clndr_id || calendars[0]?.id,
      source: "P6_XER",
      importedAt: new Date().toISOString(),
      fileName,
    },
    activities,
    wbs,
    calendars,
    warnings,
  };
}
