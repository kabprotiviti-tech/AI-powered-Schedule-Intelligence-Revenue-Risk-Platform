// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
/**
 * PDF Report Builder — consulting-grade A4 document
 *
 * Pages:
 *  1. Cover         — title, project, scores at a glance, branding footer
 *  2. Executive     — KPI scorecard grid, health narrative, alert summary
 *  3. DCMA          — 14-check table with status indicators
 *  4. Top Risks     — ranked activity risk register table
 *  5. EVM           — performance indices + bar chart drawn natively
 *  6. Monte Carlo   — confidence table + sensitivity tornado (drawn natively)
 *  7. Recommendations — numbered action list with owner + impact
 *  Last. Appendix   — data source, methodology, version, timestamp
 *
 * No browser APIs used — safe for Next.js Node.js API routes.
 * All charts are drawn via jsPDF rect/line primitives (no canvas/SVG).
 */

import { jsPDF } from "jspdf";
import autoTable  from "jspdf-autotable";
import type { UserOptions as AutoTableOptions } from "jspdf-autotable";
import type { DCMAOutput }        from "@/lib/engines/dcma/index";
import type { CPMOutput }         from "@/lib/engines/cpm/index";
import type { EVMOutput }         from "@/lib/engines/evm/index";
import type { MonteCarloOutput }  from "@/lib/engines/monte-carlo/index";
import type { OrchestratorResult } from "@/lib/engines/orchestrator";
import type { ReportMeta, PDFReportRequest } from "./types";
import { PDF_COLORS, SEVERITY_PDF } from "./types";

// ─── jsPDF augmentation for autotable ────────────────────────────────────────
// jspdf-autotable appends lastAutoTable to the doc instance at runtime.
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

// ─── Layout constants (mm, A4) ────────────────────────────────────────────────

const PAGE_W  = 210;
const PAGE_H  = 297;
const MARGIN  = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H  = 14;
const HEADER_H  = 12;   // interior pages

type RGB = [number, number, number];

// ─── Low-level helpers ────────────────────────────────────────────────────────

function setColor(doc: jsPDF, rgb: RGB, type: "fill" | "draw" | "text" = "fill") {
  if (type === "fill")  doc.setFillColor(...rgb);
  if (type === "draw")  doc.setDrawColor(...rgb);
  if (type === "text")  doc.setTextColor(...rgb);
}

function rect(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB, stroke?: RGB) {
  setColor(doc, fill, "fill");
  if (stroke) {
    setColor(doc, stroke, "draw");
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h, "FD");
  } else {
    doc.rect(x, y, w, h, "F");
  }
}

function text(doc: jsPDF, str: string, x: number, y: number, color: RGB, size: number, bold = false, align: "left" | "center" | "right" = "left") {
  setColor(doc, color, "text");
  doc.setFontSize(size);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.text(str, x, y, { align });
}

function hrule(doc: jsPDF, y: number, color: RGB = PDF_COLORS.border) {
  setColor(doc, color, "draw");
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

// ─── Page header / footer ─────────────────────────────────────────────────────

function addPageHeader(doc: jsPDF, title: string, meta: ReportMeta) {
  rect(doc, 0, 0, PAGE_W, HEADER_H, PDF_COLORS.navy);
  text(doc, "NEXUS SRP", MARGIN, 8, PDF_COLORS.white, 8, true);
  text(doc, meta.project_name, PAGE_W / 2, 8, PDF_COLORS.white, 8, false, "center");
  text(doc, title, PAGE_W - MARGIN, 8, PDF_COLORS.white, 8, false, "right");
}

function addPageFooter(doc: jsPDF, pageNum: number, totalPages: number, meta: ReportMeta) {
  const y = PAGE_H - FOOTER_H;
  hrule(doc, y, PDF_COLORS.border);
  text(doc, `${meta.generated_at.slice(0, 10)} · ${meta.version} · ${meta.data_source}`, MARGIN, y + 5, PDF_COLORS.muted, 7);
  text(doc, `Page ${pageNum} of ${totalPages}`, PAGE_W / 2, y + 5, PDF_COLORS.muted, 7, false, "center");
  text(doc, "Confidential", PAGE_W - MARGIN, y + 5, PDF_COLORS.muted, 7, false, "right");
}

// ─── Score indicator ──────────────────────────────────────────────────────────

function scoreColor(score: number): RGB {
  return score >= 75 ? PDF_COLORS.success : score >= 50 ? PDF_COLORS.warning : PDF_COLORS.danger;
}

function drawScoreBox(doc: jsPDF, x: number, y: number, w: number, h: number, score: number, label: string) {
  const bg: RGB = score >= 75 ? [240, 253, 244] : score >= 50 ? [255, 251, 235] : [254, 242, 242];
  const fg = scoreColor(score);
  rect(doc, x, y, w, h, bg, PDF_COLORS.border);
  text(doc, String(score), x + w / 2, y + h / 2 - 1, fg, 20, true, "center");
  text(doc, label, x + w / 2, y + h / 2 + 6, PDF_COLORS.muted, 7.5, false, "center");
}

// ─── Bar chart primitive ──────────────────────────────────────────────────────

interface BarData { label: string; value: number; color: RGB; }

function drawBarChart(
  doc:     jsPDF,
  x:       number,
  y:       number,
  w:       number,
  h:       number,
  bars:    BarData[],
  title?:  string,
  maxVal?: number,
) {
  const topPad   = title ? 8 : 2;
  const botPad   = 14;
  const leftPad  = 8;
  const rightPad = 4;
  const chartH   = h - topPad - botPad;
  const chartW   = w - leftPad - rightPad;

  if (title) {
    text(doc, title, x + w / 2, y + 6, PDF_COLORS.muted, 8, true, "center");
  }

  const chartY = y + topPad;
  const max    = maxVal ?? Math.max(...bars.map((b) => b.value), 1);
  const barW   = (chartW / bars.length) * 0.6;
  const gap    = chartW / bars.length;

  // Axis lines
  setColor(doc, PDF_COLORS.border, "draw");
  doc.setLineWidth(0.3);
  doc.line(x + leftPad, chartY, x + leftPad, chartY + chartH);
  doc.line(x + leftPad, chartY + chartH, x + leftPad + chartW, chartY + chartH);

  bars.forEach((b, i) => {
    const bx  = x + leftPad + gap * i + (gap - barW) / 2;
    const bh  = (b.value / max) * chartH;
    const by  = chartY + chartH - bh;
    rect(doc, bx, by, barW, bh, b.color);

    // Value label above bar
    text(doc, String(b.value), bx + barW / 2, by - 1.5, PDF_COLORS.muted, 6.5, false, "center");

    // X-axis label
    const labelLines = doc.splitTextToSize(b.label, gap - 1) as string[];
    text(doc, labelLines[0], bx + barW / 2, chartY + chartH + 5, PDF_COLORS.muted, 6.5, false, "center");
  });
}

// ─── Page 1: Cover ────────────────────────────────────────────────────────────

function addCoverPage(doc: jsPDF, meta: ReportMeta, result: OrchestratorResult, branding: Required<PDFReportRequest["branding"]>) {
  // Full-bleed navy header band
  rect(doc, 0, 0, PAGE_W, 75, PDF_COLORS.navy);

  // Company / tool name
  text(doc, branding.company_name, MARGIN, 22, PDF_COLORS.white, 11, false);
  text(doc, "Schedule Intelligence & Revenue Risk Platform", MARGIN, 30, [180, 210, 255], 9.5);

  // Separator line
  setColor(doc, PDF_COLORS.blue, "draw");
  doc.setLineWidth(1);
  doc.line(MARGIN, 35, PAGE_W - MARGIN, 35);

  // Report title
  text(doc, "Schedule Analysis Report", MARGIN, 50, PDF_COLORS.white, 22, true);
  text(doc, meta.project_name, MARGIN, 62, [180, 210, 255], 13);

  // Score strip inside header
  const scores = [
    { id: "DCMA",        label: "DCMA",        score: result.results.DCMA?.summary.score },
    { id: "CPM",         label: "CPM",         score: result.results.CPM?.summary.score },
    { id: "EVM",         label: "EVM",         score: result.results.EVM?.summary.score },
    { id: "MONTE_CARLO", label: "Monte Carlo", score: result.results.MONTE_CARLO?.summary.score },
    { id: "OVERALL",     label: "Overall",     score: result.summary.overall_score },
  ];
  const boxW = (CONTENT_W - 8) / 5;
  scores.forEach(({ label, score }, i) => {
    if (score != null) drawScoreBox(doc, MARGIN + (boxW + 2) * i, 82, boxW, 28, score, label);
  });

  // Project details block
  const detailY = 120;
  rect(doc, MARGIN, detailY, CONTENT_W, 80, PDF_COLORS.light, PDF_COLORS.border);

  text(doc, "PROJECT DETAILS", MARGIN + 6, detailY + 9, PDF_COLORS.navy, 8, true);
  hrule(doc, detailY + 12, PDF_COLORS.border);

  const detailRows: [string, string][] = [
    ["Project ID",     meta.project_id],
    ["Project Type",   meta.project_type],
    ["Update / Cycle", meta.update_id],
    ["Data Date",      meta.data_date],
    ["Generated At",   meta.generated_at.slice(0, 19).replace("T", " ")],
    ["Data Source",    meta.data_source],
  ];
  detailRows.forEach(([label, value], i) => {
    const dy = detailY + 20 + i * 10;
    text(doc, label,  MARGIN + 6,               dy, PDF_COLORS.muted, 8.5, true);
    text(doc, value,  MARGIN + 6 + CONTENT_W / 2, dy, PDF_COLORS.text,  8.5);
  });

  // Branding footer
  rect(doc, 0, PAGE_H - 20, PAGE_W, 20, PDF_COLORS.navy);
  text(doc, branding.prepared_by   ? `Prepared by: ${branding.prepared_by}`   : "NEXUS SRP", MARGIN, PAGE_H - 9, [180, 210, 255], 8);
  text(doc, branding.prepared_for  ? `Prepared for: ${branding.prepared_for}` : "", PAGE_W / 2, PAGE_H - 9, [180, 210, 255], 8, false, "center");
  text(doc, branding.footer_text ?? "Confidential", PAGE_W - MARGIN, PAGE_H - 9, [180, 210, 255], 8, false, "right");
}

// ─── Page 2: Executive Summary ────────────────────────────────────────────────

function addExecutivePage(doc: jsPDF, meta: ReportMeta, result: OrchestratorResult) {
  doc.addPage();
  addPageHeader(doc, "Executive Summary", meta);

  let y = HEADER_H + 10;

  text(doc, "Executive Summary", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 8;

  const dcma = result.results.DCMA as DCMAOutput | undefined;
  const cpm  = result.results.CPM  as CPMOutput  | undefined;
  const evm  = result.results.EVM  as EVMOutput  | undefined;
  const mc   = result.results.MONTE_CARLO as MonteCarloOutput | undefined;

  // ── Narrative ──────────────────────────────────────────────────────────────
  const os  = result.summary.overall_score;
  const osl = os >= 75 ? "Good" : os >= 50 ? "Moderate" : "Poor";

  const narrative = [
    `Overall schedule health is ${osl} (${os}/100) based on ${result.summary.engines_run.length} analytical engines run against the ${meta.update_id} update (data date ${meta.data_date}).`,
    dcma ? `DCMA 14-point assessment identified ${dcma.detail.total_violations} violations across ${dcma.detail.check_results.filter((c) => c.status === "Fail").length} failed checks. ${dcma.detail.critical_failures.length} critical failures require immediate action.` : "",
    cpm  ? `Critical path has ${cpm.detail.critical_path.length} activities. Finish variance is ${cpm.detail.finish_variance_days > 0 ? "+" : ""}${cpm.detail.finish_variance_days} days. CPLI = ${cpm.detail.cpli.toFixed(2)}.` : "",
    evm  ? `EVM indices: SPI ${evm.detail.spi.toFixed(2)}, CPI ${evm.detail.cpi.toFixed(2)}. Estimated overrun: ${evm.detail.vac < 0 ? `AED ${Math.abs(evm.detail.vac / 1e6).toFixed(1)}M over budget` : "within budget"}.` : "",
    mc   ? `Monte Carlo (${mc.detail.iterations.toLocaleString()} iterations): ${mc.detail.planned_finish_confidence.toFixed(0)}% probability of meeting planned finish.` : "",
  ].filter(Boolean);

  narrative.forEach((line) => {
    const lines = doc.splitTextToSize(line, CONTENT_W) as string[];
    setColor(doc, PDF_COLORS.text, "text");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 2;
  });

  y += 4;

  // ── KPI grid (2×4 boxes) ──────────────────────────────────────────────────
  text(doc, "KEY PERFORMANCE INDICATORS", MARGIN, y, PDF_COLORS.navy, 8.5, true);
  y += 5;

  const kpis: Array<{ label: string; value: string; color: RGB; sub?: string }> = [
    { label: "Schedule Risk Score",     value: `${result.summary.overall_score}`,        color: scoreColor(result.summary.overall_score), sub: "/100" },
    { label: "DCMA Violations",         value: String(dcma?.detail.total_violations ?? "—"), color: (dcma?.detail.total_violations ?? 0) > 20 ? PDF_COLORS.danger : PDF_COLORS.warning },
    { label: "Critical Path Duration",  value: cpm ? `${cpm.detail.critical_path_duration}d` : "—", color: PDF_COLORS.navy },
    { label: "Finish Variance",         value: cpm ? `${cpm.detail.finish_variance_days > 0 ? "+" : ""}${cpm.detail.finish_variance_days}d` : "—", color: (cpm?.detail.finish_variance_days ?? 0) > 0 ? PDF_COLORS.danger : PDF_COLORS.success },
    { label: "SPI",                     value: evm ? evm.detail.spi.toFixed(2) : "—",   color: (evm?.detail.spi ?? 1) < 0.9 ? PDF_COLORS.danger : PDF_COLORS.success },
    { label: "CPI",                     value: evm ? evm.detail.cpi.toFixed(2) : "—",   color: (evm?.detail.cpi ?? 1) < 0.9 ? PDF_COLORS.danger : PDF_COLORS.success },
    { label: "On-Time Probability",     value: mc  ? `${mc.detail.planned_finish_confidence.toFixed(0)}%` : "—", color: (mc?.detail.planned_finish_confidence ?? 50) < 50 ? PDF_COLORS.danger : PDF_COLORS.success },
    { label: "Cost Overrun Forecast",   value: evm ? (evm.detail.vac < 0 ? `AED ${(Math.abs(evm.detail.vac) / 1e6).toFixed(0)}M` : "Within Budget") : "—", color: (evm?.detail.vac ?? 0) < 0 ? PDF_COLORS.danger : PDF_COLORS.success },
  ];

  const boxW2 = (CONTENT_W - 6) / 4;
  const boxH2 = 22;
  kpis.forEach(({ label, value, color, sub }, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const bx  = MARGIN + col * (boxW2 + 2);
    const by  = y + row * (boxH2 + 3);

    rect(doc, bx, by, boxW2, boxH2, PDF_COLORS.light, PDF_COLORS.border);
    text(doc, value + (sub ?? ""), bx + boxW2 / 2, by + 10, color,          14, true,  "center");
    text(doc, label,               bx + boxW2 / 2, by + 18, PDF_COLORS.muted, 7, false, "center");
  });

  y += Math.ceil(kpis.length / 4) * (boxH2 + 3) + 8;

  // ── Critical alerts ───────────────────────────────────────────────────────
  if (dcma && (dcma.detail.critical_failures.length > 0 || dcma.detail.violations_by_severity.Critical.length > 0)) {
    text(doc, "CRITICAL ALERTS", MARGIN, y, PDF_COLORS.danger, 8.5, true);
    y += 5;

    const alerts: string[] = [];
    if (dcma.detail.critical_failures.length > 0) {
      alerts.push(`${dcma.detail.critical_failures.length} DCMA checks failed at Critical severity (weight 3).`);
    }
    if (dcma.detail.violations_by_severity.Critical.length > 0) {
      const top = dcma.detail.violations_by_severity.Critical.slice(0, 3).map((v) => v.name).join("; ");
      alerts.push(`${dcma.detail.violations_by_severity.Critical.length} Critical violations — top activities: ${top}`);
    }
    if (cpm && cpm.detail.negative_float_count > 0) {
      alerts.push(`${cpm.detail.negative_float_count} activities have negative float — critical path integrity at risk.`);
    }

    alerts.forEach((alert) => {
      rect(doc, MARGIN, y, CONTENT_W, 8, [254, 242, 242] as RGB, PDF_COLORS.danger);
      text(doc, `⚠  ${alert}`, MARGIN + 3, y + 5.5, PDF_COLORS.danger, 8);
      y += 11;
    });
  }
}

// ─── Page 3: DCMA Assessment ──────────────────────────────────────────────────

function addDCMAPage(doc: jsPDF, meta: ReportMeta, dcma: DCMAOutput) {
  doc.addPage();
  addPageHeader(doc, "DCMA Assessment", meta);

  let y = HEADER_H + 10;
  text(doc, "DCMA 14-Point Schedule Assessment", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 6;

  // Summary row
  const d      = dcma.detail;
  const passed = d.check_results.filter((c) => c.status === "Pass").length;
  const failed = d.check_results.filter((c) => c.status === "Fail").length;
  const score  = dcma.summary.score;

  const summaryBoxes: Array<{ label: string; value: string; color: RGB }> = [
    { label: "Score",            value: `${score}/100`,   color: scoreColor(score) },
    { label: "Checks Passed",    value: `${passed}/${d.check_results.length}`, color: PDF_COLORS.success },
    { label: "Checks Failed",    value: String(failed),   color: failed > 0 ? PDF_COLORS.danger : PDF_COLORS.success },
    { label: "Total Violations", value: String(d.total_violations), color: d.total_violations > 20 ? PDF_COLORS.danger : PDF_COLORS.warning },
    { label: "Schedule at Risk", value: `${d.total_schedule_impact_days}d`, color: PDF_COLORS.warning },
  ];
  const sbW = (CONTENT_W - 4) / 5;
  summaryBoxes.forEach(({ label, value, color }, i) => {
    const bx = MARGIN + i * (sbW + 1);
    rect(doc, bx, y, sbW, 18, PDF_COLORS.light, PDF_COLORS.border);
    text(doc, value, bx + sbW / 2, y + 9,  color,          12, true,  "center");
    text(doc, label, bx + sbW / 2, y + 15, PDF_COLORS.muted, 6.5, false, "center");
  });
  y += 24;

  // 14-check table
  const tableBody = d.check_results.map((c) => {
    const vbc = d.violations_by_check[c.check_code];
    const statusEmoji = c.status === "Pass" ? "✓ Pass" : c.status === "Fail" ? "✗ Fail" : c.status === "Warning" ? "~ Warn" : "— N/A";
    return [
      c.check_code,
      c.check_name,
      statusEmoji,
      c.severity_weight === 3 ? "Critical" : c.severity_weight === 2 ? "High" : "Medium",
      c.status === "N/A" ? "—" : String(c.failed_count),
      c.status === "N/A" ? "N/A" : `${c.pass_rate_pct.toFixed(1)}%`,
      vbc && vbc.subtotal_risk_pct > 0 ? `${vbc.subtotal_risk_pct.toFixed(1)}%` : "—",
    ];
  });

  const opts: AutoTableOptions = {
    startY:  y,
    head:    [["Code", "Check Name", "Status", "Severity", "Violations", "Pass Rate", "Risk %"]],
    body:    tableBody,
    theme:   "grid",
    styles:          { fontSize: 8, cellPadding: 2.5, font: "helvetica", textColor: PDF_COLORS.text },
    headStyles:      { fillColor: PDF_COLORS.navy, textColor: PDF_COLORS.white, fontSize: 8.5, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 16,  halign: "center", fontStyle: "bold" },
      1: { cellWidth: 55 },
      2: { cellWidth: 18,  halign: "center", fontStyle: "bold" },
      3: { cellWidth: 18,  halign: "center" },
      4: { cellWidth: 18,  halign: "center", fontStyle: "bold" },
      5: { cellWidth: 18,  halign: "center" },
      6: { cellWidth: 18,  halign: "center", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: PDF_COLORS.light },
    didParseCell(data) {
      if (data.section === "body") {
        const statusVal = String(data.row.cells[2]?.raw ?? "");
        if (statusVal.startsWith("✗")) {
          data.row.cells[2].styles.textColor = PDF_COLORS.danger;
          data.row.cells[2].styles.fontStyle = "bold";
        } else if (statusVal.startsWith("✓")) {
          data.row.cells[2].styles.textColor = PDF_COLORS.success;
          data.row.cells[2].styles.fontStyle = "bold";
        } else if (statusVal.startsWith("~")) {
          data.row.cells[2].styles.textColor = PDF_COLORS.warning;
        }
      }
    },
  };
  autoTable(doc, opts);
}

// ─── Page 4: Top Risk Activities ──────────────────────────────────────────────

function addRiskPage(doc: jsPDF, meta: ReportMeta, dcma: DCMAOutput) {
  doc.addPage();
  addPageHeader(doc, "Risk Register", meta);

  let y = HEADER_H + 10;
  text(doc, "Top Risk Activities", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 8;

  const top = dcma.detail.top_risk_activities.slice(0, 20);

  if (top.length === 0) {
    text(doc, "No risk activities identified.", MARGIN, y, PDF_COLORS.muted, 10);
    return;
  }

  // Severity distribution mini-bar chart
  const sev = dcma.detail.violations_by_severity;
  const sevBars: BarData[] = [
    { label: "Critical", value: sev.Critical.length, color: PDF_COLORS.danger  },
    { label: "High",     value: sev.High.length,     color: PDF_COLORS.warning },
    { label: "Medium",   value: sev.Medium.length,   color: [180, 83, 9] as RGB },
    { label: "Low",      value: sev.Low.length,       color: PDF_COLORS.success },
  ];
  drawBarChart(doc, MARGIN, y, CONTENT_W / 2 - 4, 44, sevBars, "Violations by Severity");

  // Risk % by top WBS
  const wbsEntries = Object.entries(dcma.detail.violations_by_wbs)
    .sort((a, b) => b[1].risk_contribution_pct - a[1].risk_contribution_pct)
    .slice(0, 5);
  const wbsBars: BarData[] = wbsEntries.map(([k, v]) => ({
    label: `WBS ${k}`,
    value: Math.round(v.risk_contribution_pct),
    color: PDF_COLORS.blue,
  }));
  if (wbsBars.length > 0) {
    drawBarChart(doc, MARGIN + CONTENT_W / 2 + 4, y, CONTENT_W / 2 - 4, 44, wbsBars, "Risk % by WBS Area", 100);
  }
  y += 52;

  // Risk register table
  const tableBody = top.map((act, i) => [
    `#${i + 1}`,
    act.activity_id,
    act.name.length > 45 ? act.name.slice(0, 43) + "…" : act.name,
    act.checks_failed.join(", "),
    `${act.risk_contribution_pct.toFixed(1)}%`,
    `${act.total_schedule_impact_days}d`,
    act.responsible_party ?? "—",
  ]);

  autoTable(doc, {
    startY:  y,
    head:    [["#", "Activity ID", "Activity Name", "Checks Failed", "Risk %", "Impact", "Owner"]],
    body:    tableBody,
    theme:   "grid",
    styles:          { fontSize: 7.5, cellPadding: 2, font: "helvetica", textColor: PDF_COLORS.text },
    headStyles:      { fillColor: PDF_COLORS.navy, textColor: PDF_COLORS.white, fontSize: 8, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center", fontStyle: "bold" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 52 },
      3: { cellWidth: 30 },
      4: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 34 },
    },
    alternateRowStyles: { fillColor: PDF_COLORS.light },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 0) {
        const rank = parseInt(String(data.cell.raw).replace("#", ""));
        if (rank <= 3) {
          data.cell.styles.textColor = PDF_COLORS.danger;
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.section === "body" && data.column.index === 4) {
        const pct = parseFloat(String(data.cell.raw));
        if (pct > 5) {
          data.cell.styles.textColor = PDF_COLORS.danger;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
}

// ─── Page 5: EVM ─────────────────────────────────────────────────────────────

function addEVMPage(doc: jsPDF, meta: ReportMeta, evm: EVMOutput) {
  doc.addPage();
  addPageHeader(doc, "EVM Performance", meta);

  let y = HEADER_H + 10;
  text(doc, "Earned Value Management", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 8;

  const d = evm.detail;
  const fmt = (n: number) => `AED ${(n / 1e6).toFixed(1)}M`;

  // Index boxes
  const indices: Array<{ key: string; value: string; color: RGB; note: string }> = [
    { key: "SPI",     value: d.spi.toFixed(3),   color: scoreColor(d.spi < 1 ? Math.round(d.spi * 80) : 80), note: "EV / PV" },
    { key: "CPI",     value: d.cpi.toFixed(3),   color: scoreColor(d.cpi < 1 ? Math.round(d.cpi * 80) : 80), note: "EV / AC" },
    { key: "TCPI",    value: d.tcpi.toFixed(3),  color: d.tcpi > 1.1 ? PDF_COLORS.danger : PDF_COLORS.success, note: "(BAC−EV)/(BAC−AC)" },
    { key: "IEAC(t)", value: `${d.ieac_t.toFixed(0)}d`, color: d.schedule_overrun_days > 0 ? PDF_COLORS.warning : PDF_COLORS.success, note: "Planned Dur / SPI" },
  ];
  const ibW = (CONTENT_W - 6) / 4;
  indices.forEach(({ key, value, color, note }, i) => {
    const bx = MARGIN + i * (ibW + 2);
    rect(doc, bx, y, ibW, 22, PDF_COLORS.light, PDF_COLORS.border);
    text(doc, value, bx + ibW / 2, y + 10, color,           14, true,  "center");
    text(doc, key,   bx + ibW / 2, y + 16, PDF_COLORS.muted, 8, true,  "center");
    text(doc, note,  bx + ibW / 2, y + 20, PDF_COLORS.muted, 6.5, false, "center");
  });
  y += 28;

  // EVM financials bar chart
  const evmBars: BarData[] = [
    { label: "PV",  value: Math.round(d.pv  / 1e6), color: PDF_COLORS.blue },
    { label: "EV",  value: Math.round(d.ev  / 1e6), color: PDF_COLORS.success },
    { label: "AC",  value: Math.round(d.ac  / 1e6), color: PDF_COLORS.warning },
    { label: "BAC", value: Math.round(d.bac / 1e6), color: [99, 102, 241] as RGB },
    { label: "EAC", value: Math.round(d.eac / 1e6), color: d.eac > d.bac ? PDF_COLORS.danger : PDF_COLORS.success },
  ];
  drawBarChart(doc, MARGIN, y, CONTENT_W, 55, evmBars, "EVM Financials (AED Millions)");
  y += 62;

  // Financial summary table
  autoTable(doc, {
    startY:  y,
    head:    [["Metric", "Value", "Formula / Interpretation"]],
    body:    [
      ["Planned Value (PV)",   fmt(d.pv),   "Budgeted cost of work scheduled"],
      ["Earned Value (EV)",    fmt(d.ev),   "Budgeted cost of work performed"],
      ["Actual Cost (AC)",     fmt(d.ac),   "Actual cost incurred"],
      ["BAC",                  fmt(d.bac),  "Total authorized budget"],
      ["EAC (CPI forecast)",   fmt(d.eac),  "BAC / CPI"],
      ["VAC",                  `${d.vac < 0 ? "-" : "+"}${fmt(Math.abs(d.vac))}`, d.vac < 0 ? "OVER BUDGET" : "Under budget"],
      ["Schedule Overrun",     `${d.schedule_overrun_days > 0 ? "+" : ""}${d.schedule_overrun_days} days`, d.schedule_overrun_days > 0 ? "Behind schedule" : "On schedule"],
    ],
    theme:   "striped",
    styles:  { fontSize: 8.5, cellPadding: 3, font: "helvetica" },
    headStyles: { fillColor: PDF_COLORS.navy, textColor: PDF_COLORS.white, fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { halign: "right",   cellWidth: 38, fontStyle: "bold" },
      2: { cellWidth: 79 },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 1) {
        const raw = String(data.cell.raw);
        if (raw.startsWith("-")) data.cell.styles.textColor = PDF_COLORS.danger;
        else if (raw.startsWith("+")) data.cell.styles.textColor = PDF_COLORS.success;
      }
    },
  });
}

// ─── Page 6: Monte Carlo ──────────────────────────────────────────────────────

function addMCPage(doc: jsPDF, meta: ReportMeta, mc: MonteCarloOutput) {
  doc.addPage();
  addPageHeader(doc, "Monte Carlo Simulation", meta);

  let y = HEADER_H + 10;
  text(doc, "Monte Carlo Risk Simulation", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 8;

  const d = mc.detail;

  // Summary KPIs
  const mcKPIs: Array<{ label: string; value: string; color: RGB }> = [
    { label: "Iterations",         value: d.iterations.toLocaleString(),                    color: PDF_COLORS.navy },
    { label: "Mean Duration",      value: `${d.mean_days.toFixed(0)}d`,                      color: PDF_COLORS.navy },
    { label: "On-Time Probability",value: `${d.planned_finish_confidence.toFixed(0)}%`,      color: d.planned_finish_confidence < 50 ? PDF_COLORS.danger : PDF_COLORS.success },
    { label: "P80 Duration",       value: `${d.confidence_dates.find((c) => c.label === "P80")?.days ?? "—"}d`, color: PDF_COLORS.warning },
  ];
  const kbW = (CONTENT_W - 6) / 4;
  mcKPIs.forEach(({ label, value, color }, i) => {
    const bx = MARGIN + i * (kbW + 2);
    rect(doc, bx, y, kbW, 18, PDF_COLORS.light, PDF_COLORS.border);
    text(doc, value, bx + kbW / 2, y + 9,  color,           12, true,  "center");
    text(doc, label, bx + kbW / 2, y + 15, PDF_COLORS.muted, 6.5, false, "center");
  });
  y += 24;

  // Confidence dates table
  autoTable(doc, {
    startY: y,
    head:   [["Confidence Level", "Duration (days)", "Date", "Interpretation"]],
    body:   d.confidence_dates.map((c) => [
      c.label,
      String(c.days),
      c.date ?? "—",
      c.description ?? (c.label === "P50" ? "50% chance finish ≤ this date" : `${c.label.slice(1)}% chance finish ≤ this date`),
    ]),
    theme:  "grid",
    styles:     { fontSize: 8.5, cellPadding: 2.5, font: "helvetica" },
    headStyles: { fillColor: PDF_COLORS.navy, textColor: PDF_COLORS.white, fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 34, halign: "center" },
      1: { halign: "center",  cellWidth: 30 },
      2: { halign: "center",  cellWidth: 30 },
      3: { cellWidth: 78 },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 0) {
        const lbl = String(data.cell.raw);
        if (lbl === "P50") data.cell.styles.textColor = PDF_COLORS.success;
        if (lbl === "P80") data.cell.styles.textColor = PDF_COLORS.warning;
        if (lbl === "P90" || lbl === "P95") data.cell.styles.textColor = PDF_COLORS.danger;
      }
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Tornado / sensitivity chart
  text(doc, "Schedule Sensitivity — Top Drivers (Spearman Rank Correlation)", MARGIN, y, PDF_COLORS.navy, 9, true);
  y += 6;

  const tornado = d.tornado.slice(0, 10);
  const barH    = 8;
  const maxSens = Math.max(...tornado.map((t) => Math.abs(t.sensitivity)), 0.01);
  const barMaxW = CONTENT_W - 60;

  tornado.forEach((t, i) => {
    const by   = y + i * (barH + 2);
    const bw   = (Math.abs(t.sensitivity) / maxSens) * barMaxW;
    const color: RGB = t.sensitivity > 0 ? PDF_COLORS.blue : PDF_COLORS.danger;

    // Label
    const shortName = (t.activity_id.split("-").pop()?.toUpperCase() ?? t.activity_id);
    text(doc, shortName, MARGIN + 16, by + 5.5, PDF_COLORS.muted, 7, false, "right");

    // Bar
    rect(doc, MARGIN + 18, by + 1, bw, barH - 2, color);

    // Value
    text(doc, t.sensitivity.toFixed(2), MARGIN + 18 + bw + 2, by + 5.5, PDF_COLORS.muted, 7);

    // Range label
    text(doc, `±${t.range_days}d`, PAGE_W - MARGIN - 16, by + 5.5, PDF_COLORS.muted, 7, false, "right");
  });
}

// ─── Page 7: Recommendations ─────────────────────────────────────────────────

function addRecommendationsPage(doc: jsPDF, meta: ReportMeta, dcma: DCMAOutput, cpm?: CPMOutput) {
  doc.addPage();
  addPageHeader(doc, "Recommendations", meta);

  let y = HEADER_H + 10;
  text(doc, "Recommended Actions", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 8;

  // Build recommendations from engine data
  const recs: Array<{
    priority: number;
    title: string;
    detail: string;
    impact: string;
    effort: "Low" | "Medium" | "High";
    owner: string;
    framework: string;
  }> = [];

  const d = dcma.detail;

  // Logic gaps
  const logicVBC = d.violations_by_check["LOGIC"];
  if (logicVBC && logicVBC.violation_count > 0) {
    recs.push({
      priority:  1,
      title:     `Close ${logicVBC.violation_count} logic gaps (missing predecessors/successors)`,
      detail:    "Open network ends produce unreliable float values and break the critical path. Each activity with no real predecessor or successor is an open end that must be resolved.",
      impact:    `Restores critical path integrity. Estimated ${Math.round(logicVBC.subtotal_schedule_impact_days * 0.6)}–${logicVBC.subtotal_schedule_impact_days}d schedule risk reduction.`,
      effort:    "Low",
      owner:     "Scheduler",
      framework: "DCMA — LOGIC",
    });
  }

  // Negative float
  if (cpm && cpm.detail.negative_float_count > 0) {
    recs.push({
      priority:  2,
      title:     `Resolve ${cpm.detail.negative_float_count} activities with negative total float`,
      detail:    "Negative float indicates the activity is behind its latest allowable dates. Activities must either be crashed (additional resource) or the schedule logic re-sequenced.",
      impact:    `${cpm.detail.negative_float_count} activities directly on critical path. Each day recovered reduces finish overrun.`,
      effort:    "High",
      owner:     "Project Manager + Scheduler",
      framework: "CPM — Negative Float",
    });
  }

  // Hard constraints
  const constVBC = d.violations_by_check["CONSTRAINTS"];
  if (constVBC && constVBC.violation_count > 0) {
    recs.push({
      priority:  3,
      title:     `Review ${constVBC.violation_count} hard date constraints`,
      detail:    "Hard constraints (SNET/FNLT) that are past the data date suppress correct float calculations and may mask real schedule risk.",
      impact:    "Removing invalid constraints restores float accuracy across the network.",
      effort:    "Low",
      owner:     "Scheduler",
      framework: "DCMA — CONSTRAINTS",
    });
  }

  // High duration tasks
  const durVBC = d.violations_by_check["DURATION"];
  if (durVBC && durVBC.violation_count > 0) {
    recs.push({
      priority:  4,
      title:     `Decompose ${durVBC.violation_count} long-duration activities (>44 working days)`,
      detail:    "Activities longer than 44 days reduce schedule control visibility. Each should be broken into milestones or sub-activities.",
      impact:    "Improves forecasting accuracy and early-warning detection for slippage.",
      effort:    "Medium",
      owner:     "Scheduler + Work Package Owners",
      framework: "DCMA — DURATION",
    });
  }

  // Resources
  const resVBC = d.violations_by_check["RESOURCES"];
  if (resVBC && resVBC.violation_count > 0) {
    recs.push({
      priority:  5,
      title:     `Assign resources to ${resVBC.violation_count} unloaded activities`,
      detail:    "Activities without resource assignments cannot be levelled, costed, or tracked by EVM. This is a pre-condition for earned value reporting.",
      impact:    "Enables EVM and resource-loaded schedule for contract compliance.",
      effort:    "Medium",
      owner:     "Work Package Owners",
      framework: "DCMA — RESOURCES",
    });
  }

  // Fill remaining from top violations
  d.violations_by_check && Object.entries(d.violations_by_check)
    .filter(([code]) => !["LOGIC","CONSTRAINTS","DURATION","RESOURCES"].includes(code))
    .sort(([, a], [, b]) => b.subtotal_risk_pct - a.subtotal_risk_pct)
    .slice(0, 3)
    .forEach(([code, vbc]) => {
      if (vbc.violation_count > 0 && recs.length < 8) {
        recs.push({
          priority:  recs.length + 1,
          title:     `Address ${vbc.violation_count} ${vbc.check_name} violations`,
          detail:    vbc.check_description ?? `Resolve all ${vbc.check_name} issues identified in the schedule.`,
          impact:    `${vbc.subtotal_risk_pct.toFixed(1)}% of total schedule risk. ${vbc.subtotal_schedule_impact_days}d schedule exposure.`,
          effort:    "Medium",
          owner:     "Scheduler",
          framework: `DCMA — ${code}`,
        });
      }
    });

  const effortColor: Record<string, RGB> = {
    Low:    PDF_COLORS.success,
    Medium: PDF_COLORS.warning,
    High:   PDF_COLORS.danger,
  };

  recs.slice(0, 8).forEach((rec, i) => {
    if (y > PAGE_H - 60) {
      doc.addPage();
      addPageHeader(doc, "Recommendations (cont.)", meta);
      y = HEADER_H + 10;
    }

    // Priority badge
    rect(doc, MARGIN, y, 8, 8, rec.priority <= 2 ? PDF_COLORS.danger : PDF_COLORS.blue);
    text(doc, String(rec.priority), MARGIN + 4, y + 5.5, PDF_COLORS.white, 7, true, "center");

    // Title
    text(doc, rec.title, MARGIN + 11, y + 5.5, PDF_COLORS.navy, 9.5, true);
    y += 12;

    // Framework badge
    rect(doc, MARGIN + 11, y, 40, 6, PDF_COLORS.light, PDF_COLORS.border);
    text(doc, rec.framework, MARGIN + 13, y + 4.2, PDF_COLORS.muted, 6.5, false);

    // Effort badge
    rect(doc, MARGIN + 56, y, 30, 6, PDF_COLORS.light, PDF_COLORS.border);
    text(doc, `Effort: ${rec.effort}`, MARGIN + 58, y + 4.2, effortColor[rec.effort], 6.5, true);

    // Owner
    text(doc, `Owner: ${rec.owner}`, MARGIN + 92, y + 4.2, PDF_COLORS.muted, 6.5);
    y += 9;

    // Detail text
    const detailLines = doc.splitTextToSize(rec.detail, CONTENT_W - 12) as string[];
    setColor(doc, PDF_COLORS.text, "text");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(detailLines, MARGIN + 11, y);
    y += detailLines.length * 4.5 + 2;

    // Impact
    const impactLines = doc.splitTextToSize(`Impact: ${rec.impact}`, CONTENT_W - 12) as string[];
    setColor(doc, PDF_COLORS.success, "text");
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(impactLines, MARGIN + 11, y);
    y += impactLines.length * 4.5;

    hrule(doc, y + 2, PDF_COLORS.border);
    y += 8;
  });
}

// ─── Last page: Appendix / Methodology ───────────────────────────────────────

function addAppendixPage(doc: jsPDF, meta: ReportMeta) {
  doc.addPage();
  addPageHeader(doc, "Appendix", meta);

  let y = HEADER_H + 10;
  text(doc, "Methodology & Data Sources", MARGIN, y, PDF_COLORS.navy, 16, true);
  y += 6;
  hrule(doc, y);
  y += 8;

  const sections: Array<{ title: string; body: string }> = [
    {
      title: "DCMA 14-Point Schedule Assessment",
      body:  "Score = earned points / 27 × 100. Checks weighted: Critical = 3 pts, High = 2 pts, Medium = 1 pt. Thresholds: Logic < 5% missing, Leads < 5%, Lags < 5%, High Float < 5%, High Duration < 5%, Resources < 10%, Constraints < 10%. CPLI ≥ 0.95, BEI ≥ 0.95. Each violated activity is individually identified — no aggregated metrics without backing data.",
    },
    {
      title: "Critical Path Method (CPM)",
      body:  "Kahn topological sort → forward ES/EF pass → backward LS/LF pass → total float = LS−ES. Critical path = activities with TF ≤ 0. CPLI = (Remaining CP Duration + Float) / Remaining CP Duration. Near-critical threshold: TF ≤ 14 days.",
    },
    {
      title: "Earned Value Management (EVM)",
      body:  "SPI = EV / PV. CPI = EV / AC. TCPI = (BAC − EV) / (BAC − AC). EAC = BAC / CPI. IEAC(t) = Planned Duration / SPI. All values derived from schedule % complete and budget allocations when cost system data is unavailable.",
    },
    {
      title: "Monte Carlo Simulation",
      body:  "PERT three-point estimation: Optimistic = baseline × (1 − duration_buffer), Pessimistic = baseline × (1 + duration_buffer), Most Likely = baseline. 500–5,000 deterministic iterations using seeded linear congruential PRNG for reproducible results. Sensitivity = Spearman rank correlation between activity duration and project finish.",
    },
    {
      title: "Risk Contribution %",
      body:  "risk_contribution_pct = (activity impact / Σ all violations impact) × 100. Impact = remaining duration for logic/float violations; lag value for lag violations; overdue days for BEI; remaining duration × CPLI deficit for CPLI issues.",
    },
    {
      title: "Data Source",
      body:  meta.data_source,
    },
    {
      title: "Report Version",
      body:  `${meta.version} · Generated: ${meta.generated_at} · Generated by: ${meta.generated_by}`,
    },
  ];

  sections.forEach(({ title, body }) => {
    if (y > PAGE_H - 40) {
      doc.addPage();
      addPageHeader(doc, "Appendix (cont.)", meta);
      y = HEADER_H + 10;
    }
    text(doc, title, MARGIN, y, PDF_COLORS.navy, 9.5, true);
    y += 5;
    const lines = doc.splitTextToSize(body, CONTENT_W) as string[];
    setColor(doc, PDF_COLORS.text, "text");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 6;
    hrule(doc, y - 2, PDF_COLORS.border);
    y += 4;
  });
}

// ─── Public builder ───────────────────────────────────────────────────────────

export async function buildPDFReport(
  meta:    ReportMeta,
  result:  OrchestratorResult,
  request: PDFReportRequest,
): Promise<Buffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const dcma = result.results.DCMA as DCMAOutput | undefined;
  const cpm  = result.results.CPM  as CPMOutput  | undefined;
  const evm  = result.results.EVM  as EVMOutput  | undefined;
  const mc   = result.results.MONTE_CARLO as MonteCarloOutput | undefined;

  const branding = {
    primary_color: request.branding?.primary_color ?? "#0057B8",
    company_name:  request.branding?.company_name  ?? "NEXUS SRP",
    footer_text:   request.branding?.footer_text   ?? "Confidential",
    prepared_by:   request.branding?.prepared_by   ?? "",
    prepared_for:  request.branding?.prepared_for  ?? "",
  };

  const sections = request.sections ?? [
    "cover", "executive_summary", "dcma_scorecard", "top_risks",
    "evm_performance", "monte_carlo", "recommendations",
  ];

  if (sections.includes("cover"))            addCoverPage(doc, meta, result, branding);
  if (sections.includes("executive_summary")) addExecutivePage(doc, meta, result);
  if (sections.includes("dcma_scorecard") && dcma) addDCMAPage(doc, meta, dcma);
  if (sections.includes("top_risks")      && dcma) addRiskPage(doc, meta, dcma);
  if (sections.includes("evm_performance") && evm)  addEVMPage(doc, meta, evm);
  if (sections.includes("monte_carlo")    && mc)   addMCPage(doc, meta, mc);
  if (sections.includes("recommendations") && dcma) addRecommendationsPage(doc, meta, dcma, cpm);
  addAppendixPage(doc, meta);

  // Stamp page headers + footers now that we know total pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // Cover has its own footer — skip header/footer stamp for page 1
    if (p > 1) {
      addPageFooter(doc, p, totalPages, meta);
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
