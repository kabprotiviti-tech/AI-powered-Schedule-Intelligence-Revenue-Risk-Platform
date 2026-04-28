/**
 * POST /api/reports/pdf
 *
 * Generates and streams a consulting-grade A4 PDF report.
 *
 * Request body: PDFReportRequest
 *   { project_id, update_id?, level?, template?, sections?, filters?, branding? }
 *
 * Response: application/pdf
 *           Content-Disposition: attachment; filename="<project>_NEXUS_Report.pdf"
 */
export const runtime    = "nodejs";  // jspdf requires Node.js (not Edge)
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getEngineResult, buildMeta } from "@/lib/reports/data-builder";
import { buildPDFReport }             from "@/lib/reports/pdf";
import type { PDFReportRequest }      from "@/lib/reports/types";

export async function POST(req: NextRequest) {
  let body: PDFReportRequest;
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
  const buffer = await buildPDFReport(meta, result, body);

  const safeName = meta.project_name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 40);
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_NEXUS_${date}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      buffer.byteLength.toString(),
      "Cache-Control":       "no-store",
    },
  });
}
