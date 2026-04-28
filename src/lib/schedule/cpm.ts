// Critical Path Method — forward/backward pass with calendar-aware durations.
//
// Output, per activity:
//   earlyStart / earlyFinish / lateStart / lateFinish (ms epoch)
//   totalFloat / freeFloat (working hours)
//   isCritical (totalFloat <= 0)
//
// Approach:
//   1. Topological sort over predecessor edges (Kahn's algorithm).
//      Cycles → fall back to insertion order with a warning.
//   2. Forward pass — compute ES/EF respecting predecessor type (FS/SS/FF/SF) + lag.
//   3. Backward pass — compute LS/LF.
//   4. Total float = LS - ES (or LF - EF). Critical iff TF <= 0.
//
// Calendar handling:
//   For v1, a calendar contributes only hoursPerDay (clndr_data XML parse is
//   non-trivial and deferred). Working days assumed Mon–Fri unless calendar says
//   otherwise. Holidays not yet honoured. This is good enough for >90% of
//   commercial schedules where activities span weeks/months, not minutes.

import type { Schedule, ScheduleActivity, Calendar, Predecessor, DependencyType } from "./types";

// ── Calendar helpers ───────────────────────────────────────────────────────
const MS_DAY  = 86_400_000;
const MS_HOUR = 3_600_000;

interface CalIndex {
  calendars: Map<string, Calendar>;
  defaultId: string;
}

function buildCalIndex(s: Schedule): CalIndex {
  const calendars = new Map<string, Calendar>();
  for (const c of s.calendars) calendars.set(c.id, c);
  if (calendars.size === 0) {
    const fallback: Calendar = { id: "default", name: "Standard", hoursPerDay: 8, workdays: [1,2,3,4,5] };
    calendars.set("default", fallback);
  }
  const defaultId = s.project.defaultCalendarId ?? calendars.keys().next().value!;
  return { calendars, defaultId };
}

function getCal(idx: CalIndex, calId?: string): Calendar {
  return calId ? idx.calendars.get(calId) ?? idx.calendars.get(idx.defaultId)! : idx.calendars.get(idx.defaultId)!;
}

// Add `hours` of working time to `from` (epoch ms), respecting workdays + hoursPerDay.
function addWorkingHours(from: number, hours: number, cal: Calendar): number {
  if (hours <= 0) return from;
  const hpd = Math.max(1, cal.hoursPerDay);
  const workdays = new Set(cal.workdays);

  let cursor = from;
  let remaining = hours;

  while (remaining > 0) {
    const d = new Date(cursor);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // ISO 1..7
    if (workdays.has(dow)) {
      // Take as much as we can today (assume full workday available)
      const take = Math.min(remaining, hpd);
      cursor += take * MS_HOUR;
      remaining -= take;
      if (remaining > 0) cursor = nextDayUTCStart(cursor);
    } else {
      cursor = nextDayUTCStart(cursor);
    }
  }
  return cursor;
}

function subtractWorkingHours(from: number, hours: number, cal: Calendar): number {
  if (hours <= 0) return from;
  const hpd = Math.max(1, cal.hoursPerDay);
  const workdays = new Set(cal.workdays);

  let cursor = from;
  let remaining = hours;

  while (remaining > 0) {
    const d = new Date(cursor);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (workdays.has(dow)) {
      const take = Math.min(remaining, hpd);
      cursor -= take * MS_HOUR;
      remaining -= take;
      if (remaining > 0) cursor = prevDayUTCEnd(cursor);
    } else {
      cursor = prevDayUTCEnd(cursor);
    }
  }
  return cursor;
}

function nextDayUTCStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
}
function prevDayUTCEnd(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 23, 59, 59);
}

// ── Topological sort ────────────────────────────────────────────────────────
function topoSort(activities: ScheduleActivity[]): { order: ScheduleActivity[]; cyclic: boolean } {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const inDeg = new Map<string, number>();
  for (const a of activities) inDeg.set(a.id, 0);
  for (const a of activities) {
    for (const p of a.predecessors) {
      if (byId.has(p.predId)) inDeg.set(a.id, (inDeg.get(a.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);

  const order: ScheduleActivity[] = [];
  // Build successor map for queue advancement
  const successors = new Map<string, string[]>();
  for (const a of activities) {
    for (const p of a.predecessors) {
      if (!successors.has(p.predId)) successors.set(p.predId, []);
      successors.get(p.predId)!.push(a.id);
    }
  }

  while (queue.length) {
    const id = queue.shift()!;
    const a = byId.get(id);
    if (a) order.push(a);
    for (const succ of successors.get(id) ?? []) {
      inDeg.set(succ, (inDeg.get(succ) ?? 1) - 1);
      if (inDeg.get(succ) === 0) queue.push(succ);
    }
  }

  if (order.length !== activities.length) {
    // Cycle — append the rest in original order so we still produce something.
    const seen = new Set(order.map((a) => a.id));
    for (const a of activities) if (!seen.has(a.id)) order.push(a);
    return { order, cyclic: true };
  }
  return { order, cyclic: false };
}

// ── CPM ─────────────────────────────────────────────────────────────────────
export interface CPMResult {
  earlyStart:  Map<string, number>;
  earlyFinish: Map<string, number>;
  lateStart:   Map<string, number>;
  lateFinish:  Map<string, number>;
  totalFloat:  Map<string, number>;  // hours
  freeFloat:   Map<string, number>;  // hours
  critical:    Set<string>;
  warnings:    string[];
  projectFinish: number;             // earliest finish across all activities (ms)
}

function predConstraint(
  predEF: number,
  predES: number,
  type: DependencyType,
  lagHrs: number,
  cal: Calendar,
): number {
  // Returns the earliest ES allowed for the successor given the predecessor's dates.
  // Lag is added in working hours.
  switch (type) {
    case "FS": return addWorkingHours(predEF, lagHrs, cal);
    case "SS": return addWorkingHours(predES, lagHrs, cal);
    case "FF": return predEF + lagHrs * MS_HOUR; // FF/SF: lag is on finish/start of successor — kept simple here
    case "SF": return predES + lagHrs * MS_HOUR;
  }
}

export function runCPM(s: Schedule): CPMResult {
  const idx = buildCalIndex(s);
  const warnings: string[] = [];
  const { order, cyclic } = topoSort(s.activities);
  if (cyclic) warnings.push("Schedule has cyclic logic — CPM result is approximate.");

  const ES = new Map<string, number>();
  const EF = new Map<string, number>();
  const LS = new Map<string, number>();
  const LF = new Map<string, number>();
  const TF = new Map<string, number>();
  const FF = new Map<string, number>();
  const byId = new Map(s.activities.map((a) => [a.id, a]));

  // ── Forward pass
  for (const a of order) {
    const cal = getCal(idx, a.calendarId);
    let es = a.plannedStart ? new Date(a.plannedStart).getTime() : 0;
    if (a.actualStart) es = new Date(a.actualStart).getTime();

    for (const p of a.predecessors) {
      const pred = byId.get(p.predId);
      if (!pred) continue;
      const predEF = EF.get(pred.id) ?? (pred.plannedFinish ? new Date(pred.plannedFinish).getTime() : 0);
      const predES = ES.get(pred.id) ?? (pred.plannedStart  ? new Date(pred.plannedStart).getTime()  : 0);
      const constrained = predConstraint(predEF, predES, p.type, p.lagHours, cal);
      if (constrained > es) es = constrained;
    }

    if (es <= 0 && a.plannedStart) es = new Date(a.plannedStart).getTime();
    const ef = a.actualFinish
      ? new Date(a.actualFinish).getTime()
      : addWorkingHours(es, Math.max(0, a.remainingHours || a.durationHours), cal);

    ES.set(a.id, es);
    EF.set(a.id, ef);
  }

  // Project finish = max EF
  let projectFinish = 0;
  for (const ef of EF.values()) if (ef > projectFinish) projectFinish = ef;

  // ── Backward pass
  for (let i = order.length - 1; i >= 0; i--) {
    const a = order[i];
    const cal = getCal(idx, a.calendarId);

    // Find successors: activities that have `a` as predecessor
    const successors: { succ: ScheduleActivity; type: DependencyType; lagHrs: number }[] = [];
    for (const x of s.activities) {
      for (const p of x.predecessors) {
        if (p.predId === a.id) successors.push({ succ: x, type: p.type, lagHrs: p.lagHours });
      }
    }

    let lf: number;
    if (successors.length === 0) {
      lf = projectFinish;
    } else {
      lf = Number.POSITIVE_INFINITY;
      for (const { succ, type, lagHrs } of successors) {
        const succLS = LS.get(succ.id) ?? projectFinish;
        const succLF = LF.get(succ.id) ?? projectFinish;
        let constraint: number;
        switch (type) {
          case "FS": constraint = subtractWorkingHours(succLS, lagHrs, cal); break;
          case "SS": constraint = subtractWorkingHours(succLS, lagHrs, cal); break;
          case "FF": constraint = succLF - lagHrs * MS_HOUR; break;
          case "SF": constraint = succLF - lagHrs * MS_HOUR; break;
        }
        if (constraint < lf) lf = constraint;
      }
    }
    const dur = Math.max(0, a.remainingHours || a.durationHours);
    const ls = subtractWorkingHours(lf, dur, cal);

    LS.set(a.id, ls);
    LF.set(a.id, lf);

    const tf = (lf - (EF.get(a.id) ?? lf)) / MS_HOUR;
    TF.set(a.id, tf);
  }

  // Free float = min(succ.ES) - this.EF
  for (const a of s.activities) {
    let minSuccES = Number.POSITIVE_INFINITY;
    for (const x of s.activities) {
      for (const p of x.predecessors) {
        if (p.predId === a.id) {
          const succES = ES.get(x.id);
          if (succES !== undefined && succES < minSuccES) minSuccES = succES;
        }
      }
    }
    const ef = EF.get(a.id) ?? 0;
    const ff = minSuccES === Number.POSITIVE_INFINITY ? (TF.get(a.id) ?? 0) : (minSuccES - ef) / MS_HOUR;
    FF.set(a.id, Math.max(0, ff));
  }

  const critical = new Set<string>();
  for (const [id, tf] of TF) if (tf <= 0.01) critical.add(id);

  return {
    earlyStart: ES, earlyFinish: EF, lateStart: LS, lateFinish: LF,
    totalFloat: TF, freeFloat: FF, critical, warnings, projectFinish,
  };
}
