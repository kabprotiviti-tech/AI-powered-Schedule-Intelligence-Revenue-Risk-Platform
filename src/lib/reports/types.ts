/**
 * Report Generation Engine — shared types
 *
 * Three report levels:
 *   portfolio — all projects rolled up (executive overview)
 *   project   — single project: all four engine outputs
 *   issue     — single DCMA check or WBS area drilled into
 */

// ─── Request types ────────────────────────────────────────────────────────────

export type ReportLevel    = "portfolio" | "project" | "issue";
export type ReportFormat   = "excel" | "pdf";
export type PDFTemplate    = "executive" | "technical" | "contractor";
export type ReportSection  =
  | "cover"
  | "executive_summary"
  | "dcma_scorecard"
  | "dcma_violations"
  | "cpm_float"
  | "evm_performance"
  | "monte_carlo"
  | "top_risks"
  | "recommendations"
  | "activity_issues";

export interface ReportFilters {
  severity?:   string[];    // ["Critical","High"]
  check_code?: string;      // "LOGIC"
  wbs_prefix?: string;      // "2"
  responsible?: string;
}

export interface ReportBranding {
  primary_color?: string;   // hex, default "#0057B8"
  company_name?:  string;   // default "NEXUS SRP"
  footer_text?:   string;   // default "Confidential"
  prepared_by?:   string;
  prepared_for?:  string;
}

export interface ExcelReportRequest {
  project_id:  string;
  update_id?:  string;
  level?:      ReportLevel;
  sections?:   ReportSection[];
  filters?:    ReportFilters;
  branding?:   ReportBranding;
}

export interface PDFReportRequest {
  project_id:  string;
  update_id?:  string;
  level?:      ReportLevel;
  template?:   PDFTemplate;
  sections?:   ReportSection[];
  filters?:    ReportFilters;
  branding?:   ReportBranding;
}

// ─── Internal report data model ───────────────────────────────────────────────

export interface ReportMeta {
  title:          string;
  project_id:     string;
  project_name:   string;
  project_type:   string;
  update_id:      string;
  data_date:      string;
  generated_at:   string;   // ISO-8601
  generated_by:   string;   // "NEXUS SRP v0.1"
  version:        string;
  level:          ReportLevel;
  data_source:    string;   // "DCMA Engine + CPM + EVM + Monte Carlo"
}

// ─── Excel cell style constants ───────────────────────────────────────────────

export const XL_COLORS = {
  navy:        "FF1E3A5F",
  blue:        "FF0057B8",
  danger:      "FFDC2626",
  warning:     "FFD97706",
  success:     "FF16A34A",
  muted:       "FF64748B",
  light_bg:    "FFF8FAFC",
  alt_row:     "FFF1F5F9",
  header_text: "FFFFFFFF",
  border:      "FFE2E8F0",
  critical_bg: "FFFEE2E2",
  high_bg:     "FFFFF7ED",
  medium_bg:   "FFFEFCE8",
  low_bg:      "FFF0FDF4",
} as const;

export const SEVERITY_BG: Record<string, string> = {
  Critical: XL_COLORS.critical_bg,
  High:     XL_COLORS.high_bg,
  Medium:   XL_COLORS.medium_bg,
  Low:      XL_COLORS.low_bg,
};

export const SEVERITY_FG: Record<string, string> = {
  Critical: XL_COLORS.danger,
  High:     XL_COLORS.warning,
  Medium:   "FFB45309",
  Low:      XL_COLORS.success,
};

// ─── PDF layout constants ─────────────────────────────────────────────────────

export const PDF_COLORS = {
  navy:    [30,  58,  95]  as [number, number, number],
  blue:    [0,   87,  184] as [number, number, number],
  danger:  [220, 38,  38]  as [number, number, number],
  warning: [217, 119, 6]   as [number, number, number],
  success: [22,  163, 74]  as [number, number, number],
  muted:   [100, 116, 139] as [number, number, number],
  light:   [248, 250, 252] as [number, number, number],
  border:  [226, 232, 240] as [number, number, number],
  text:    [15,  23,  42]  as [number, number, number],
  white:   [255, 255, 255] as [number, number, number],
};

export const SEVERITY_PDF: Record<string, [number, number, number]> = {
  Critical: PDF_COLORS.danger,
  High:     PDF_COLORS.warning,
  Medium:   [180, 83, 9],
  Low:      PDF_COLORS.success,
};
