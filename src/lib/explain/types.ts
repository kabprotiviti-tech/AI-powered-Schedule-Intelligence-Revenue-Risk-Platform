export type MetricId =
  | "dcma_score"
  | "schedule_risk"
  | "cpli"
  | "finish_variance"
  | "neg_float"
  | "spi"
  | "cpi"
  | "on_time_pct";

export type MetricStatus = "good" | "warning" | "critical";

export interface ScoreComponent {
  label: string;
  value: number;
  weight: number;
  contribution_pct: number;
  status: "pass" | "warn" | "fail";
}

export interface FrameworkDriver {
  framework: string;
  check_code?: string;
  check_name?: string;
  contribution_pct: number;
  violation_count: number;
  impact_days: number;
  status: "pass" | "warn" | "fail";
  headline: string;
  detail: string;
}

export interface ActivityContributor {
  rank: number;
  external_id: string;
  name: string;
  wbs_code: string;
  risk_contribution_pct: number;
  issues: string[];
  impact_days: number;
  responsible_party: string | null;
  float_days?: number;
  is_critical: boolean;
  activity_status: "critical" | "warning" | "info";
}

export interface RecommendedAction {
  priority: number;
  action: string;
  rationale: string;
  impact: string;
  framework: string;
  activity_count: number;
  effort: "Low" | "Medium" | "High";
}

export interface ExplainResponse {
  metric_id: MetricId;
  metric_label: string;
  metric_value: string;
  metric_unit: string;
  status: MetricStatus;
  status_label: string;
  benchmark: string;

  calculation: {
    headline: string;
    formula_plain: string;
    formula_technical: string;
    components: ScoreComponent[];
  };

  drivers: FrameworkDriver[];
  activities: ActivityContributor[];
  actions: RecommendedAction[];
}
