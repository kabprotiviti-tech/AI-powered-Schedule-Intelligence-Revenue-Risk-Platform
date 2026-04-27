import type { DCMAOutput } from "@/lib/engines/dcma/index";
import type { CPMOutput }  from "@/lib/engines/cpm/index";
import type { EVMOutput }  from "@/lib/engines/evm/index";
import type { MonteCarloOutput } from "@/lib/engines/monte-carlo/index";
import type {
  ExplainResponse, MetricId, MetricStatus,
  ScoreComponent, FrameworkDriver, ActivityContributor, RecommendedAction,
} from "./types";

type EngineSet = {
  dcma?: DCMAOutput;
  cpm?:  CPMOutput;
  evm?:  EVMOutput;
  mc?:   MonteCarloOutput;
};

export function buildExplanation(metricId: MetricId, engines: EngineSet): ExplainResponse | null {
  switch (metricId) {
    case "dcma_score":
    case "schedule_risk":
      return engines.dcma ? explainDCMAScore(engines.dcma, engines.cpm) : null;
    case "cpli":
      return engines.cpm ? explainCPLI(engines.cpm, engines.dcma) : null;
    case "finish_variance":
      return engines.cpm ? explainFinishVariance(engines.cpm) : null;
    case "neg_float":
      return engines.cpm ? explainNegFloat(engines.cpm, engines.dcma) : null;
    case "spi":
      return engines.evm ? explainSPI(engines.evm, engines.cpm) : null;
    case "cpi":
      return engines.evm ? explainCPI(engines.evm) : null;
    case "on_time_pct":
      return engines.mc ? explainOnTimePct(engines.mc, engines.cpm) : null;
    default:
      return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function status(val: number, good: number, warn: number, invert = false): MetricStatus {
  if (!invert) {
    return val >= good ? "good" : val >= warn ? "warning" : "critical";
  }
  return val <= good ? "good" : val <= warn ? "warning" : "critical";
}

function effort(count: number, low: number, med: number): "Low" | "Medium" | "High" {
  return count <= low ? "Low" : count <= med ? "Medium" : "High";
}

// ─── DCMA Score ───────────────────────────────────────────────────────────────

const CHECK_PLAIN: Record<string, string> = {
  LOGIC:       "missing predecessor or successor connections",
  LEADS:       "negative lags (artificial time advances)",
  LAGS:        "positive lags hiding real work",
  REL_TYPES:   "non-standard relationship types (SS, FF, SF)",
  HARD_CONST:  "hard date constraints overriding network logic",
  HIGH_FLOAT:  "unrealistically high float values (>44 days)",
  NEG_FLOAT:   "negative float — activities already past their deadline",
  HIGH_DURATION: "activities with durations over 44 working days",
  INVALID_DATES: "activities where finish date precedes start date",
  RESOURCES:   "activities with no assigned resources",
  MISSED_ACT:  "incomplete activities past the data date",
  CRITICAL_PATH: "open-end activities corrupting critical path",
  CPLI:        "critical path performance below 0.95 threshold",
  BEI:         "baseline execution below 0.95 threshold",
};

function checkAction(
  checkCode: string, count: number, days: number, priority: number,
): RecommendedAction {
  const actions: Record<string, Omit<RecommendedAction, "priority" | "activity_count" | "effort">> = {
    LOGIC: {
      action: `Fix ${count} missing logic link${count !== 1 ? "s" : ""} — add predecessors/successors`,
      rationale: "Logic links are the backbone of CPM analysis. Missing links invalidate float, critical path, and all downstream forecasts.",
      impact: `Removes up to ${days} days of unquantified schedule risk. Highest-weight DCMA check (Critical ×3).`,
      framework: "DCMA – LOGIC",
    },
    NEG_FLOAT: {
      action: `Resolve negative float on ${count} activit${count !== 1 ? "ies" : "y"} — highest urgency`,
      rationale: "Negative float means these activities are already forecasting a missed deadline. They are driving the project late right now.",
      impact: `Direct recovery of up to ${days} days of project delay. Resolving these is the single highest-leverage action.`,
      framework: "DCMA – NEG_FLOAT",
    },
    LEADS: {
      action: `Remove ${count} negative lag (lead) relationship${count !== 1 ? "s" : ""}`,
      rationale: "Leads let successor activities start before their predecessors finish — they artificially compress the schedule and create false float.",
      impact: `Correcting leads restores realistic float values (${days}d currently distorted).`,
      framework: "DCMA – LEADS",
    },
    HARD_CONST: {
      action: `Remove or document justification for ${count} hard date constraint${count !== 1 ? "s" : ""}`,
      rationale: "Hard constraints (Must Start On, Must Finish On) override network logic, blocking float from flowing and masking real schedule risk.",
      impact: `Restores network-driven dates for ${count} activities (${days}d of float blocked).`,
      framework: "DCMA – HARD_CONST",
    },
    RESOURCES: {
      action: `Assign resources to ${count} unresourced activit${count !== 1 ? "ies" : "y"}`,
      rationale: "Activities without resources cannot be cost-tracked, leveled, or included in EVM. They are invisible to project controls.",
      impact: `Enables EVM and cost tracking on ${count} activities representing ${days} days of work.`,
      framework: "DCMA – RESOURCES",
    },
    MISSED_ACT: {
      action: `Update or close ${count} incomplete activit${count !== 1 ? "ies" : "y"} past data date`,
      rationale: "Open activities past the data date distort BEI, earned value, and schedule progress reporting.",
      impact: `Corrects ${days} days of schedule distortion. Directly improves BEI and percent-complete accuracy.`,
      framework: "DCMA – MISSED_ACT",
    },
    LAGS: {
      action: `Convert ${count} lag relationship${count !== 1 ? "s" : ""} to discrete activities`,
      rationale: "Lags hide real work within relationships. Best practice models each waiting period as its own task with resources and duration.",
      impact: `Improves schedule transparency and auditability (${days}d of hidden float exposed).`,
      framework: "DCMA – LAGS",
    },
    HIGH_FLOAT: {
      action: `Investigate ${count} activit${count !== 1 ? "ies" : "y"} with float above 44 working days`,
      rationale: "Extremely high float usually signals missing logic or incorrect constraints — not real flexibility.",
      impact: `Correcting these restores realistic float values across ${count} activities (${days}d inflated).`,
      framework: "DCMA – HIGH_FLOAT",
    },
    HIGH_DURATION: {
      action: `Break down ${count} long-duration activit${count !== 1 ? "ies" : "y"} (>44 working days)`,
      rationale: "Long activities are difficult to track, create large EVM errors, and often hide multiple distinct work packages.",
      impact: `Improves schedule granularity and control across ${days} days of coarse work.`,
      framework: "DCMA – HIGH_DURATION",
    },
    INVALID_DATES: {
      action: `Fix ${count} activit${count !== 1 ? "ies" : "y"} with impossible dates (finish before start)`,
      rationale: "These data errors corrupt every CPM calculation that flows through them — critical path, float, and forecasts are all affected.",
      impact: `Eliminates ${count} corrupt data points that invalidate downstream analysis.`,
      framework: "DCMA – INVALID_DATES",
    },
    CRITICAL_PATH: {
      action: `Connect ${count} open-end activit${count !== 1 ? "ies" : "y"} missing predecessors or successors`,
      rationale: "Open ends create false critical paths. Connecting them restores the true longest path and accurate float values.",
      impact: `Restores accurate critical path and float across ${count} activities.`,
      framework: "DCMA – CRITICAL_PATH",
    },
    REL_TYPES: {
      action: `Review ${count} non-FS relationship${count !== 1 ? "s" : ""} and document or replace with FS`,
      rationale: "SS, FF, SF relationships are harder to validate and often misapplied. Each should have explicit PMO justification.",
      impact: `Improves schedule auditability and reduces mismodeled logic (${days}d impacted).`,
      framework: "DCMA – REL_TYPES",
    },
    CPLI: {
      action: `Recover schedule performance to bring CPLI to ≥ 0.95`,
      rationale: "CPLI below 0.95 confirms the project is falling behind on its most important activities. Recovery is needed immediately to avoid compounding delays.",
      impact: `Raising CPLI to 0.95 requires recovering approximately ${days} days on the critical path.`,
      framework: "DCMA – CPLI",
    },
    BEI: {
      action: `Complete or reschedule ${count} overdue baseline activit${count !== 1 ? "ies" : "y"} to restore BEI`,
      rationale: "BEI below 0.95 is an early warning that the team is completing less work than planned — a pattern that compounds over time.",
      impact: `Restoring BEI to 0.95 improves earned value accuracy and baseline credibility.`,
      framework: "DCMA – BEI",
    },
  };

  const base = actions[checkCode] ?? {
    action: `Address ${count} ${checkCode} violation${count !== 1 ? "s" : ""}`,
    rationale: `${checkCode} violations reduce schedule quality and DCMA score.`,
    impact: `${days} days of schedule risk affected.`,
    framework: `DCMA – ${checkCode}`,
  };

  return {
    ...base,
    priority,
    activity_count: count,
    effort: effort(count, 5, 15),
  };
}

function explainDCMAScore(dcma: DCMAOutput, cpm?: CPMOutput): ExplainResponse {
  const d     = dcma.detail;
  const score = dcma.summary.score;
  const st    = status(score, 75, 50);

  // Components (14 checks weighted)
  const maxPts = 27;
  const components: ScoreComponent[] = d.check_results
    .filter((c) => c.status !== "N/A")
    .map((c) => ({
      label:            c.check_name,
      value:            c.pass_rate_pct,
      weight:           c.severity_weight,
      contribution_pct: (c.severity_weight / maxPts) * 100,
      status: c.status === "Pass" ? "pass" : c.status === "Warning" ? "warn" : "fail",
    }))
    .sort((a, b) => b.weight - a.weight || a.value - b.value);

  // Drivers — checks that are failing, sorted by risk contribution
  const drivers: FrameworkDriver[] = Object.values(d.violations_by_check)
    .filter((v) => v.violation_count > 0)
    .map((v) => ({
      framework:        "DCMA",
      check_code:       v.check_code,
      check_name:       v.check_name,
      contribution_pct: v.subtotal_risk_pct,
      violation_count:  v.violation_count,
      impact_days:      v.subtotal_schedule_impact_days,
      status:           (v.status === "Fail" ? "fail" : "warn") as "fail" | "warn",
      headline:         `${v.violation_count} activit${v.violation_count !== 1 ? "ies" : "y"} with ${CHECK_PLAIN[v.check_code] ?? v.check_name.toLowerCase()}`,
      detail:           `Pass rate: ${v.pass_rate_pct?.toFixed(1) ?? "0"}% · Risk contribution: ${v.subtotal_risk_pct.toFixed(1)}% · Schedule impact: ${v.subtotal_schedule_impact_days}d`,
    }))
    .sort((a, b) => b.contribution_pct - a.contribution_pct);

  // Top activities
  const floatLookup: Record<string, number> = {};
  cpm?.detail.float_records.forEach((r) => { floatLookup[r.activity_id] = r.total_float; });
  const critSet = new Set(cpm?.detail.critical_path ?? []);

  const activities: ActivityContributor[] = d.top_risk_activities.slice(0, 15).map((a, i) => ({
    rank:                i + 1,
    external_id:         a.external_id,
    name:                a.name,
    wbs_code:            a.wbs_code,
    risk_contribution_pct: a.risk_contribution_pct,
    issues:              a.checks_failed,
    impact_days:         a.total_schedule_impact_days,
    responsible_party:   a.responsible_party,
    float_days:          floatLookup[a.activity_id],
    is_critical:         critSet.has(a.activity_id),
    activity_status:     a.risk_contribution_pct > 10 ? "critical" : a.risk_contribution_pct > 4 ? "warning" : "info",
  }));

  // Actions — generate from top failing checks, sorted by severity × count
  const priorityOrder = ["INVALID_DATES", "NEG_FLOAT", "LOGIC", "MISSED_ACT", "HARD_CONST", "LEADS", "CPLI", "BEI", "RESOURCES", "REL_TYPES", "LAGS", "HIGH_FLOAT", "HIGH_DURATION", "CRITICAL_PATH"];
  let actionPriority = 1;
  const actions: RecommendedAction[] = Object.values(d.violations_by_check)
    .filter((v) => v.violation_count > 0)
    .sort((a, b) => {
      const ai = priorityOrder.indexOf(a.check_code);
      const bi = priorityOrder.indexOf(b.check_code);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 6)
    .map((v) => checkAction(v.check_code, v.violation_count, v.subtotal_schedule_impact_days, actionPriority++));

  const failCount = d.check_results.filter((c) => c.status === "Fail" || c.status === "Warning").length;
  const totalChecks = d.check_results.filter((c) => c.status !== "N/A").length;

  return {
    metric_id:    "dcma_score",
    metric_label: "DCMA Schedule Quality Score",
    metric_value: score.toFixed(0),
    metric_unit:  "/ 100",
    status:       st,
    status_label: st === "good" ? "Good" : st === "warning" ? "Needs Attention" : "At Risk",
    benchmark:    "Industry standard: ≥ 85 (Good) · 65–85 (Moderate) · < 65 (Poor)",
    calculation: {
      headline:  `Your schedule earned ${score} out of 100. ${failCount} of ${totalChecks} quality checks have issues, with Critical checks weighted 3× more than lower-severity ones.`,
      formula_plain:
        `We scored ${totalChecks} schedule quality rules, each weighted by severity. Critical rules (like missing logic and negative float) count 3 times more than medium rules. The score reflects how much of that weighted maximum your schedule achieved.`,
      formula_technical:
        `score = (Σ severity_weight_i × pass_rate_i) / 27 × 100\n\nmax_points = 27\n  4 Critical checks  × weight 3 = 12\n  5 High checks      × weight 2 = 10\n  5 Medium checks    × weight 1 =  5\n\nEach failed check reduces the score by: weight × (1 − pass_rate) / 27 × 100`,
      components,
    },
    drivers,
    activities,
    actions,
  };
}

// ─── CPLI ─────────────────────────────────────────────────────────────────────

function explainCPLI(cpm: CPMOutput, dcma?: DCMAOutput): ExplainResponse {
  const d    = cpm.detail;
  const cpli = d.cpli;
  const st   = status(cpli, 0.95, 0.85);

  const components: ScoreComponent[] = [
    {
      label:            "Critical Path On-Time Rate",
      value:            Math.min(100, cpli * 100),
      weight:           3,
      contribution_pct: 60,
      status:           cpli >= 0.95 ? "pass" : cpli >= 0.85 ? "warn" : "fail",
    },
    {
      label:            "Negative Float Activities",
      value:            d.negative_float_count === 0 ? 100 : Math.max(0, 100 - d.negative_float_count * 5),
      weight:           2,
      contribution_pct: 25,
      status:           d.negative_float_count === 0 ? "pass" : d.negative_float_count < 5 ? "warn" : "fail",
    },
    {
      label:            "Near-Critical Activities (0–14d float)",
      value:            Math.max(0, 100 - d.near_critical_count * 2),
      weight:           1,
      contribution_pct: 15,
      status:           d.near_critical_count === 0 ? "pass" : d.near_critical_count < 10 ? "warn" : "fail",
    },
  ];

  const drivers: FrameworkDriver[] = [
    {
      framework:        "CPM",
      check_name:       "Critical Path Performance",
      contribution_pct: 60,
      violation_count:  d.critical_path.length,
      impact_days:      d.finish_variance_days,
      status:           cpli >= 0.95 ? "pass" : cpli >= 0.85 ? "warn" : "fail",
      headline:         `${d.critical_path.length} activities on critical path — CPLI ${cpli.toFixed(3)}`,
      detail:           `Forecast finish variance: ${d.finish_variance_days > 0 ? "+" : ""}${d.finish_variance_days}d · Path duration: ${d.critical_path_duration}d`,
    },
    ...(d.negative_float_count > 0 ? [{
      framework:        "CPM",
      check_name:       "Negative Float",
      contribution_pct: 25,
      violation_count:  d.negative_float_count,
      impact_days:      d.negative_float_count * 5,
      status:           "fail" as const,
      headline:         `${d.negative_float_count} activit${d.negative_float_count !== 1 ? "ies" : "y"} with negative float — already past deadline`,
      detail:           "Negative float means late finish is unavoidable without corrective action",
    }] : []),
    ...(d.near_critical_count > 0 ? [{
      framework:        "CPM",
      check_name:       "Near-Critical Activities",
      contribution_pct: 15,
      violation_count:  d.near_critical_count,
      impact_days:      0,
      status:           d.near_critical_count > 10 ? "fail" as const : "warn" as const,
      headline:         `${d.near_critical_count} activit${d.near_critical_count !== 1 ? "ies" : "y"} with only 1–14 days of float remaining`,
      detail:           "Any delay to these activities risks promoting them to the critical path",
    }] : []),
  ];

  const activities: ActivityContributor[] = d.float_records
    .filter((r) => r.total_float <= 0 || (r.is_critical && r.total_float <= 14))
    .sort((a, b) => a.total_float - b.total_float)
    .slice(0, 15)
    .map((r, i) => ({
      rank:              i + 1,
      external_id:       r.external_id,
      name:              r.name,
      wbs_code:          r.wbs_code,
      risk_contribution_pct: r.total_float < 0 ? Math.abs(r.total_float) / 5 : 5 - r.total_float * 0.3,
      issues:            [r.float_category],
      impact_days:       Math.abs(Math.min(0, r.total_float)),
      responsible_party: null,
      float_days:        r.total_float,
      is_critical:       r.is_critical,
      activity_status:   r.total_float < 0 ? "critical" : r.total_float <= 5 ? "warning" : "info",
    }));

  const actions: RecommendedAction[] = [
    ...(d.negative_float_count > 0 ? [{
      priority: 1,
      action: `Recover schedule on ${d.negative_float_count} negative-float activit${d.negative_float_count !== 1 ? "ies" : "y"} immediately`,
      rationale: "Negative float is direct evidence of a delivery miss. Every day of inaction compounds the delay.",
      impact: `Could recover up to ${d.finish_variance_days} days of project delay if resolved fully.`,
      framework: "CPM",
      activity_count: d.negative_float_count,
      effort: effort(d.negative_float_count, 3, 10),
    }] : []),
    {
      priority: d.negative_float_count > 0 ? 2 : 1,
      action: `Add resources or fast-track top critical path activities to raise CPLI above 0.95`,
      rationale: "CPLI below 0.95 means the project is losing time on its most important tasks. Recovery requires either crashing durations or adding parallel workstreams.",
      impact: `Raising CPLI from ${cpli.toFixed(2)} to 0.95 requires recovering ~${Math.ceil((0.95 - cpli) * d.critical_path_duration)} days on the critical path.`,
      framework: "CPM",
      activity_count: d.critical_path.length,
      effort: "High",
    },
    ...(d.near_critical_count > 5 ? [{
      priority: 3,
      action: `Protect ${d.near_critical_count} near-critical activities from schedule slippage`,
      rationale: "Activities with less than 14 days float are vulnerable. Any delay could shift them onto the critical path and extend the project.",
      impact: `Protecting these activities prevents the critical path from growing longer.`,
      framework: "CPM",
      activity_count: d.near_critical_count,
      effort: effort(d.near_critical_count, 5, 15),
    }] : []),
    ...(dcma && dcma.detail.critical_failures.length > 0 ? [{
      priority: 4,
      action: `Fix ${dcma.detail.critical_failures.length} DCMA critical-severity violation${dcma.detail.critical_failures.length !== 1 ? "s" : ""} degrading schedule reliability`,
      rationale: "DCMA critical failures (missing logic, negative float) corrupt the network driving CPLI. Fixing them improves CPLI accuracy.",
      impact: "Cleaner network logic yields a more reliable CPLI reading and improves float calculations.",
      framework: "DCMA",
      activity_count: dcma.detail.critical_failures.length,
      effort: "Medium",
    }] : []),
  ];

  return {
    metric_id:    "cpli",
    metric_label: "Critical Path Length Index (CPLI)",
    metric_value: cpli.toFixed(3),
    metric_unit:  "index",
    status:       st,
    status_label: st === "good" ? "On Track" : st === "warning" ? "Slipping" : "Behind Schedule",
    benchmark:    "Target: ≥ 0.95 · Warning: 0.85–0.95 · Critical: < 0.85",
    calculation: {
      headline: `CPLI of ${cpli.toFixed(3)} means the critical path is running at ${(cpli * 100).toFixed(0)}% efficiency${cpli < 1 ? `, forecast to finish ${d.finish_variance_days} days late` : "ahead of schedule"}.`,
      formula_plain:
        "CPLI compares how much critical work can still be completed on time versus the total remaining. A score of 1.0 means perfect — the project is exactly on track. Below 0.95 means the critical path is falling behind.",
      formula_technical:
        `CPLI = (Project Finish Float + Critical Path Remaining) / Critical Path Remaining\n\nProject Finish Float = Planned Finish − Forecast Finish\nCritical Path Remaining = remaining duration of longest path\n\nCurrent: ${cpli.toFixed(4)}\nCritical path duration: ${d.critical_path_duration}d\nFinish variance: ${d.finish_variance_days > 0 ? "+" : ""}${d.finish_variance_days}d`,
      components,
    },
    drivers,
    activities,
    actions,
  };
}

// ─── Finish Variance ──────────────────────────────────────────────────────────

function explainFinishVariance(cpm: CPMOutput): ExplainResponse {
  const d    = cpm.detail;
  const days = d.finish_variance_days;
  const st   = status(Math.abs(days), 0, 14, true);

  const activities: ActivityContributor[] = d.float_records
    .filter((r) => r.is_critical || r.total_float < 0)
    .sort((a, b) => a.total_float - b.total_float)
    .slice(0, 15)
    .map((r, i) => ({
      rank:              i + 1,
      external_id:       r.external_id,
      name:              r.name,
      wbs_code:          r.wbs_code,
      risk_contribution_pct: r.total_float < 0 ? Math.min(20, Math.abs(r.total_float)) : 5,
      issues:            r.total_float < 0 ? ["Negative Float"] : ["Critical Path"],
      impact_days:       Math.max(0, -r.total_float),
      responsible_party: null,
      float_days:        r.total_float,
      is_critical:       r.is_critical,
      activity_status:   r.total_float < 0 ? "critical" : "warning",
    }));

  return {
    metric_id:    "finish_variance",
    metric_label: "Schedule Finish Variance",
    metric_value: days > 0 ? `+${days}` : `${days}`,
    metric_unit:  "days",
    status:       st,
    status_label: days <= 0 ? "On Time" : days <= 14 ? "Minor Delay" : "Significantly Late",
    benchmark:    "Target: ≤ 0 days · Acceptable: ≤ 14 days · Critical: > 30 days",
    calculation: {
      headline: days > 0
        ? `The CPM network forecasts project completion ${days} days after the planned finish date. This is driven by ${d.critical_path.length} activities on the critical path and ${d.negative_float_count} activities with negative float.`
        : `The CPM network forecasts project completion ${Math.abs(days)} days ahead of planned finish — the schedule currently has buffer.`,
      formula_plain:
        "CPM calculates the longest path through every activity in the schedule. Finish Variance is the difference between that forecast date and the agreed completion milestone.",
      formula_technical:
        `Finish Variance = CPM Forecast Finish − Planned Finish\n\nForward pass: ES_j = max(EF_i + lag) for all predecessors i\nBackward pass: LF_i = min(LS_j − lag) for all successors j\nTotal Float = LS − ES (activities with TF ≤ 0 form the critical path)\n\nCurrent: ${days > 0 ? "+" : ""}${days}d\nCritical path length: ${d.critical_path_duration}d\nNegative float count: ${d.negative_float_count}`,
      components: [
        {
          label: "Critical Path Activities",
          value: Math.max(0, 100 - Math.max(0, days) * 2),
          weight: 3, contribution_pct: 60,
          status: days <= 0 ? "pass" : days <= 14 ? "warn" : "fail",
        },
        {
          label: "Negative Float Buffer",
          value: d.negative_float_count === 0 ? 100 : 0,
          weight: 2, contribution_pct: 25,
          status: d.negative_float_count === 0 ? "pass" : "fail",
        },
        {
          label: "Near-Critical Float Cushion",
          value: Math.max(0, 100 - d.near_critical_count * 4),
          weight: 1, contribution_pct: 15,
          status: d.near_critical_count < 5 ? "pass" : "warn",
        },
      ],
    },
    drivers: [
      {
        framework: "CPM", check_name: "Critical Path Duration",
        contribution_pct: 70, violation_count: d.critical_path.length,
        impact_days: days, status: days <= 0 ? "pass" : "fail",
        headline: `${d.critical_path.length} activities drive a ${days > 0 ? `+${days}d` : `${days}d`} finish variance`,
        detail: `Critical path duration: ${d.critical_path_duration} working days`,
      },
      ...(d.negative_float_count > 0 ? [{
        framework: "CPM", check_name: "Negative Float Activities",
        contribution_pct: 30, violation_count: d.negative_float_count,
        impact_days: d.negative_float_count * 5,
        status: "fail" as const,
        headline: `${d.negative_float_count} activit${d.negative_float_count !== 1 ? "ies" : "y"} are past their deadline and driving additional delay`,
        detail: "Negative float compounds finish variance — these must be resolved before variance can improve",
      }] : []),
    ],
    activities,
    actions: [
      ...(d.negative_float_count > 0 ? [{
        priority: 1,
        action: `Immediately address ${d.negative_float_count} negative-float activit${d.negative_float_count !== 1 ? "ies" : "y"}`,
        rationale: "Negative float means the schedule is already broken — not just at risk. These activities are the primary contributors to finish variance.",
        impact: `Could recover up to ${Math.min(days, d.negative_float_count * 8)} days of the ${days}d variance.`,
        framework: "CPM", activity_count: d.negative_float_count,
        effort: effort(d.negative_float_count, 3, 10),
      }] : []),
      {
        priority: 2,
        action: "Crash or fast-track critical path activities with most available resources",
        rationale: "Reducing duration of critical path activities directly reduces finish variance — there is no other way to recover schedule.",
        impact: `Each critical activity duration reduced by 1 day = 1 day of variance recovery.`,
        framework: "CPM", activity_count: d.critical_path.length,
        effort: "High",
      },
      ...(d.near_critical_count > 0 ? [{
        priority: 3,
        action: `Protect ${d.near_critical_count} near-critical activities from any further delays`,
        rationale: "Near-critical activities (1–14d float) are one small delay away from becoming critical, which would extend finish variance further.",
        impact: "Prevents variance from worsening beyond the current forecast.",
        framework: "CPM", activity_count: d.near_critical_count,
        effort: effort(d.near_critical_count, 5, 15),
      }] : []),
    ],
  };
}

// ─── Negative Float ───────────────────────────────────────────────────────────

function explainNegFloat(cpm: CPMOutput, dcma?: DCMAOutput): ExplainResponse {
  const d   = cpm.detail;
  const cnt = d.negative_float_count;
  const st  = status(cnt, 0, 3, true) as MetricStatus;

  const activities: ActivityContributor[] = d.float_records
    .filter((r) => r.total_float < 0)
    .sort((a, b) => a.total_float - b.total_float)
    .slice(0, 15)
    .map((r, i) => ({
      rank:              i + 1,
      external_id:       r.external_id,
      name:              r.name,
      wbs_code:          r.wbs_code,
      risk_contribution_pct: Math.min(30, Math.abs(r.total_float)),
      issues:            ["Negative Float"],
      impact_days:       Math.abs(r.total_float),
      responsible_party: null,
      float_days:        r.total_float,
      is_critical:       true,
      activity_status:   "critical" as const,
    }));

  return {
    metric_id:    "neg_float",
    metric_label: "Negative Float Activities",
    metric_value: cnt.toString(),
    metric_unit:  "activities",
    status:       cnt === 0 ? "good" : cnt <= 3 ? "warning" : "critical",
    status_label: cnt === 0 ? "None" : cnt <= 3 ? "Minor" : "Severe",
    benchmark:    "Target: 0 · Acceptable: ≤ 2 · Critical: > 5",
    calculation: {
      headline: cnt === 0
        ? "No activities have negative float — the schedule has sufficient buffer to meet all deadlines."
        : `${cnt} activit${cnt !== 1 ? "ies are" : "y is"} scheduled to miss ${cnt !== 1 ? "their" : "its"} deadline. These cannot meet their planned finish even if they start at the earliest possible time.`,
      formula_plain:
        "Float measures how much an activity can be delayed before it causes a project delay. Negative float means an activity is already running late relative to what the schedule requires — there is no buffer left.",
      formula_technical:
        `Total Float = Late Start (LS) − Early Start (ES)\n         = Late Finish (LF) − Early Finish (EF)\n\nNegative Float occurs when LF < EF, meaning the network cannot satisfy all constraints simultaneously.\n\nCommon causes: over-constrained logic, hard date constraints, upstream delays, missing predecessor completion.`,
      components: activities.slice(0, 5).map((a, i) => ({
        label: a.name.length > 30 ? a.name.slice(0, 30) + "…" : a.name,
        value: Math.abs(a.float_days ?? 0),
        weight: 1,
        contribution_pct: 20,
        status: "fail" as const,
      })),
    },
    drivers: [
      {
        framework: "CPM", check_name: "Negative Float",
        contribution_pct: 100, violation_count: cnt,
        impact_days: cnt * 7,
        status: cnt === 0 ? "pass" : "fail",
        headline: `${cnt} activit${cnt !== 1 ? "ies" : "y"} cannot meet planned deadline under current network logic`,
        detail: `Each day of negative float = 1 day of unavoidable project delay if not resolved`,
      },
      ...(dcma?.detail.violations_by_check["LOGIC"]?.violation_count ? [{
        framework: "DCMA", check_name: "Missing Logic",
        contribution_pct: 30,
        violation_count: dcma.detail.violations_by_check["LOGIC"].violation_count,
        impact_days: dcma.detail.violations_by_check["LOGIC"].subtotal_schedule_impact_days,
        status: "fail" as const,
        headline: "Missing logic links may be causing artificial negative float",
        detail: "Incomplete networks cause float to propagate incorrectly — fix logic first before interpreting float",
      }] : []),
    ],
    activities,
    actions: [
      {
        priority: 1,
        action: `Review and resequence the worst ${Math.min(cnt, 5)} negative-float activit${cnt !== 1 ? "ies" : "y"}`,
        rationale: "Negative float is a symptom, not a root cause. Each must be diagnosed: is it a data error, an upstream delay, or a genuine overcommitment?",
        impact: "Diagnosing root cause enables targeted recovery — data errors can be fixed in hours, genuine delays require resource escalation.",
        framework: "CPM", activity_count: Math.min(cnt, 5),
        effort: "Low",
      },
      {
        priority: 2,
        action: "Remove or justify hard date constraints causing negative float propagation",
        rationale: "Hard constraints are the most common cause of negative float. They freeze a date that the network logic can no longer achieve.",
        impact: "Removing unjustified constraints often resolves negative float without any real schedule change.",
        framework: "CPM", activity_count: cnt,
        effort: "Low",
      },
      {
        priority: 3,
        action: "Add resources or split critical activities to recover float",
        rationale: "If constraints are legitimate, the only solution is to compress durations through resource loading or parallel execution.",
        impact: `Each day recovered from critical activities reduces finish variance by 1 day.`,
        framework: "CPM", activity_count: cnt,
        effort: "High",
      },
    ],
  };
}

// ─── SPI ─────────────────────────────────────────────────────────────────────

function explainSPI(evm: EVMOutput, cpm?: CPMOutput): ExplainResponse {
  const d   = evm.detail;
  const spi = d.spi;
  const st  = status(spi, 0.95, 0.85);

  const laggingActivities = d.activity_evm
    .filter((a) => a.spi !== null && a.spi < 0.9)
    .sort((a, b) => (a.spi ?? 1) - (b.spi ?? 1))
    .slice(0, 15);

  const critSet = new Set(cpm?.detail.critical_path ?? []);

  const activities: ActivityContributor[] = laggingActivities.map((a, i) => ({
    rank:              i + 1,
    external_id:       a.external_id,
    name:              a.name,
    wbs_code:          a.wbs_code,
    risk_contribution_pct: (1 - (a.spi ?? 1)) * 100,
    issues:            [`SPI ${(a.spi ?? 0).toFixed(2)} — behind schedule`],
    impact_days:       Math.abs(a.sv) / (d.bac / d.activity_evm.length + 1) * 5,
    responsible_party: null,
    is_critical:       critSet.has(a.activity_id),
    activity_status:   (a.spi ?? 1) < 0.75 ? "critical" : "warning",
  }));

  return {
    metric_id:    "spi",
    metric_label: "Schedule Performance Index (SPI)",
    metric_value: spi.toFixed(3),
    metric_unit:  "index",
    status:       st,
    status_label: spi >= 1 ? "Ahead of Schedule" : spi >= 0.95 ? "On Track" : spi >= 0.85 ? "Behind Schedule" : "Significantly Behind",
    benchmark:    "Target: ≥ 1.0 (ideal) · Acceptable: ≥ 0.95 · Warning: 0.85–0.95 · Critical: < 0.85",
    calculation: {
      headline: `SPI of ${spi.toFixed(3)} means for every AED 1.00 of work planned, only AED ${spi.toFixed(2)} worth has actually been completed. ${d.below_spi_09} activit${d.below_spi_09 !== 1 ? "ies are" : "y is"} performing below SPI 0.90.`,
      formula_plain:
        "SPI measures schedule efficiency — how much work was accomplished versus how much was planned. A score below 1.0 means the team is completing less work than planned at this point in the project.",
      formula_technical:
        `SPI = EV / PV\n\nEarned Value (EV) = Σ (percent_complete_i × BAC_i)\nPlanned Value (PV) = work scheduled through data date\n\nEV:  ${(d.ev / 1e6).toFixed(2)} M AED\nPV:  ${(d.pv / 1e6).toFixed(2)} M AED\nSV:  ${(d.sv / 1e6).toFixed(2)} M AED (${d.sv >= 0 ? "ahead" : "behind"})\nSPI: ${spi.toFixed(4)}`,
      components: [
        {
          label: "Activities Ahead / On Track",
          value: ((d.activity_evm.filter(a => (a.spi ?? 1) >= 0.95).length / Math.max(1, d.activity_evm.length)) * 100),
          weight: 3, contribution_pct: 60,
          status: spi >= 0.95 ? "pass" : spi >= 0.85 ? "warn" : "fail",
        },
        {
          label: "Schedule Variance (AED)",
          value: Math.max(0, Math.min(100, 50 + (d.sv / d.pv) * 50)),
          weight: 2, contribution_pct: 30,
          status: d.sv >= 0 ? "pass" : Math.abs(d.sv / d.pv) < 0.1 ? "warn" : "fail",
        },
        {
          label: "Activities Below SPI 0.9",
          value: Math.max(0, 100 - (d.below_spi_09 / Math.max(1, d.activity_evm.length)) * 200),
          weight: 1, contribution_pct: 10,
          status: d.below_spi_09 === 0 ? "pass" : d.below_spi_09 < 5 ? "warn" : "fail",
        },
      ],
    },
    drivers: [
      {
        framework: "EVM", check_name: "Schedule Variance",
        contribution_pct: 70, violation_count: d.below_spi_09,
        impact_days: Math.abs(d.schedule_overrun_days),
        status: spi >= 0.95 ? "pass" : spi >= 0.85 ? "warn" : "fail",
        headline: `Schedule variance of ${d.sv >= 0 ? "+" : ""}${(d.sv / 1e6).toFixed(2)} M AED (${d.sv >= 0 ? "ahead" : "behind"} plan)`,
        detail: `EV: ${(d.ev / 1e6).toFixed(2)} M · PV: ${(d.pv / 1e6).toFixed(2)} M · ${d.below_spi_09} activities below SPI 0.9`,
      },
      ...(cpm && cpm.detail.finish_variance_days > 0 ? [{
        framework: "CPM", check_name: "Critical Path Delay",
        contribution_pct: 30, violation_count: cpm.detail.critical_path.length,
        impact_days: cpm.detail.finish_variance_days,
        status: "warn" as const,
        headline: `CPM confirms ${cpm.detail.finish_variance_days}d schedule delay — consistent with SPI reading`,
        detail: "Both CPM and EVM independently confirm schedule slippage — high confidence in the reading",
      }] : []),
    ],
    activities,
    actions: [
      {
        priority: 1,
        action: `Focus recovery efforts on ${d.below_spi_09} activit${d.below_spi_09 !== 1 ? "ies" : "y"} with SPI < 0.90`,
        rationale: "Improving SPI on the worst-performing activities has the highest leverage on the overall index.",
        impact: `Bringing all activities above SPI 0.9 would raise overall SPI by approximately ${((d.below_spi_09 / d.activity_evm.length) * (1 - spi) * 0.5).toFixed(2)}.`,
        framework: "EVM", activity_count: d.below_spi_09,
        effort: effort(d.below_spi_09, 5, 15),
      },
      {
        priority: 2,
        action: "Review resource allocation for activities in worst-performing WBS areas",
        rationale: "Schedule delays are often concentrated in specific WBS areas — targeted resource additions are more efficient than broad acceleration.",
        impact: "Identifying the root WBS area enables surgical recovery without disrupting performing areas.",
        framework: "EVM", activity_count: d.below_spi_09,
        effort: "Medium",
      },
      {
        priority: 3,
        action: "Update percent-complete estimates for all activities at current data date",
        rationale: "Stale percent-complete values cause SPI to understate or overstate performance — accurate data is the foundation of reliable EVM.",
        impact: "Accurate EV calculation ensures corrective actions are targeting the right activities.",
        framework: "EVM", activity_count: d.activity_evm.length,
        effort: "Low",
      },
    ],
  };
}

// ─── CPI ─────────────────────────────────────────────────────────────────────

function explainCPI(evm: EVMOutput): ExplainResponse {
  const d   = evm.detail;
  const cpi = d.cpi;
  const st  = status(cpi, 0.95, 0.85);

  const overrunActivities = d.activity_evm
    .filter((a) => a.cpi !== null && a.cpi < 0.9)
    .sort((a, b) => (a.cpi ?? 1) - (b.cpi ?? 1))
    .slice(0, 15);

  const activities: ActivityContributor[] = overrunActivities.map((a, i) => ({
    rank:              i + 1,
    external_id:       a.external_id,
    name:              a.name,
    wbs_code:          a.wbs_code,
    risk_contribution_pct: (1 - (a.cpi ?? 1)) * 100,
    issues:            [`CPI ${(a.cpi ?? 0).toFixed(2)} — cost overrun`],
    impact_days:       0,
    responsible_party: null,
    is_critical:       false,
    activity_status:   (a.cpi ?? 1) < 0.75 ? "critical" : "warning",
  }));

  return {
    metric_id:    "cpi",
    metric_label: "Cost Performance Index (CPI)",
    metric_value: cpi.toFixed(3),
    metric_unit:  "index",
    status:       st,
    status_label: cpi >= 1 ? "Under Budget" : cpi >= 0.95 ? "On Budget" : cpi >= 0.85 ? "Cost Overrun" : "Significant Overrun",
    benchmark:    "Target: ≥ 1.0 (ideal) · Acceptable: ≥ 0.95 · Warning: 0.85–0.95 · Critical: < 0.85",
    calculation: {
      headline: `CPI of ${cpi.toFixed(3)} means for every AED 1.00 spent, AED ${cpi.toFixed(2)} of value is being delivered. The Estimate at Completion (EAC) is ${(d.eac / 1e6).toFixed(1)} M AED ${d.eac > d.bac ? `(${((d.eac - d.bac) / 1e6).toFixed(1)} M overrun)` : "(within budget)"}.`,
      formula_plain:
        "CPI measures cost efficiency — how much value you are getting for every unit of money spent. Below 1.0 means costs are running higher than the value being delivered.",
      formula_technical:
        `CPI = EV / AC\n\nEarned Value (EV) = work accomplished in budget terms\nActual Cost (AC)  = actual expenditure to date\n\nEV:  ${(d.ev / 1e6).toFixed(2)} M AED\nAC:  ${(d.ac / 1e6).toFixed(2)} M AED\nCV:  ${(d.cv / 1e6).toFixed(2)} M AED (${d.cv >= 0 ? "under" : "over"} budget)\nCPI: ${cpi.toFixed(4)}\n\nEAC (CPI method): BAC / CPI = ${(d.bac / 1e6).toFixed(2)} / ${cpi.toFixed(3)} = ${(d.eac / 1e6).toFixed(2)} M AED\nTCPI: ${d.tcpi.toFixed(3)} (required future efficiency to meet BAC)`,
      components: [
        {
          label: "Cost Variance vs Budget",
          value: Math.max(0, Math.min(100, 50 + (d.cv / d.bac) * 50)),
          weight: 3, contribution_pct: 60,
          status: d.cv >= 0 ? "pass" : Math.abs(d.cv / d.bac) < 0.1 ? "warn" : "fail",
        },
        {
          label: "EAC vs BAC",
          value: Math.max(0, Math.min(100, (d.bac / d.eac) * 100)),
          weight: 2, contribution_pct: 30,
          status: d.eac <= d.bac ? "pass" : d.eac <= d.bac * 1.05 ? "warn" : "fail",
        },
        {
          label: "Activities Below CPI 0.9",
          value: Math.max(0, 100 - (d.below_cpi_09 / Math.max(1, d.activity_evm.length)) * 200),
          weight: 1, contribution_pct: 10,
          status: d.below_cpi_09 === 0 ? "pass" : d.below_cpi_09 < 5 ? "warn" : "fail",
        },
      ],
    },
    drivers: [
      {
        framework: "EVM", check_name: "Cost Variance",
        contribution_pct: 70, violation_count: d.below_cpi_09,
        impact_days: 0,
        status: cpi >= 0.95 ? "pass" : cpi >= 0.85 ? "warn" : "fail",
        headline: `Cost variance of ${d.cv >= 0 ? "+" : ""}${(d.cv / 1e6).toFixed(2)} M AED (${d.cv >= 0 ? "under" : "over"} budget)`,
        detail: `EV: ${(d.ev / 1e6).toFixed(2)} M · AC: ${(d.ac / 1e6).toFixed(2)} M · EAC: ${(d.eac / 1e6).toFixed(2)} M · BAC: ${(d.bac / 1e6).toFixed(2)} M`,
      },
      {
        framework: "EVM", check_name: "To-Complete Performance Index (TCPI)",
        contribution_pct: 30, violation_count: 0,
        impact_days: 0,
        status: d.tcpi <= 1.1 ? "pass" : d.tcpi <= 1.2 ? "warn" : "fail",
        headline: `TCPI of ${d.tcpi.toFixed(3)} — future work must perform at ${(d.tcpi * 100).toFixed(0)}% efficiency to stay within budget`,
        detail: `TCPI > 1.2 means budget recovery is impractical without scope reduction`,
      },
    ],
    activities,
    actions: [
      {
        priority: 1,
        action: `Investigate root cause of overrun on ${d.below_cpi_09} activit${d.below_cpi_09 !== 1 ? "ies" : "y"} with CPI < 0.90`,
        rationale: "CPI is a lagging indicator — by the time it falls below 0.9, overruns are already embedded. Root cause analysis prevents further accumulation.",
        impact: "Identifying and containing root cause prevents EAC from growing further beyond current forecast.",
        framework: "EVM", activity_count: d.below_cpi_09,
        effort: "Medium",
      },
      {
        priority: 2,
        action: d.tcpi > 1.2
          ? "Consider scope reduction or budget revision — TCPI above 1.2 makes recovery unrealistic"
          : `Improve efficiency to reach TCPI target of ${d.tcpi.toFixed(2)} for remaining work`,
        rationale: d.tcpi > 1.2
          ? "When TCPI exceeds 1.2, historical data shows budget recovery is rarely achieved. An honest EAC rebaseline is more credible than a recovery plan."
          : "Raising performance efficiency on remaining work can bring the final cost back within budget if overrun is contained now.",
        impact: `Each 0.01 improvement in CPI reduces EAC by approximately ${(d.bac / cpi / 100 / 1e6).toFixed(1)} M AED.`,
        framework: "EVM", activity_count: d.activity_evm.length,
        effort: d.tcpi > 1.2 ? "High" : "Medium",
      },
      {
        priority: 3,
        action: "Validate actual cost data accuracy across all WBS areas",
        rationale: "CPI is only as reliable as the actual cost data. Delayed cost bookings cause CPI to look artificially good until corrections arrive.",
        impact: "Accurate AC data ensures corrective actions target genuine overruns, not reporting timing issues.",
        framework: "EVM", activity_count: d.activity_evm.length,
        effort: "Low",
      },
    ],
  };
}

// ─── On-Time Probability (Monte Carlo) ───────────────────────────────────────

function explainOnTimePct(mc: MonteCarloOutput, cpm?: CPMOutput): ExplainResponse {
  const d   = mc.detail;
  const pct = d.planned_finish_confidence * 100;
  const st  = status(pct, 70, 50);

  const topTornado = d.tornado.slice(0, 5);

  const drivers: FrameworkDriver[] = topTornado.map((t, i) => ({
    framework:        "Monte Carlo",
    check_name:       t.name,
    contribution_pct: t.risk_contribution_pct,
    violation_count:  1,
    impact_days:      t.range_days,
    status:           i < 2 ? "fail" as const : "warn" as const,
    headline:         `${t.name} — drives ${t.risk_contribution_pct.toFixed(1)}% of finish uncertainty (±${t.range_days}d range)`,
    detail:           `Spearman correlation: ${t.sensitivity.toFixed(3)} · Optimistic: ${t.optimistic_finish}d · Pessimistic: ${t.pessimistic_finish}d`,
  }));

  const critSet = new Set(cpm?.detail.critical_path ?? []);

  const activities: ActivityContributor[] = d.criticality_index
    .filter((c) => c.sci >= 0.5)
    .sort((a, b) => b.sci - a.sci)
    .slice(0, 15)
    .map((c, i) => ({
      rank:              i + 1,
      external_id:       c.external_id,
      name:              c.name,
      wbs_code:          "",
      risk_contribution_pct: c.sci * 100,
      issues:            [c.label],
      impact_days:       0,
      responsible_party: null,
      is_critical:       critSet.has(c.activity_id),
      activity_status:   c.sci >= 0.8 ? "critical" : "warning",
    }));

  const p50  = d.p50_days;
  const p80  = d.p80_days;
  const p90  = d.p90_days;
  const diff = p90 - p50;

  return {
    metric_id:    "on_time_pct",
    metric_label: "On-Time Probability (Monte Carlo)",
    metric_value: pct.toFixed(0),
    metric_unit:  "%",
    status:       st,
    status_label: pct >= 80 ? "High Confidence" : pct >= 60 ? "Moderate Risk" : pct >= 40 ? "At Risk" : "High Risk",
    benchmark:    "Target: ≥ 80% · Acceptable: ≥ 60% · Critical: < 40%",
    calculation: {
      headline: `Based on ${d.iterations.toLocaleString()} simulations sampling schedule uncertainty, there is a ${pct.toFixed(0)}% chance of finishing on time. The median forecast (P50) is ${p50}d, while the 90th percentile (P90) is ${p90}d — a spread of ${diff} days reflecting uncertainty in ${d.criticality_index.length} activities.`,
      formula_plain:
        "Monte Carlo runs thousands of simulations, each time randomly adjusting activity durations within likely ranges (based on PERT distributions). It then counts what fraction of those simulations finished by the planned date — that fraction is the on-time probability.",
      formula_technical:
        `On-Time Probability = count(simulated_duration ≤ planned_duration) / N_iterations\n\nEach simulation:\n  1. Sample duration per activity from PERT distribution\n     mean = (optimistic + 4×likely + pessimistic) / 6\n  2. Run CPM forward pass on sampled schedule\n  3. Record project finish duration and critical activities\n\nSCI (Schedule Criticality Index) = count_on_critical_path / N_iterations\nTornado sensitivity = Spearman rank correlation between activity duration and finish\n\nIterations:  ${d.iterations.toLocaleString()}\nP50:  ${p50}d · P80: ${p80}d · P90: ${p90}d\nStd Dev: ${d.std_dev_days.toFixed(1)}d`,
      components: topTornado.slice(0, 5).map((t) => ({
        label:            t.name.length > 30 ? t.name.slice(0, 30) + "…" : t.name,
        value:            100 - t.risk_contribution_pct,
        weight:           1,
        contribution_pct: t.risk_contribution_pct,
        status:           t.risk_contribution_pct > 20 ? "fail" : t.risk_contribution_pct > 10 ? "warn" : "pass",
      })),
    },
    drivers,
    activities,
    actions: [
      {
        priority: 1,
        action: `Reduce uncertainty range for top ${Math.min(3, topTornado.length)} tornado activit${topTornado.length !== 1 ? "ies" : "y"}`,
        rationale: `The top tornado activities drive most of the finish variance. Reducing their pessimistic estimate — by improving scope definition, adding resources, or de-risking deliverables — compresses the distribution.`,
        impact: `Narrowing the top driver's range by 50% would raise on-time probability by approximately ${Math.round(diff * 0.15)}–${Math.round(diff * 0.25)} percentage points.`,
        framework: "Monte Carlo", activity_count: Math.min(3, topTornado.length),
        effort: "High",
      },
      {
        priority: 2,
        action: `Add ${Math.round(diff / 2)} days of schedule contingency reserve at the P70–P80 confidence level`,
        rationale: "The gap between P50 and P80 represents the minimum contingency needed to have a reasonable chance of on-time delivery. This is the quantified risk reserve.",
        impact: `${Math.round(diff / 2)} days of contingency raises on-time probability to approximately 70–75%.`,
        framework: "Monte Carlo", activity_count: 0,
        effort: "Low",
      },
      {
        priority: 3,
        action: `Monitor ${activities.filter(a => a.risk_contribution_pct >= 70).length || "top"} high-criticality-index activities weekly`,
        rationale: "Activities with SCI ≥ 0.7 appear on the critical path in most simulations — they are the de facto critical path regardless of deterministic float values.",
        impact: "Early warning on these activities provides recovery time before delays propagate to project finish.",
        framework: "Monte Carlo", activity_count: activities.filter(a => a.risk_contribution_pct >= 70).length,
        effort: "Low",
      },
      {
        priority: 4,
        action: "Improve duration estimates with three-point PERT values for long-duration activities",
        rationale: "Activities with a single-point duration estimate contribute artificially low uncertainty. Three-point estimates (optimistic/most likely/pessimistic) produce more reliable confidence levels.",
        impact: "More accurate input distributions improve the reliability of on-time probability as a decision-making tool.",
        framework: "Monte Carlo", activity_count: d.criticality_index.length,
        effort: "Medium",
      },
    ],
  };
}
