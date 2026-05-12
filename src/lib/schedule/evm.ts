// Earned Value Management (ANSI/EIA-748).
//
// Inputs:
//   - Activities with budgetCost / actualCost / remainingCost when present
//   - pctComplete and planned/actual dates
//   - Schedule data date (cut-off)
//
// Computes:
//   BAC  — Budget At Completion (sum of budget costs across all activities)
//   PV   — Planned Value (BCWS): sum of budget × planned-completion-fraction-as-of-data-date
//   EV   — Earned Value (BCWP):  sum of budget × actual pctComplete
//   AC   — Actual Cost  (ACWP):  sum of actualCost across all activities
//   CV   — Cost Variance:     EV − AC      (positive = under-budget)
//   SV   — Schedule Variance: EV − PV      (positive = ahead of plan, cost-basis)
//   CPI  — Cost  Performance Index:  EV / AC
//   SPI  — Schedule Performance Index: EV / PV
//   EAC  — Estimate At Completion:  BAC / CPI (or BAC + (BAC − EV)/CPI — they
//          coincide; we use BAC / CPI form for simplicity)
//   ETC  — Estimate To Complete:    EAC − AC
//   VAC  — Variance At Completion:  BAC − EAC
//
// If too few activities carry cost data the panel reports "insufficient cost
// data" rather than rendering misleading numbers.

import type { Schedule } from "./types";

export interface EVMResult {
  hasCostData: boolean;          // false if <10% of activities have any cost
  activitiesWithCost: number;
  totalActivities: number;
  bac: number;
  pv:  number;
  ev:  number;
  ac:  number;
  cv:  number;
  sv:  number;
  cpi: number;   // Infinity / NaN guarded → returns 1 when ac is 0 and ev is 0
  spi: number;
  eac: number;
  etc: number;
  vac: number;
  // Status flags for UI tinting
  costStatus:     "favorable" | "neutral" | "unfavorable";
  scheduleStatus: "favorable" | "neutral" | "unfavorable";
  currency?: string;
}

// Fraction of duration completed by data date, using planned dates as the
// reference baseline. Returns 0..1.
function plannedFractionByDate(plannedStart: string, plannedFinish: string, dataDate: string): number {
  const ts = new Date(plannedStart).getTime();
  const tf = new Date(plannedFinish).getTime();
  const dd = new Date(dataDate).getTime();
  if (!isFinite(ts) || !isFinite(tf) || tf <= ts) {
    // Zero-duration / milestone: planned complete iff dataDate ≥ plannedFinish
    return dd >= tf ? 1 : 0;
  }
  if (dd <= ts) return 0;
  if (dd >= tf) return 1;
  return (dd - ts) / (tf - ts);
}

export function runEVM(s: Schedule): EVMResult {
  let bac = 0;
  let pv  = 0;
  let ev  = 0;
  let ac  = 0;
  let activitiesWithCost = 0;

  const dataDate = s.project.dataDate || new Date().toISOString();

  for (const a of s.activities) {
    const budget = a.budgetCost;
    if (budget === undefined || budget <= 0) continue;
    activitiesWithCost++;
    bac += budget;

    const plannedFrac = plannedFractionByDate(a.plannedStart, a.plannedFinish, dataDate);
    pv += budget * plannedFrac;

    const earnedFrac = Math.min(1, Math.max(0, a.pctComplete / 100));
    ev += budget * earnedFrac;

    if (a.actualCost !== undefined) ac += a.actualCost;
  }

  const total = s.activities.length;
  const costDataPct = total === 0 ? 0 : activitiesWithCost / total;
  const hasCostData = activitiesWithCost >= 5 && costDataPct >= 0.1;

  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : (ev > 0 ? Infinity : 1);
  const spi = pv > 0 ? ev / pv : (ev > 0 ? Infinity : 1);
  const eac = cpi > 0 && isFinite(cpi) ? bac / cpi : bac;
  const etc = eac - ac;
  const vac = bac - eac;

  return {
    hasCostData,
    activitiesWithCost,
    totalActivities: total,
    bac, pv, ev, ac, cv, sv,
    cpi: isFinite(cpi) ? cpi : 1,
    spi: isFinite(spi) ? spi : 1,
    eac, etc, vac,
    costStatus:     cv < -0.05 * bac ? "unfavorable" : cv >  0.05 * bac ? "favorable" : "neutral",
    scheduleStatus: sv < -0.05 * bac ? "unfavorable" : sv >  0.05 * bac ? "favorable" : "neutral",
    currency: s.project.currency,
  };
}
