// Achievability engine — answers three questions:
//
//   1. How good is this baseline prepared?  (Baseline Preparedness sub-score)
//   2. What are the chances the project will finish as planned?
//      (Probability of On-Time Delivery)
//   3. Which activities are *not factored in correctly*?
//      (Risk-flagged activities with specific reasons)
//
// Design principles:
//   - Every score derives from explicit, auditable inputs (DCMA, CPM, baseline).
//   - Every problem-activity flag explains *why* it's flagged in plain English.
//   - Scores are 0–100; verdicts map onto industry language (defensible / weak / etc.).
//
// References used for the scoring rules (all public-domain):
//   - DCMA 14-Point Schedule Assessment thresholds
//   - GAO-16-89G Schedule Assessment Guide best practices
//   - PMI Practice Standard for Scheduling, 2nd ed.
//   - AACE RP-23R-02 schedule classification

import type { Schedule, ScheduleActivity } from "./types";
import type { CPMResult } from "./cpm";
import type { DCMAResult } from "./dcma";
import type { BaselineVariance } from "./baseline";

const HRS_PER_DAY = 8;

// ── Types ───────────────────────────────────────────────────────────────────
export type Verdict = "strong" | "adequate" | "weak" | "poor";

export interface SubScore {
  id: string;
  label: string;
  score: number;        // 0..100
  weight: number;       // contribution to overall (sums to 1.0)
  verdict: Verdict;
  rationale: string;    // one-line explanation of how the score was earned
  source: string;       // which standard / metric drove this
}

export type RiskReason =
  | "OPEN_END_START"        // no predecessors and isn't project start
  | "OPEN_END_FINISH"       // no successors and isn't project finish
  | "HARD_CONSTRAINT"       // MSO/MFO overrides logic
  | "NEGATIVE_FLOAT"
  | "EXCESSIVE_DURATION"    // > 44 working days (DCMA)
  | "ZERO_DURATION_NON_MS"  // 0d but not a milestone
  | "NEGATIVE_LAG"          // lead — masks missing detail
  | "LARGE_LAG"             // > 10 working days lag — usually means missing scope
  | "RESOURCE_MISSING"      // no responsible / no resource on a work activity
  | "SUSPICIOUS_DURATION"   // suspiciously round number (e.g. exactly 30d, 60d) — heuristic
  | "OVERDUE_NO_ACTUAL"     // baseline finish past data date but not started
  | "STALE_PROGRESS"        // started long ago but % complete still 0
  | "INVALID_DATES";        // actual after data date, etc.

export interface RiskActivity {
  id: string;
  code: string;
  name: string;
  reasons: { reason: RiskReason; detail: string }[];
  severity: "critical" | "high" | "medium" | "low";
  isOnCriticalPath: boolean;
}

export interface AchievabilityResult {
  // Baseline preparedness
  baselinePreparedness: {
    overall: number;             // 0..100
    verdict: Verdict;
    headline: string;
    subScores: SubScore[];
  };
  // On-time delivery probability
  onTimeDelivery: {
    probability: number;         // 0..100
    confidence: "low" | "medium" | "high";
    band: "very-likely" | "likely" | "uncertain" | "unlikely" | "very-unlikely";
    headline: string;
    drivers: string[];           // bullets explaining the call
  };
  // Activities not factored in correctly
  problemActivities: {
    total: number;
    bySeverity: Record<RiskActivity["severity"], number>;
    byReason:   Record<RiskReason, number>;
    top:        RiskActivity[];  // top 20 by severity then reasons.length
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function verdictFromScore(s: number): Verdict {
  if (s >= 85) return "strong";
  if (s >= 70) return "adequate";
  if (s >= 50) return "weak";
  return "poor";
}

function severityForReasons(reasons: RiskReason[], isCritical: boolean): RiskActivity["severity"] {
  const has = (r: RiskReason) => reasons.includes(r);
  if (has("NEGATIVE_FLOAT") || has("INVALID_DATES")) return "critical";
  if (isCritical && (has("OPEN_END_START") || has("OPEN_END_FINISH") || has("HARD_CONSTRAINT") || has("OVERDUE_NO_ACTUAL"))) return "critical";
  if (reasons.length >= 3) return "high";
  if (has("HARD_CONSTRAINT") || has("EXCESSIVE_DURATION") || has("OVERDUE_NO_ACTUAL")) return "high";
  if (reasons.length >= 2) return "medium";
  return "low";
}

// ── Baseline preparedness sub-scores ────────────────────────────────────────
function logicCompletenessScore(s: Schedule, dcma: DCMAResult): SubScore {
  const c = dcma.checks.find((x) => x.id === "LOGIC")!;
  const score = Math.max(0, 100 - c.failingPct * 5);  // every 1% missing logic = -5 pts
  return {
    id: "logic", label: "Logic completeness",
    score: Math.round(score), weight: 0.20, verdict: verdictFromScore(score),
    rationale: `${c.failingIds.length} of ${s.activities.length} activities lack predecessors or successors (${c.failingPct.toFixed(1)}%).`,
    source: "DCMA 14-Pt §1 (Logic) · GAO-16-89G Best Practice 4",
  };
}

function constraintDisciplineScore(dcma: DCMAResult): SubScore {
  const c = dcma.checks.find((x) => x.id === "CONSTRAINTS")!;
  const score = Math.max(0, 100 - c.failingPct * 6);
  return {
    id: "constraints", label: "Constraint discipline",
    score: Math.round(score), weight: 0.15, verdict: verdictFromScore(score),
    rationale: `${c.failingIds.length} hard constraints (MSO/MFO) bypass logic-driven scheduling.`,
    source: "DCMA 14-Pt §5 · PMI PMBOK 7 §2.6.4",
  };
}

function relationshipQualityScore(dcma: DCMAResult): SubScore {
  const fs = dcma.checks.find((x) => x.id === "REL_TYPES")!;
  const fsPct = parseFloat(fs.metricValue) || 0;
  // 90% threshold per DCMA — score linearly between 70 and 95
  const score = Math.max(0, Math.min(100, ((fsPct - 70) / (95 - 70)) * 100));
  return {
    id: "rel", label: "Relationship quality (FS%)",
    score: Math.round(score), weight: 0.10, verdict: verdictFromScore(score),
    rationale: `${fsPct.toFixed(1)}% Finish-to-Start relationships (DCMA threshold ≥90%).`,
    source: "DCMA 14-Pt §4 (Relationship Types)",
  };
}

function durationRealismScore(s: Schedule, dcma: DCMAResult): SubScore {
  const longD = dcma.checks.find((x) => x.id === "HIGH_DURATION")!;
  // Penalty for too many long activities, but also for too many zero-duration non-milestones
  const zeroNonMS = s.activities.filter((a) => a.durationHours === 0 && !a.isMilestone && a.type !== "WBSSummary" && a.type !== "LOE").length;
  const zeroPct = s.activities.length === 0 ? 0 : (zeroNonMS / s.activities.length) * 100;
  const score = Math.max(0, 100 - longD.failingPct * 4 - zeroPct * 3);
  return {
    id: "duration", label: "Duration realism",
    score: Math.round(score), weight: 0.10, verdict: verdictFromScore(score),
    rationale: `${longD.failingIds.length} activities >44 working days; ${zeroNonMS} zero-duration non-milestones.`,
    source: "DCMA 14-Pt §8 (High Duration) · GAO-16-89G BP 5",
  };
}

function leadLagDisciplineScore(s: Schedule, dcma: DCMAResult): SubScore {
  const leads = dcma.checks.find((x) => x.id === "LEADS")!;
  const lags  = dcma.checks.find((x) => x.id === "LAGS")!;
  let largeLags = 0;
  for (const a of s.activities) for (const p of a.predecessors) if (p.lagHours > 10 * HRS_PER_DAY) largeLags++;
  const totalRel = s.activities.reduce((sum, a) => sum + a.predecessors.length, 0) || 1;
  const largeLagPct = (largeLags / totalRel) * 100;
  // Leads penalty steep, lags moderate, large-lags moderate
  const score = Math.max(0, 100 - leads.failingPct * 8 - lags.failingPct * 1.5 - largeLagPct * 3);
  return {
    id: "leadlag", label: "Lead/lag discipline",
    score: Math.round(score), weight: 0.10, verdict: verdictFromScore(score),
    rationale: `Leads (negative lag): ${leads.failingIds.length}. Lags > 10d: ${largeLags}.`,
    source: "DCMA 14-Pt §2 & §3 (Leads, Lags)",
  };
}

function criticalPathHealthScore(s: Schedule, cpm: CPMResult, dcma: DCMAResult): SubScore {
  const cp = dcma.checks.find((x) => x.id === "CP_TEST")!;
  const cpFraction = s.activities.length === 0 ? 0 : (cpm.critical.size / s.activities.length) * 100;
  // Healthy CP fraction: 5–15%. Below 1% or above 35% indicates problems.
  let cpScore = 100;
  if (cpFraction < 1) cpScore -= 60;             // missing CP
  else if (cpFraction < 3) cpScore -= 20;
  else if (cpFraction > 35) cpScore -= 30;       // CP too dense — fragile
  else if (cpFraction > 25) cpScore -= 10;
  if (cp.status === "fail") cpScore -= 30;
  return {
    id: "cp", label: "Critical-path health",
    score: Math.max(0, Math.round(cpScore)), weight: 0.15, verdict: verdictFromScore(Math.max(0, cpScore)),
    rationale: `Critical path covers ${cpFraction.toFixed(1)}% of activities (healthy band 5-15%).`,
    source: "DCMA 14-Pt §12 (Critical Path Test)",
  };
}

function floatDistributionScore(s: Schedule, cpm: CPMResult, dcma: DCMAResult): SubScore {
  const high = dcma.checks.find((x) => x.id === "HIGH_FLOAT")!;
  const neg  = dcma.checks.find((x) => x.id === "NEG_FLOAT")!;
  // High float is bad (logic gaps), negative float is critical (infeasible)
  const score = Math.max(0, 100 - high.failingPct * 3 - neg.failingPct * 12);
  return {
    id: "float", label: "Float distribution",
    score: Math.round(score), weight: 0.10, verdict: verdictFromScore(score),
    rationale: `${high.failingIds.length} activities with float > 44d; ${neg.failingIds.length} with negative float.`,
    source: "DCMA 14-Pt §6 & §7 (High Float, Negative Float)",
  };
}

function resourceLoadingScore(s: Schedule, dcma: DCMAResult): SubScore {
  const r = dcma.checks.find((x) => x.id === "RESOURCES")!;
  if (r.status === "n/a") {
    return {
      id: "resources", label: "Resource loading",
      score: 50, weight: 0.10, verdict: "weak",
      rationale: "Schedule has no resource/responsibility data — cannot assess loading.",
      source: "DCMA 14-Pt §10 (Resources)",
    };
  }
  const score = Math.max(0, 100 - r.failingPct * 1.5);
  return {
    id: "resources", label: "Resource loading",
    score: Math.round(score), weight: 0.10, verdict: verdictFromScore(score),
    rationale: r.metricValue,
    source: "DCMA 14-Pt §10 (Resources) · AACE RP-23R-02",
  };
}

// ── On-time delivery probability ────────────────────────────────────────────
function computeOnTimeDelivery(
  s: Schedule, cpm: CPMResult, dcma: DCMAResult, baseline: BaselineVariance,
  preparedness: number,
): AchievabilityResult["onTimeDelivery"] {
  // Components, all 0..1:
  //   - preparedness    (already 0..100)
  //   - executionHealth (BEI / CPLI)
  //   - bufferHealth    (proportion of activities with float > 5d)
  //   - logicalFeasibility (1 - negFloatPct)
  const cpli = (() => { const c = dcma.checks.find((x) => x.id === "CPLI"); return c ? parseFloat(c.metricValue) || 1 : 1; })();
  const bei  = (() => { const c = dcma.checks.find((x) => x.id === "BEI");  return c ? parseFloat(c.metricValue) || 1 : 1; })();
  const negFloatPct = (() => { const c = dcma.checks.find((x) => x.id === "NEG_FLOAT"); return c ? c.failingPct : 0; })();

  // Buffer health: % of activities with > 5d (40h) total float, weighted as positive
  let withBuffer = 0;
  for (const tf of cpm.totalFloat.values()) if (tf > 40) withBuffer++;
  const bufferPct = s.activities.length === 0 ? 0 : (withBuffer / s.activities.length) * 100;
  const bufferHealth = Math.max(0, Math.min(1, bufferPct / 60));

  const slipPenalty = baseline.hasBaseline
    ? Math.max(0, Math.min(1, 1 - Math.abs(baseline.projectFinishVarDays) / Math.max(1, s.activities.length / 5)))
    : 0.6; // unknown baseline = neutral-low

  const components = {
    preparedness:        preparedness / 100,
    cpli:                Math.max(0, Math.min(1, (cpli - 0.7) / (1.05 - 0.7))),
    bei:                 Math.max(0, Math.min(1, (bei  - 0.7) / (1.05 - 0.7))),
    bufferHealth,
    logicalFeasibility:  Math.max(0, 1 - negFloatPct / 5),
    slipPenalty,
  };
  // Weighted average → 0..1
  const weights = { preparedness: 0.30, cpli: 0.20, bei: 0.15, bufferHealth: 0.10, logicalFeasibility: 0.15, slipPenalty: 0.10 };
  const raw =
    components.preparedness        * weights.preparedness +
    components.cpli                * weights.cpli +
    components.bei                 * weights.bei +
    components.bufferHealth        * weights.bufferHealth +
    components.logicalFeasibility  * weights.logicalFeasibility +
    components.slipPenalty         * weights.slipPenalty;
  const probability = Math.round(raw * 100);

  let band: AchievabilityResult["onTimeDelivery"]["band"];
  if      (probability >= 80) band = "very-likely";
  else if (probability >= 60) band = "likely";
  else if (probability >= 40) band = "uncertain";
  else if (probability >= 20) band = "unlikely";
  else                         band = "very-unlikely";

  // Confidence depends on whether we have baseline + how many "unknown" inputs
  const hasBI = baseline.hasBaseline;
  const hasResources = dcma.checks.find((x) => x.id === "RESOURCES")?.status !== "n/a";
  const confidence: "low" | "medium" | "high" = hasBI && hasResources ? "high" : hasBI || hasResources ? "medium" : "low";

  // Drivers
  const drivers: string[] = [];
  if (preparedness < 60) drivers.push(`Baseline preparedness is weak (${preparedness}/100) — execution is starting from a fragile plan.`);
  if (cpli < 0.95)       drivers.push(`CPLI ${cpli.toFixed(2)} indicates the critical path is already ${(100 - cpli * 100).toFixed(0)}% behind.`);
  if (bei  < 0.95)       drivers.push(`BEI ${bei.toFixed(2)} — completing fewer activities than baseline scheduled.`);
  if (negFloatPct > 0)   drivers.push(`${negFloatPct.toFixed(1)}% of activities have negative float — schedule is not logically feasible without re-baseline.`);
  if (bufferPct < 20)    drivers.push(`Only ${bufferPct.toFixed(0)}% of activities carry meaningful float buffer.`);
  if (drivers.length === 0) {
    drivers.push("Schedule shows no major execution risk indicators based on DCMA + CPM analysis.");
  }
  if (!hasBI) drivers.push("⚠ No baseline imported — projection assumes current plan is the baseline.");

  let headline: string;
  switch (band) {
    case "very-likely":   headline = `${probability}% — very likely to deliver on plan.`; break;
    case "likely":        headline = `${probability}% — likely to deliver on plan.`; break;
    case "uncertain":     headline = `${probability}% — uncertain. Outcome depends on near-term execution.`; break;
    case "unlikely":      headline = `${probability}% — unlikely to deliver on plan without intervention.`; break;
    case "very-unlikely": headline = `${probability}% — very unlikely. Significant slippage projected.`; break;
  }

  return { probability, confidence, band, headline, drivers };
}

// ── Problem activities ──────────────────────────────────────────────────────
function findProblemActivities(s: Schedule, cpm: CPMResult, dcma: DCMAResult): AchievabilityResult["problemActivities"] {
  const dataDate = s.project.dataDate ? new Date(s.project.dataDate).getTime() : 0;
  const succsCount = new Map<string, number>();
  for (const a of s.activities) for (const p of a.predecessors) succsCount.set(p.predId, (succsCount.get(p.predId) ?? 0) + 1);

  // Build per-activity reason list
  const list: RiskActivity[] = [];
  for (const a of s.activities) {
    if (a.type === "WBSSummary" || a.type === "LOE") continue;
    const reasons: { reason: RiskReason; detail: string }[] = [];
    const tf = cpm.totalFloat.get(a.id) ?? 0;
    const hasPred = a.predecessors.length > 0;
    const hasSucc = (succsCount.get(a.id) ?? 0) > 0;

    if (!hasPred && !hasSucc)              reasons.push({ reason: "OPEN_END_START",   detail: "No predecessors and no successors — orphaned." });
    else if (!hasPred)                     reasons.push({ reason: "OPEN_END_START",   detail: "No predecessor — start logic missing." });
    else if (!hasSucc)                     reasons.push({ reason: "OPEN_END_FINISH",  detail: "No successor — finish drives nothing." });

    if (a.constraint && (a.constraint.type === "MSO" || a.constraint.type === "MFO"))
      reasons.push({ reason: "HARD_CONSTRAINT", detail: `${a.constraint.type} constraint overrides logic.` });

    if (tf < -0.01)                        reasons.push({ reason: "NEGATIVE_FLOAT",   detail: `Total float ${(tf / HRS_PER_DAY).toFixed(1)}d — finish date unachievable.` });

    if (a.durationHours > 44 * HRS_PER_DAY) reasons.push({ reason: "EXCESSIVE_DURATION", detail: `Duration ${(a.durationHours / HRS_PER_DAY).toFixed(0)}d exceeds DCMA 44d threshold.` });

    if (a.durationHours === 0 && !a.isMilestone)
      reasons.push({ reason: "ZERO_DURATION_NON_MS", detail: "Zero-duration activity that is not a milestone." });

    for (const p of a.predecessors) {
      if (p.lagHours < 0) {
        reasons.push({ reason: "NEGATIVE_LAG", detail: `Lead ${(p.lagHours / HRS_PER_DAY).toFixed(1)}d on predecessor — masks missing detail.` });
        break;
      }
      if (p.lagHours > 10 * HRS_PER_DAY) {
        reasons.push({ reason: "LARGE_LAG", detail: `Lag ${(p.lagHours / HRS_PER_DAY).toFixed(0)}d on predecessor — likely missing scope.` });
        break;
      }
    }

    if ((a.type === "TaskDependent" || a.type === "ResourceDependent") && (!a.responsible || a.responsible.trim() === ""))
      reasons.push({ reason: "RESOURCE_MISSING", detail: "No responsible party / resource assigned." });

    if (dataDate > 0 && a.baselineFinish && a.status !== "Completed") {
      const bf = new Date(a.baselineFinish).getTime();
      if (bf < dataDate && !a.actualStart)
        reasons.push({ reason: "OVERDUE_NO_ACTUAL", detail: "Baseline finish past data date but activity not started." });
    }

    if (a.actualStart) {
      const as = new Date(a.actualStart).getTime();
      const daysSinceStart = (dataDate - as) / (HRS_PER_DAY * 60 * 60 * 1000 * 24 / 24);
      if (daysSinceStart > 30 && a.pctComplete < 1) {
        reasons.push({ reason: "STALE_PROGRESS", detail: "Started >30 days ago but 0% complete." });
      }
    }

    if (a.actualStart && new Date(a.actualStart).getTime() > dataDate)
      reasons.push({ reason: "INVALID_DATES", detail: "Actual start is after data date." });
    if (a.actualFinish && new Date(a.actualFinish).getTime() > dataDate)
      reasons.push({ reason: "INVALID_DATES", detail: "Actual finish is after data date." });

    if (reasons.length === 0) continue;
    list.push({
      id: a.id,
      code: a.code,
      name: a.name,
      reasons,
      severity: severityForReasons(reasons.map((r) => r.reason), cpm.critical.has(a.id)),
      isOnCriticalPath: cpm.critical.has(a.id),
    });
  }

  // Aggregate
  const bySeverity: Record<RiskActivity["severity"], number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byReason:   Record<RiskReason, number> = {
    OPEN_END_START: 0, OPEN_END_FINISH: 0, HARD_CONSTRAINT: 0, NEGATIVE_FLOAT: 0,
    EXCESSIVE_DURATION: 0, ZERO_DURATION_NON_MS: 0, NEGATIVE_LAG: 0, LARGE_LAG: 0,
    RESOURCE_MISSING: 0, SUSPICIOUS_DURATION: 0, OVERDUE_NO_ACTUAL: 0, STALE_PROGRESS: 0,
    INVALID_DATES: 0,
  };
  for (const r of list) {
    bySeverity[r.severity]++;
    for (const x of r.reasons) byReason[x.reason]++;
  }

  // Sort top by severity rank, then by reason count, then critical-path first
  const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
  const top = [...list]
    .sort((a, b) => {
      if (SEV_RANK[a.severity] !== SEV_RANK[b.severity]) return SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (a.isOnCriticalPath !== b.isOnCriticalPath) return a.isOnCriticalPath ? -1 : 1;
      return b.reasons.length - a.reasons.length;
    })
    .slice(0, 20);

  return { total: list.length, bySeverity, byReason, top };
}

// ── Public API ──────────────────────────────────────────────────────────────
export function runAchievability(
  s: Schedule, cpm: CPMResult, dcma: DCMAResult, baseline: BaselineVariance,
): AchievabilityResult {
  // Sub-scores
  const subScores: SubScore[] = [
    logicCompletenessScore(s, dcma),
    constraintDisciplineScore(dcma),
    relationshipQualityScore(dcma),
    durationRealismScore(s, dcma),
    leadLagDisciplineScore(s, dcma),
    criticalPathHealthScore(s, cpm, dcma),
    floatDistributionScore(s, cpm, dcma),
    resourceLoadingScore(s, dcma),
  ];
  const overall = Math.round(subScores.reduce((acc, x) => acc + x.score * x.weight, 0));
  const verdict = verdictFromScore(overall);
  const headline = (() => {
    switch (verdict) {
      case "strong":   return `Defensible baseline — ${overall}/100. Schedule reflects mature planning practice.`;
      case "adequate": return `Adequate baseline — ${overall}/100. A few tightening opportunities.`;
      case "weak":     return `Weak baseline — ${overall}/100. Material logic and discipline issues to remediate before execution.`;
      case "poor":     return `Poor baseline — ${overall}/100. Schedule is not credible as planned; rebuild recommended.`;
    }
  })();

  const onTimeDelivery   = computeOnTimeDelivery(s, cpm, dcma, baseline, overall);
  const problemActivities = findProblemActivities(s, cpm, dcma);

  return {
    baselinePreparedness: { overall, verdict, headline, subScores },
    onTimeDelivery,
    problemActivities,
  };
}
