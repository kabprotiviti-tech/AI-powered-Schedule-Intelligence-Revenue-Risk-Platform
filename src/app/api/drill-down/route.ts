// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
/**
 * Drill-Down API
 *
 * GET /api/drill-down?project_id=X
 *   → full violation dataset (all 14 checks) + CPM float/critical-path data
 *
 * Optional query params (all combinable):
 *   check_code    — filter to one DCMA check e.g. "LOGIC"
 *   severity      — Critical | High | Medium | Low
 *   wbs_prefix    — top-level WBS segment e.g. "3"
 *   responsible   — responsible party name
 *   activity_id   — single activity across all checks
 *   search        — fuzzy text match on name, id, type, description
 *   sort_by       — field key (default: risk_contribution_pct)
 *   sort_dir      — asc | desc (default: desc)
 *
 * NEW in v2: response now includes
 *   critical_path_ids   — activity IDs on the CPM critical path
 *   negative_float_ids  — activity IDs with total_float < 0
 *   near_critical_ids   — activity IDs with 0 < total_float ≤ 14d
 *   float_map           — { [activity_id]: total_float } for all activities
 */
import { NextRequest, NextResponse } from "next/server";
import { PROJECTS }                  from "@/lib/data/mock";
import { projectToEngineRequest }    from "@/lib/engines/adapter";
import { globalRegistry }            from "@/lib/engines/orchestrator";
import type { EngineInput }          from "@/lib/engines/core/interface";
import type { DCMAOutput, DCMAViolationRecord } from "@/lib/engines/dcma/index";
import type { CPMOutput }            from "@/lib/engines/cpm/index";

// ─── Per-project result cache (5-min TTL) ─────────────────────────────────────

interface CachedResult { dcma: DCMAOutput; cpm: CPMOutput; ts: number; }
const cache = new Map<string, CachedResult>();
const TTL_MS = 5 * 60_000;

async function getResults(projectId: string): Promise<{ dcma: DCMAOutput; cpm: CPMOutput } | null> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.ts < TTL_MS) return { dcma: hit.dcma, cpm: hit.cpm };

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

  const [dcma, cpm] = await Promise.all([
    globalRegistry.get("DCMA").execute(input, ctx) as Promise<DCMAOutput>,
    globalRegistry.get("CPM").execute(input, ctx)  as Promise<CPMOutput>,
  ]);

  cache.set(projectId, { dcma, cpm, ts: Date.now() });
  return { dcma, cpm };
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
    const av = (a as unknown as Record<string, unknown>)[sortBy] ?? 0;
    const bv = (b as unknown as Record<string, unknown>)[sortBy] ?? 0;
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

  const results = await getResults(projectId);
  if (!results) {
    return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
  }

  const { dcma, cpm } = results;
  const project       = PROJECTS.find((p) => p.id === projectId)!;
  const allViolations = dcma.detail.violation_dataset;

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
        v.name.toLowerCase().includes(pSearch)         ||
        v.external_id.toLowerCase().includes(pSearch)  ||
        v.wbs_code.toLowerCase().includes(pSearch)     ||
        v.issue_type.toLowerCase().includes(pSearch)   ||
        v.check_name.toLowerCase().includes(pSearch)   ||
        v.description.toLowerCase().includes(pSearch)  ||
        (evStr(v.evidence, "responsible_party") ?? "").toLowerCase().includes(pSearch),
    );
  }
  violations = sortViolations(violations, pSortBy, pSortDir);

  // ── Facets (counts over FULL dataset) ─────────────────────────────────────
  const facetChecks = dcma.detail.check_results.map((c) => ({
    check_code:        c.check_code,
    check_name:        c.check_name,
    check_description: c.description,
    violation_count:   c.failed_count,
    status:            c.status,
    severity_weight:   c.severity_weight,
    pass_rate_pct:     c.pass_rate_pct,
    subtotal_risk_pct:
      dcma.detail.violations_by_check[c.check_code]?.subtotal_risk_pct ?? 0,
  })).sort((a, b) => b.violation_count - a.violation_count);

  const facetSeverities = (["Critical", "High", "Medium", "Low"] as const).map((s) => ({
    severity: s,
    count: allViolations.filter((v) => v.severity === s).length,
  }));

  const facetWBS = Object.entries(dcma.detail.violations_by_wbs)
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

  // ── Check context ──────────────────────────────────────────────────────────
  const checkContext = pCheckCode
    ? dcma.detail.violations_by_check[pCheckCode]
      ? {
          check_code:   pCheckCode,
          check_name:   dcma.detail.violations_by_check[pCheckCode].check_name,
          description:  dcma.detail.violations_by_check[pCheckCode].check_description,
          status:       dcma.detail.violations_by_check[pCheckCode].status,
          pass_rate_pct: dcma.detail.violations_by_check[pCheckCode].pass_rate_pct,
          subtotal_risk_pct: dcma.detail.violations_by_check[pCheckCode].subtotal_risk_pct,
          subtotal_schedule_impact_days:
            dcma.detail.violations_by_check[pCheckCode].subtotal_schedule_impact_days,
        }
      : null
    : null;

  // ── Cross-check for single-activity filter ─────────────────────────────────
  const activityCrossCheck = pActivityId
    ? allViolations
        .filter((v) => v.activity_id === pActivityId)
        .map((v) => ({ check_code: v.check_code, check_name: v.check_name, issue_type: v.issue_type, severity: v.severity }))
    : null;

  // ── CPM critical path enrichment (NEW) ────────────────────────────────────
  const floatRecords = cpm.detail.float_records;

  const criticalPathIds: string[]   = cpm.detail.critical_path;
  const negativeFloatIds: string[]  = floatRecords.filter((r) => r.total_float  < 0).map((r) => r.activity_id);
  const nearCriticalIds:  string[]  = floatRecords.filter((r) => r.total_float >= 0 && r.total_float <= 14).map((r) => r.activity_id);

  // Compact float lookup: { activity_id → total_float }
  const floatMap: Record<string, number> = {};
  floatRecords.forEach((r) => { floatMap[r.activity_id] = r.total_float; });

  return NextResponse.json({
    project_id:   projectId,
    project_name: project.name,

    // Engine metadata
    execution_id: dcma.execution_id,
    computed_at:  dcma.computed_at,
    duration_ms:  dcma.duration_ms,

    // Counts
    total_count:    allViolations.length,
    filtered_count: violations.length,

    // Main payload
    violations,

    // CPM data (NEW)
    critical_path_ids:  criticalPathIds,
    negative_float_ids: negativeFloatIds,
    near_critical_ids:  nearCriticalIds,
    float_map:          floatMap,
    cpm_summary: {
      critical_path_length:  cpm.detail.critical_path.length,
      negative_float_count:  cpm.detail.negative_float_count,
      near_critical_count:   cpm.detail.near_critical_count,
      finish_variance_days:  cpm.detail.finish_variance_days,
      cpli:                  cpm.detail.cpli,
    },

    // Grouped summaries
    summary: {
      score:                      dcma.summary.score,
      overall_pass:               dcma.detail.overall_pass,
      total_schedule_impact_days: dcma.detail.total_schedule_impact_days,
      violations_with_owner:      dcma.detail.violations_with_owner,
      critical_failures:          dcma.detail.critical_failures,
      cpli:                       dcma.detail.cpli,
      bei:                        dcma.detail.bei,
      task_count:                 dcma.detail.task_count,
      violations_by_severity: {
        Critical: dcma.detail.violations_by_severity.Critical.length,
        High:     dcma.detail.violations_by_severity.High.length,
        Medium:   dcma.detail.violations_by_severity.Medium.length,
        Low:      dcma.detail.violations_by_severity.Low.length,
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
    check_context:        checkContext,
    activity_cross_check: activityCrossCheck,

    // Applied filters (for URL state restoration)
    applied_filters: {
      check_code:  pCheckCode   || null,
      severity:    pSeverity    || null,
      wbs_prefix:  pWBSPrefix   || null,
      responsible: pResponsible || null,
      activity_id: pActivityId  || null,
      search:      pSearch      || null,
      sort_by:     pSortBy,
      sort_dir:    pSortDir === 1 ? "asc" : "desc",
    },
  });
}
