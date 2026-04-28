/**
 * POST /api/reports/excel
 *
 * Generates and streams a multi-sheet .xlsx workbook.
 *
 * Request body: ExcelReportRequest
 *   { project_id, update_id?, level?, sections?, filters?, branding? }
 *
 * Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *           Content-Disposition: attachment; filename="<project>_NEXUS_Report.xlsx"
 */
export const runtime = "nodejs";    // exceljs requires Node.js runtime (not Edge)
export const maxDuration = 60;       // Vercel max for Pro; covers large schedule datasets

import { NextRequest, NextResponse } from "next/server";
import { getEngineResult, buildMeta } from "@/lib/reports/data-builder";
import { buildExcelReport }           from "@/lib/reports/excel";
import type { ExcelReportRequest }    from "@/lib/reports/types";

export async function POST(req: NextRequest) {
  let body: ExcelReportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const result = await getEngineResult(project_id);
  if (!result) {
    return NextResponse.json({ error: `Project "${project_id}" not found` }, { status: 404 });
  }

  const meta   = buildMeta(project_id, result, body.level ?? "project");
  const buffer = await buildExcelReport(meta, result, body);

  // Safe filename from project name
  const safeName = meta.project_name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 40);
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_NEXUS_${date}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      buffer.byteLength.toString(),
      "Cache-Control":       "no-store",
    },
  });
}
