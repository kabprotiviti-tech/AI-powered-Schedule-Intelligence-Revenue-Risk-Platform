// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
/**
 * GET /api/explain?project_id=X&metric=Y
 *
 * Returns a structured explanation for any engine metric.
 *
 * metric values:
 *   dcma_score     – DCMA 14-point composite score
 *   schedule_risk  – alias for dcma_score
 *   cpli           – Critical Path Length Index
 *   finish_variance – CPM forecast vs planned finish (days)
 *   neg_float      – Negative float activity count
 *   spi            – EVM Schedule Performance Index
 *   cpi            – EVM Cost Performance Index
 *   on_time_pct    – Monte Carlo on-time probability
 */
import { NextRequest, NextResponse } from "next/server";
import { getEngineResult }           from "@/lib/reports/data-builder";
import { buildExplanation }          from "@/lib/explain/builder";
import type { MetricId }             from "@/lib/explain/types";
import type { DCMAOutput }           from "@/lib/engines/dcma/index";
import type { CPMOutput }            from "@/lib/engines/cpm/index";
import type { EVMOutput }            from "@/lib/engines/evm/index";
import type { MonteCarloOutput }     from "@/lib/engines/monte-carlo/index";

const VALID_METRICS: MetricId[] = [
  "dcma_score", "schedule_risk", "cpli", "finish_variance",
  "neg_float", "spi", "cpi", "on_time_pct",
];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const projectId = sp.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const metric = sp.get("metric") as MetricId | null;
  if (!metric || !VALID_METRICS.includes(metric)) {
    return NextResponse.json(
      { error: `metric must be one of: ${VALID_METRICS.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await getEngineResult(projectId);
  if (!result) {
    return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
  }

  const explanation = buildExplanation(metric, {
    dcma: result.results["DCMA"] as DCMAOutput | undefined,
    cpm:  result.results["CPM"]  as CPMOutput  | undefined,
    evm:  result.results["EVM"]  as EVMOutput  | undefined,
    mc:   result.results["MONTE_CARLO"] as MonteCarloOutput | undefined,
  });

  if (!explanation) {
    return NextResponse.json(
      { error: `Engine data not available for metric "${metric}"` },
      { status: 422 },
    );
  }

  return NextResponse.json(explanation);
}
