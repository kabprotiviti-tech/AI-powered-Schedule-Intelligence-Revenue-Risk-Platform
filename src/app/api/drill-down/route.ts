/**
 * Drill-Down API
 *
 * GET /api/drill-down?project_id=X
 *   → full violation dataset (all 14 checks, all activities)
 *
 * Supported query params (all optional, combinable):
 *   check_code    — filter to one DCMA check e.g. "LOGIC"
 *   severity      — Critical | High | Medium | Low
 *   wbs_prefix    — top-level WBS segment e.g. "3"
 *   responsible   — contractor / responsible party name
 *   activity_id   — single activity across all checks
 *   search        — fuzzy text match on name, id, type, description
 *   sort_by       — field key (default: risk_contribution_pct)
 *   sort_dir      — asc | desc (default: desc)
 *
 * Response includes:
 *   violations[]          — filtered + sorted DCMAViolationRecord[]
 *   facets                — counts per filter dimension (for UI dropdowns)
 *   summary               — score, totals, CPLI, BEI
 *   check_context         — description + threshold for active check filter
 */
import { NextRequest, NextResponse } from "next/server";
import { PROJECTS } from "@/lib/data/mock";
import { projectToEngineRequest } from "@/lib/engines/adapter";
import { globalRegistry } from "@/lib/engines/orchestrator";
import type { EngineInput } from "@/lib/engines/core/interface";
import type { DCMAOutput, DCMAViolationRecord } from "@/lib/engines/dcma/index";

// ─── In-memory result cache (5-minute TTL) ────────────────────────────────────

const cache = new Map<string, { result: DCMAOutput; ts: number }>();
const TTL_MS = 5 * 60_000;

async function getDCMAResult(projectId: string): Promise<DCMAOutput | null> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.result;

  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;

  const req = projectToEngineRequest(project);
  const input: EngineInput = {
    project_id:        req.project_id,
    update_id:         req.update_id,
    activities:        req.activities,
    relationships:     req.relationships,
    project_start_id:  req.project_start_id,
    project_finish_id: req.project_finish_id,
    data_date:         req.data_date,
    planned_finish:    req.planned_finish,
    project_budget:    req.project_budget,
    planned_duration:  req.planned_duration,
    elapsed_duration:  req.elapsed_duration,
    options:           req.options ?? {},
  };

  const ctx = {
    execution_id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    project_id:   projectId,
    update_id:    req.update_id,
    triggered_by: "drill-down",
    dry_run:      false,
  };

  const engine = globalRegistry.get("DCMA");
  const result = (await engine.execute(input, ctx)) as DCMAOutput;
  cache.set(projectId, { result, ts: Date.now() });
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evStr(ev: Record<string, unknown>, key: string): string | null {
  const v = ev[key];
  return typeof v === "string" ? v : null;
}

function sortViolations(
  list: DCMAViolationRecord[],
  sortBy: string,
  dir: 1 | -1,
): DCMAViolationRecord[] {
  return [...list].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortBy] ?? 0;
    const bv = (b as Record<string, unknown>)[sortBy] ?? 0;
    if (typeof av === "number" && typeof bv === "number") return dir * (bv - av);
    return dir * String(av).localeCompare(String(bv));
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const projectId = sp.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const result = await getDCMAResult(projectId);
  if (!result) {
    return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
  }

  const project = PROJECTS.find((p) => p.id === projectId)!;
  const allViolations = result.detail.violation_dataset;

  // ── Parse filters ──────────────────────────────────────────────────────────
  const pCheckCode   = sp.get("check_code") ?? "";
  const pSeverity    = sp.get("severity")   ?? "";
  const pWBSPrefix   = sp.get("wbs_prefix") ?? "";
  const pResponsible = sp.get("responsible") ?? "";
  const pActivityId  = sp.get("activity_id") ?? "";
  const pSearch      = (sp.get("search") ?? "").toLowerCase().trim();
  const pSortBy      = sp.get("sort_by")  ?? "risk_contribution_pct";
  const pSortDir     = sp.get("sort_dir") === "asc" ? (1 as const) : (-1 as const);

  // ── Apply filters ──────────────────────────────────────────────────────────
  let violations = allViolations;

  if (pCheckCode)   violations = violations.filter((v) => v.check_code === pCheckCode);
  if (pSeverity)    violations = violations.filter((v) => v.severity === pSeverity);
  if (pWBSPrefix)   violations = violations.filter((v) => v.wbs_code.split(".")[0] === pWBSPrefix);
  if (pResponsible) violations = violations.filter(
    (v) => evStr(v.evidence, "responsible_party") === pResponsible,
  );
  if (pActivityId)  violations = violations.filter((v) => v.activity_id === pActivityId);
  if (pSearch) {
    violations = violations.filter(
      (v) =>
        v.name.toLowerCase().includes(pSearch)           ||
        v.external_id.toLowerCase().includes(pSearch)   ||
        v.wbs_code.toLowerCase().includes(pSearch)       ||
        v.issue_type.toLowerCase().includes(pSearch)     ||
        v.check_name.toLowerCase().includes(pSearch)     ||
        v.description.toLowerCase().includes(pSearch)   ||
        (evStr(v.evidence, "responsible_party") ?? "")
          .toLowerCase().includes(pSearch),
    );
  }

  // ── Sort ───────────────────────────────────────────────────────────────────
  violations = sortViolations(violations, pSortBy, pSortDir);

  // ── Facets — counts over the FULL dataset (not filtered) ──────────────────
  // Used by the UI to populate filter dropdowns with accurate counts.

  const facetChecks = result.detail.check_results.map((c) => ({
    check_code:      c.check_code,
    check_name:      c.check_name,
    check_description: c.description,
    violation_count: c.failed_count,
    status:          c.status,
    severity_weight: c.severity_weight,
    pass_rate_pct:   c.pass_rate_pct,
    subtotal_risk_pct:
      result.detail.violations_by_check[c.check_code]?.subtotal_risk_pct ?? 0,
  })).sort((a, b) => b.violation_count - a.violation_count);

  const facetSeverities = (["Critical", "High", "Medium", "Low"] as const).map((s) => ({
    severity: s,
    count: allViolations.filter((v) => v.severity === s).length,
  }));

  const facetWBS = Object.entries(result.detail.violations_by_wbs)
    .map(([k, w]) => ({
      wbs_prefix:            k,
      violation_count:       w.violation_count,
      risk_contribution_pct: w.risk_contribution_pct,
      severity_counts:       w.severity_counts,
    }))
    .sort((a, b) => b.risk_contribution_pct - a.risk_contribution_pct);

  const responsibleParties = [
    ...new Set(
      allViolations
        .map((v) => evStr(v.evidence, "responsible_party"))
        .filter((v): v is string => v !== null),
    ),
  ].sort();

  // ── Check context — shown when filtering to a specific check ──────────────
  const checkContext = pCheckCode
    ? result.detail.violations_by_check[pCheckCode]
      ? {
          check_code:      pCheckCode,
          check_name:      result.detail.violations_by_check[pCheckCode].check_name,
          description:     result.detail.violations_by_check[pCheckCode].check_description,
          status:          result.detail.violations_by_check[pCheckCode].status,
          pass_rate_pct:   result.detail.violations_by_check[pCheckCode].pass_rate_pct,
          subtotal_risk_pct: result.detail.violations_by_check[pCheckCode].subtotal_risk_pct,
          subtotal_schedule_impact_days:
            result.detail.violations_by_check[pCheckCode].subtotal_schedule_impact_days,
        }
      : null
    : null;

  // ── Per-activity cross-check view ─────────────────────────────────────────
  // When an activity_id filter is active, also return all other checks
  // that flagged this activity (for cross-check expansion panel).
  const activityCrossCheck = pActivityId
    ? allViolations
        .filter((v) => v.activity_id === pActivityId)
        .map((v) => ({ check_code: v.check_code, check_name: v.check_name, issue_type: v.issue_type, severity: v.severity }))
    : null;

  return NextResponse.json({
    project_id:   projectId,
    project_name: project.name,

    // Engine metadata
    execution_id: result.execution_id,
    computed_at:  result.computed_at,
    duration_ms:  result.duration_ms,

    // Counts
    total_count:    allViolations.length,
    filtered_count: violations.length,

    // Main payload
    violations,

    // Grouped summaries
    summary: {
      score:                     result.summary.score,
      overall_pass:              result.detail.overall_pass,
      total_schedule_impact_days: result.detail.total_schedule_impact_days,
      violations_with_owner:     result.detail.violations_with_owner,
      critical_failures:         result.detail.critical_failures,
      cpli:                      result.detail.cpli,
      bei:                       result.detail.bei,
      task_count:                result.detail.task_count,
      violations_by_severity: {
        Critical: result.detail.violations_by_severity.Critical.length,
        High:     result.detail.violations_by_severity.High.length,
        Medium:   result.detail.violations_by_severity.Medium.length,
        Low:      result.detail.violations_by_severity.Low.length,
      },
    },

    // Filter metadata
    facets: {
      checks:              facetChecks,
      severities:          facetSeverities,
      wbs_areas:           facetWBS,
      responsible_parties: responsibleParties,
    },

    // Active filter context
    check_context:         checkContext,
    activity_cross_check:  activityCrossCheck,

    // Applied filters (for UI state restoration)
    applied_filters: {
      check_code:   pCheckCode   || null,
      severity:     pSeverity    || null,
      wbs_prefix:   pWBSPrefix   || null,
      responsible:  pResponsible || null,
      activity_id:  pActivityId  || null,
      search:       pSearch      || null,
      sort_by:      pSortBy,
      sort_dir:     pSortDir === 1 ? "asc" : "desc",
    },
  });
}
