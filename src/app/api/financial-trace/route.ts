/**
 * GET /api/financial-trace?project_id=X
 *
 * Returns a fully traced financial impact report with:
 *   - Revenue delay records (critical path + near-critical)
 *   - Cost escalation records (EAC overrun, prolongation, rework)
 *   - Claims exposure records (EOT, disruption, prolongation)
 *   - Per-activity cross-exposure summary
 */
import { NextRequest, NextResponse } from "next/server";
import { getEngineResult }           from "@/lib/reports/data-builder";
import { buildFinancialTrace }       from "@/lib/financial/builder";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const result = await getEngineResult(projectId);
  if (!result) {
    return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
  }

  const trace = buildFinancialTrace(projectId, result);
  if (!trace) {
    return NextResponse.json(
      { error: "Engine data insufficient — DCMA, CPM, and EVM are all required" },
      { status: 422 },
    );
  }

  return NextResponse.json(trace);
}
