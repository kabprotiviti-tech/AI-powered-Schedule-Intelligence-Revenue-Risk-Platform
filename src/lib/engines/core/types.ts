// ─────────────────────────────────────────────────────────────────────────────
// SHARED ENGINE TYPES — every engine reads and writes these shapes
// ─────────────────────────────────────────────────────────────────────────────

export type EngineId = "DCMA" | "CPM" | "EVM" | "MONTE_CARLO";
export type Severity = "Critical" | "High" | "Medium" | "Low";
export type RelType  = "FS" | "SS" | "FF" | "SF";
export type DistType = "PERT" | "Triangular" | "Normal" | "Uniform";

// ─── Input primitive ─────────────────────────────────────────────────────────

export interface ScheduleActivity {
  activity_id:             string;
  external_id:             string;          // P6 Activity ID e.g. "A1050"
  name:                    string;
  wbs_code:                string;
  wbs_node_id:             string;
  activity_type:           "Task" | "Milestone" | "LOE" | "WBS Summary";
  status:                  "Not Started" | "In Progress" | "Complete" | "Delayed";

  // Dates
  planned_start:           string;          // ISO date
  planned_finish:          string;
  forecast_start:          string;
  forecast_finish:         string;
  actual_start:            string | null;
  actual_finish:           string | null;

  // Durations (working days)
  planned_duration:        number;
  remaining_duration:      number;
  percent_complete:        number;          // 0–100

  // Float (null = not yet computed by CPM)
  total_float:             number | null;
  free_float:              number | null;
  is_critical:             boolean | null;

  // Constraint
  constraint_type:         string | null;
  constraint_date:         string | null;

  // EVM (null = not cost-loaded)
  budgeted_at_completion:  number | null;   // BAC in AED
  planned_value:           number | null;   // PV at data_date
  earned_value:            number | null;   // EV
  actual_cost:             number | null;   // AC

  // Monte Carlo inputs (null = use planned_duration ± 20%/30%)
  duration_optimistic:     number | null;   // P10
  duration_most_likely:    number | null;   // P50
  duration_pessimistic:    number | null;   // P90
  duration_distribution:   DistType;

  // Relationships (populated by reader)
  has_predecessor:         boolean;
  has_successor:           boolean;
  resource_assigned:       boolean;

  // Responsible
  responsible_party:       string | null;
}

export interface ActivityRelationship {
  relationship_id:  string;
  predecessor_id:   string;
  successor_id:     string;
  type:             RelType;
  lag_days:         number;     // negative = lead
  is_driving:       boolean;
}

export interface WorkCalendar {
  work_days_per_week: number;   // default 5
  work_hours_per_day: number;   // default 8
}

// ─── Execution context ────────────────────────────────────────────────────────

export interface ExecutionContext {
  execution_id:  string;
  project_id:    string;
  update_id:     string;
  triggered_by:  string;
  dry_run:       boolean;
}

export interface ExecutionOptions {
  mc_iterations?:      number;          // default 1000
  mc_seed?:            number;
  confidence_levels?:  number[];        // default [0.5,0.7,0.8,0.85,0.9,0.95]
  dcma_thresholds?:    Partial<DCMAThresholds>;
  force_recompute?:    boolean;
}

export interface DCMAThresholds {
  logic:            number;   // 5
  leads:            number;   // 5
  lags:             number;   // 5
  rel_types:        number;   // 10
  hard_constraints: number;   // 5
  high_float:       number;   // 5
  high_float_days:  number;   // 44
  neg_float:        number;   // 0
  high_duration:    number;   // 5
  high_duration_days: number; // 44
  invalid_dates:    number;   // 0
  resources:        number;   // 10
  missed_activities:number;   // 5
  cpli_min:         number;   // 0.95
  bei_min:          number;   // 0.95
}

export const DEFAULT_DCMA_THRESHOLDS: DCMAThresholds = {
  logic: 5, leads: 5, lags: 5, rel_types: 10, hard_constraints: 5,
  high_float: 5, high_float_days: 44, neg_float: 0, high_duration: 5,
  high_duration_days: 44, invalid_dates: 0, resources: 10,
  missed_activities: 5, cpli_min: 0.95, bei_min: 0.95,
};

// ─── Output primitives ────────────────────────────────────────────────────────

export interface KeyMetric {
  key:     string;
  label:   string;
  value:   number | string;
  unit:    string;
  status:  "ok" | "warn" | "critical";
  formula: string;
}

export interface ActivityIssue {
  activity_id:          string;
  external_id:          string;
  name:                 string;
  wbs_code:             string;
  engine_id:            EngineId;
  issue_code:           string;         // e.g. "DCMA_LOGIC_MISSING_PRED"
  issue_type:           string;         // human label
  severity:             Severity;
  impact:               number;         // 0.0–1.0 normalised
  schedule_impact_days: number;
  cost_impact_aed:      number;
  description:          string;
  evidence:             Record<string, unknown>;
  recommended_action:   string;
}

export interface RiskContribution {
  activity_id:       string;
  name:              string;
  risk_factor:       string;
  contribution_pct:  number;            // 0–100
  absolute_value:    number;
  unit:              string;
  direction:         "increases_risk" | "decreases_risk";
  engine_id:         EngineId;
}

// ─── Base engine output ───────────────────────────────────────────────────────

export interface EngineOutput {
  engine_id:      EngineId;
  version:        string;
  execution_id:   string;
  project_id:     string;
  update_id:      string;
  computed_at:    string;
  duration_ms:    number;
  status:         "success" | "partial" | "failed";
  error?:         string;

  summary: {
    score:          number;             // 0–100
    pass:           boolean;
    headline:       string;
    key_metrics:    KeyMetric[];
    formula_inputs: Record<string, unknown>;
  };

  activity_issues:     ActivityIssue[];
  risk_contributions:  RiskContribution[];
  detail:              Record<string, unknown>;
}

export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}
