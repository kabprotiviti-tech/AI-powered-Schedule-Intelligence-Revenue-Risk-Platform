// Critical Path Method — forward/backward pass.
//
// Output, per activity:
//   earlyStart / earlyFinish / lateStart / lateFinish (ms epoch)
//   totalFloat / freeFloat (working hours)
//   isCritical (totalFloat <= 0)
//
// Performance:
//   - Pre-built successors map → both passes O(V + E), not O(V²).
//   - addWorkingHours is O(1) using an avg-working-hours-per-week ratio.
//     Trades exact holiday/weekend handling for being able to scale to
//     50k+ activity P6 schedules without freezing the browser.

import type { Schedule, ScheduleActivity, Calendar, Predecessor, DependencyType } from "./types";

const MS_DAY  = 86_400_000;
const MS_HOUR = 3_600_000;

interface CalIndex {
  calendars: Map<string, Calendar>;
  defaultId: string;
  // Cached working-hour-per-calendar-day ratio per calendar
  ratio:     Map<string, number>;
}

function buildCalIndex(s: Schedule): CalIndex {
  const calendars = new Map<string, Calendar>();
  for (const c of s.calendars) calendars.set(c.id, c);
  if (calendars.size === 0) {
    const fallback: Calendar = { id: "default", name: "Standard", hoursPerDay: 8, workdays: [1, 2, 3, 4, 5] };
    calendars.set("default", fallback);
  }
  const defaultId = s.project.defaultCalendarId ?? calendars.keys().next().value!;
  const ratio = new Map<string, number>();
  for (const [id, c] of calendars) {
    const wpw = Math.max(1, c.workdays.length);
    // hours per CALENDAR day = (workdays per week × hours per workday) / 7
    ratio.set(id, (wpw * Math.max(1, c.hoursPerDay)) / 7);
  }
  return { calendars, defaultId, ratio };
}

function getCal(idx: CalIndex, calId?: string): Calendar {
  return calId ? idx.calendars.get(calId) ?? idx.calendars.get(idx.defaultId)! : idx.calendars.get(idx.defaultId)!;
}

function getRatio(idx: CalIndex, calId?: string): number {
  return idx.ratio.get(calId ?? idx.defaultId) ?? (5 * 8) / 7;
}

// O(1) working-hours arithmetic — uses calendar-day ratio.
function addWorkingHours(from: number, hours: number, _cal: Calendar, ratio: number): number {
  if (hours <= 0) return from;
  const calendarMs = (hours / ratio) * MS_HOUR;
  return from + calendarMs;
}

function subtractWorkingHours(from: number, hours: number, _cal: Calendar, ratio: number): number {
  if (hours <= 0) return from;
  const calendarMs = (hours / ratio) * MS_HOUR;
  return from - calendarMs;
}

// ── Topological sort ────────────────────────────────────────────────────────
function topoSort(
  activities: ScheduleActivity[],
  successors: Map<string, { succId: string; type: DependencyType; lagHours: number }[]>,
): { order: ScheduleActivity[]; cyclic: boolean } {
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
  while (queue.length) {
    const id = queue.shift()!;
    const a = byId.get(id);
    if (a) order.push(a);
    for (const { succId } of successors.get(id) ?? []) {
      inDeg.set(succId, (inDeg.get(succId) ?? 1) - 1);
      if (inDeg.get(succId) === 0) queue.push(succId);
    }
  }

  if (order.length !== activities.length) {
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
  projectFinish: number;
}

function predConstraint(
  predEF: number,
  predES: number,
  type: DependencyType,
  lagHrs: number,
  cal: Calendar,
  ratio: number,
): number {
  switch (type) {
    case "FS": return addWorkingHours(predEF, lagHrs, cal, ratio);
    case "SS": return addWorkingHours(predES, lagHrs, cal, ratio);
    case "FF": return predEF + lagHrs * MS_HOUR;
    case "SF": return predES + lagHrs * MS_HOUR;
  }
}

export function runCPM(s: Schedule): CPMResult {
  const idx = buildCalIndex(s);
  const warnings: string[] = [];

  // Pre-build successor map once — used by topo sort, backward pass, and free float.
  const successors = new Map<string, { succId: string; type: DependencyType; lagHours: number }[]>();
  for (const a of s.activities) {
    for (const p of a.predecessors) {
      if (!successors.has(p.predId)) successors.set(p.predId, []);
      successors.get(p.predId)!.push({ succId: a.id, type: p.type, lagHours: p.lagHours });
    }
  }

  const { order, cyclic } = topoSort(s.activities, successors);
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
    const cal   = getCal(idx, a.calendarId);
    const ratio = getRatio(idx, a.calendarId);
    let es = a.plannedStart ? new Date(a.plannedStart).getTime() : 0;
    if (a.actualStart) es = new Date(a.actualStart).getTime();

    for (const p of a.predecessors) {
      const pred = byId.get(p.predId);
      if (!pred) continue;
      const predEF = EF.get(pred.id) ?? (pred.plannedFinish ? new Date(pred.plannedFinish).getTime() : 0);
      const predES = ES.get(pred.id) ?? (pred.plannedStart  ? new Date(pred.plannedStart).getTime()  : 0);
      const constrained = predConstraint(predEF, predES, p.type, p.lagHours, cal, ratio);
      if (constrained > es) es = constrained;
    }

    if (es <= 0 && a.plannedStart) es = new Date(a.plannedStart).getTime();
    const ef = a.actualFinish
      ? new Date(a.actualFinish).getTime()
      : addWorkingHours(es, Math.max(0, a.remainingHours || a.durationHours), cal, ratio);

    ES.set(a.id, es);
    EF.set(a.id, ef);
  }

  let projectFinish = 0;
  for (const ef of EF.values()) if (ef > projectFinish) projectFinish = ef;

  // ── Backward pass — uses successors map, no V² scan
  for (let i = order.length - 1; i >= 0; i--) {
    const a = order[i];
    const cal   = getCal(idx, a.calendarId);
    const ratio = getRatio(idx, a.calendarId);
    const succList = successors.get(a.id) ?? [];

    let lf: number;
    if (succList.length === 0) {
      lf = projectFinish;
    } else {
      lf = Number.POSITIVE_INFINITY;
      for (const { succId, type, lagHours } of succList) {
        const succLS = LS.get(succId) ?? projectFinish;
        const succLF = LF.get(succId) ?? projectFinish;
        let constraint: number;
        switch (type) {
          case "FS":
          case "SS": constraint = subtractWorkingHours(succLS, lagHours, cal, ratio); break;
          case "FF":
          case "SF": constraint = succLF - lagHours * MS_HOUR; break;
        }
        if (constraint < lf) lf = constraint;
      }
    }
    const dur = Math.max(0, a.remainingHours || a.durationHours);
    const ls = subtractWorkingHours(lf, dur, cal, ratio);

    LS.set(a.id, ls);
    LF.set(a.id, lf);
    TF.set(a.id, (lf - (EF.get(a.id) ?? lf)) / MS_HOUR);
  }

  // ── Free float — also uses successors map, O(V + E)
  for (const a of s.activities) {
    const succList = successors.get(a.id) ?? [];
    let minSuccES = Number.POSITIVE_INFINITY;
    for (const { succId } of succList) {
      const succES = ES.get(succId);
      if (succES !== undefined && succES < minSuccES) minSuccES = succES;
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
