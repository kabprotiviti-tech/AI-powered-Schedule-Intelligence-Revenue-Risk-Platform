// ─── Core enums ───────────────────────────────────────────────────────────────

export type ImpactType   = "revenue_delay" | "cost_escalation" | "claim";
export type Confidence   = "High" | "Medium" | "Low";
export type DriverSource = "CPM" | "DCMA" | "EVM" | "Contract";

// ─── Activity-level link ──────────────────────────────────────────────────────

/** One activity's traced contribution to a financial impact */
export interface ActivityImpactLink {
  activity_id:      string;
  external_id:      string;
  name:             string;
  wbs_code:         string;
  responsible_party: string | null;
  is_critical:      boolean;
  float_days:       number | null;   // null = not from CPM

  share_pct:        number;          // % of this record's total amount
  share_amount_aed: number;
  delay_days:       number;          // days this activity contributes to delay

  driver_checks:    string[];        // DCMA check codes (may be empty)
}

// ─── Impact driver ────────────────────────────────────────────────────────────

/** The engine signal that generates a financial impact */
export interface ImpactDriver {
  source:       DriverSource;
  check_code?:  string;              // DCMA check e.g. "LOGIC"
  check_name?:  string;
  description:  string;              // Human-readable explanation
  metric_value: string;              // e.g. "−45 days", "CPI 0.88", "89 violations"
  metric_label: string;              // e.g. "Finish Variance", "Cost Index", "Missing Links"
}

// ─── Financial impact record ──────────────────────────────────────────────────

export interface FinancialImpactRecord {
  id:          string;
  type:        ImpactType;
  category:    string;               // e.g. "Milestone Slip", "Prolongation Cost", "EOT Claim"
  title:       string;               // One-line summary
  amount_aed:  number;
  confidence:  Confidence;
  basis:       string;               // How the amount was derived

  driver:      ImpactDriver;
  activities:  ActivityImpactLink[]; // Linked activities (sorted by share_pct desc)
}

// ─── Activity cross-exposure ──────────────────────────────────────────────────

/** Summary of all financial impacts one activity appears in */
export interface ActivityExposureSummary {
  activity_id:        string;
  external_id:        string;
  name:               string;
  wbs_code:           string;
  responsible_party:  string | null;
  is_critical:        boolean;
  float_days:         number | null;
  total_exposure_aed: number;
  impact_types:       ImpactType[];
  impact_count:       number;
  records:            string[];      // record IDs this activity appears in
}

// ─── API response ─────────────────────────────────────────────────────────────

export interface FinancialTraceResponse {
  project_id:   string;
  project_name: string;
  computed_at:  string;

  summary: {
    total_exposure_aed:   number;
    revenue_delay_aed:    number;
    cost_escalation_aed:  number;
    claims_aed:           number;
    budget_aed:           number;
    revenue_at_risk_aed:  number;
    exposure_pct_of_budget: number;   // total_exposure / budget × 100
  };

  records:           FinancialImpactRecord[];
  activity_exposure: ActivityExposureSummary[];
}
