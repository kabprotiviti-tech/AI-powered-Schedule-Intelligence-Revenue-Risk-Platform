"use client";

/**
 * Drill-Down Engine
 *
 * Navigation: Portfolio → Project → DCMA Check → Activity violations
 *
 * Strategy:
 *  - Fetch full violation dataset once from /api/drill-down (cached on server)
 *  - All filtering + sorting runs client-side with useMemo (no re-fetch)
 *  - Paginate at 100 rows/page — handles 10,000+ violations without DOM overload
 *  - URL query params pre-filter on load (?check=LOGIC, ?severity=Critical, etc.)
 *  - Each row expands inline to show full evidence, description, recommendations,
 *    and cross-check violations for the same activity
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, ChevronUp, Search, X, Filter,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Download,
  ArrowUpDown, ArrowUp, ArrowDown, Layers, Info,
  FileSpreadsheet, FileText,
} from "lucide-react";
import { PROJECTS } from "@/lib/data/mock";
import type { DCMAViolationRecord } from "@/lib/engines/dcma/index";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FacetCheck {
  check_code: string; check_name: string; check_description: string;
  violation_count: number; status: string; severity_weight: number;
  pass_rate_pct: number; subtotal_risk_pct: number;
}
interface FacetSeverity  { severity: string; count: number; }
interface FacetWBS       { wbs_prefix: string; violation_count: number; risk_contribution_pct: number; severity_counts: Record<string, number>; }

interface DrillDownResponse {
  project_id: string; project_name: string;
  execution_id: string; computed_at: string; duration_ms: number;
  total_count: number; filtered_count: number;
  violations: DCMAViolationRecord[];
  summary: {
    score: number; overall_pass: boolean;
    total_schedule_impact_days: number; violations_with_owner: number;
    critical_failures: string[]; cpli: number; bei: number; task_count: number;
    violations_by_severity: Record<string, number>;
  };
  facets: {
    checks: FacetCheck[]; severities: FacetSeverity[];
    wbs_areas: FacetWBS[]; responsible_parties: string[];
  };
  check_context: {
    check_code: string; check_name: string; description: string;
    status: string; pass_rate_pct: number;
    subtotal_risk_pct: number; subtotal_schedule_impact_days: number;
  } | null;
  activity_cross_check: Array<{ check_code: string; check_name: string; issue_type: string; severity: string; }> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE    = 100;
const SEV_COLORS: Record<string, string> = {
  Critical: "bg-danger/15 text-danger border-danger/30",
  High:     "bg-warning/15 text-warning border-warning/30",
  Medium:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Low:      "bg-surface text-text-secondary border-border",
};
const SEV_DOT: Record<string, string> = {
  Critical: "bg-danger", High: "bg-warning", Medium: "bg-blue-400", Low: "bg-surface",
};
const STATUS_STYLES: Record<string, string> = {
  Pass:    "text-success", Fail: "text-danger", Warning: "text-warning", "N/A": "text-text-secondary",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtEvidenceValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

function rowKey(v: DCMAViolationRecord): string {
  return `${v.activity_id}__${v.check_code}`;
}

function useDebounce<T>(value: T, delay = 200): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortHeader({
  label, sortKey: key, current, dir, onSort,
}: {
  label: string; sortKey: string;
  current: string; dir: "asc" | "desc";
  onSort: (k: string) => void;
}) {
  const active = current === key;
  return (
    <button
      onClick={() => onSort(key)}
      className="flex items-center gap-1 group hover:text-text-primary transition-colors"
    >
      {label}
      <span className="text-text-secondary">
        {active
          ? dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
          : <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-70" />}
      </span>
    </button>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${SEV_COLORS[severity] ?? SEV_COLORS.Low}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[severity] ?? "bg-surface"}`} />
      {severity}
    </span>
  );
}

function EvidenceGrid({ evidence }: { evidence: Record<string, unknown> }) {
  const SKIP = new Set(["formula", "violation_codes"]);
  const entries = Object.entries(evidence).filter(([k]) => !SKIP.has(k));
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <span className="text-[10px] text-text-secondary uppercase tracking-wide">{fmtKey(k)}</span>
          <span className={`font-medium mt-0.5 ${
            typeof v === "boolean" ? (v ? "text-danger" : "text-success") :
            typeof v === "number" && k.includes("float") && (v as number) < 0 ? "text-danger" :
            "text-text-primary"
          }`}>
            {fmtEvidenceValue(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ExpandedRow({
  violation,
  allViolations,
}: {
  violation: DCMAViolationRecord;
  allViolations: DCMAViolationRecord[];
}) {
  // Other checks that flagged the same activity
  const crossChecks = allViolations.filter(
    (v) => v.activity_id === violation.activity_id && v.check_code !== violation.check_code,
  );

  return (
    <div className="bg-canvas border-t border-border px-4 pb-4 pt-3 space-y-4">
      {/* Activity metadata strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {[
          { label: "Activity ID",  value: violation.external_id },
          { label: "WBS Code",     value: violation.wbs_code },
          { label: "Severity",     value: violation.severity,   colored: true },
          { label: "Risk Share",   value: `${violation.risk_contribution_pct.toFixed(2)}%` },
          { label: "Schedule Impact", value: `${violation.schedule_impact_days}d` },
          { label: "Issue Code",   value: violation.issue_code },
          { label: "Check",        value: violation.check_name },
          { label: "Risk Rank",    value: `#${violation.risk_rank}` },
        ].map(({ label, value, colored }) => (
          <div key={label} className="bg-surface rounded p-2">
            <div className="text-[10px] text-text-secondary uppercase tracking-wide">{label}</div>
            <div className={`font-semibold mt-0.5 ${colored ? SEV_COLORS[value]?.split(" ")[1] ?? "" : "text-text-primary"}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Violation description */}
      <div className="rounded-lg border border-border bg-surface/60 p-3">
        <p className="text-[11px] text-text-secondary uppercase tracking-wide font-semibold mb-1.5">
          Violation Detail
        </p>
        <p className="text-xs text-text-primary leading-relaxed">{violation.description}</p>
      </div>

      {/* Evidence — raw data that triggered the violation */}
      <div className="rounded-lg border border-border bg-surface/60 p-3">
        <p className="text-[11px] text-text-secondary uppercase tracking-wide font-semibold mb-2">
          Evidence (raw schedule data)
        </p>
        <EvidenceGrid evidence={violation.evidence} />
        {(violation.evidence as Record<string, unknown>)["formula"] && (
          <div className="mt-2 text-[11px] text-text-secondary font-mono">
            Formula: {String((violation.evidence as Record<string, unknown>)["formula"])}
          </div>
        )}
      </div>

      {/* Recommended action */}
      <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
        <p className="text-[11px] text-warning uppercase tracking-wide font-semibold mb-1.5">
          Recommended Action
        </p>
        <p className="text-xs text-text-primary leading-relaxed">{violation.recommended_action}</p>
      </div>

      {/* Cross-check: other violations on same activity */}
      {crossChecks.length > 0 && (
        <div>
          <p className="text-[11px] text-text-secondary uppercase tracking-wide font-semibold mb-1.5">
            Also flagged by {crossChecks.length} other check{crossChecks.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {crossChecks.map((x) => (
              <span
                key={x.check_code}
                className={`text-[11px] px-2 py-0.5 rounded border ${SEV_COLORS[x.severity] ?? SEV_COLORS.Low}`}
              >
                {x.check_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Drill-down export menu ───────────────────────────────────────────────────

function DrillDownExportMenu({ projectId }: { projectId: string }) {
  const [open,     setOpen]     = useState(false);
  const [xlState,  setXlState]  = useState<"idle"|"loading"|"error">("idle");
  const [pdfState, setPdfState] = useState<"idle"|"loading"|"error">("idle");

  async function download(endpoint: string, filename: string, setter: (s: "idle"|"loading"|"error") => void) {
    setter("loading");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href, download: filename }).click();
      URL.revokeObjectURL(href);
      setter("idle");
    } catch {
      setter("error");
      setTimeout(() => setter("idle"), 3000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface border border-border rounded-lg hover:border-primary hover:text-primary transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> Report
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-border bg-card shadow-lg overflow-hidden text-xs">
            <button
              onClick={() => { setOpen(false); download("/api/reports/excel", `${projectId}_NEXUS.xlsx`, setXlState); }}
              disabled={xlState === "loading"}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-text-primary hover:bg-surface transition-colors disabled:opacity-60"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-success shrink-0" />
              <span className="flex-1 text-left">Excel Workbook</span>
              {xlState === "loading" && <RefreshCw className="w-3 h-3 animate-spin text-text-secondary" />}
              {xlState === "error"   && <AlertTriangle className="w-3 h-3 text-danger" />}
            </button>
            <div className="border-t border-border/50" />
            <button
              onClick={() => { setOpen(false); download("/api/reports/pdf", `${projectId}_NEXUS.pdf`, setPdfState); }}
              disabled={pdfState === "loading"}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-text-primary hover:bg-surface transition-colors disabled:opacity-60"
            >
              <FileText className="w-3.5 h-3.5 text-danger shrink-0" />
              <span className="flex-1 text-left">PDF Report</span>
              {pdfState === "loading" && <RefreshCw className="w-3 h-3 animate-spin text-text-secondary" />}
              {pdfState === "error"   && <AlertTriangle className="w-3 h-3 text-danger" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DrillDownPage() {
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const project      = PROJECTS.find((p) => p.id === params.id);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [data,    setData]    = useState<DrillDownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drill-down?project_id=${params.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  // ── Filter state — initialize from URL params ───────────────────────────────
  const [filterCheck,  setFilterCheck]  = useState(searchParams.get("check")    ?? "");
  const [filterSev,    setFilterSev]    = useState(searchParams.get("severity") ?? "");
  const [filterWBS,    setFilterWBS]    = useState(searchParams.get("wbs")      ?? "");
  const [filterOwner,  setFilterOwner]  = useState(searchParams.get("owner")    ?? "");
  const [rawSearch,    setRawSearch]    = useState(searchParams.get("search")   ?? "");
  const searchText = useDebounce(rawSearch, 180);

  // ── Sort state ──────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState("risk_contribution_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      else             setSortDir("desc");
      return key;
    });
    setPage(1);
  }, []);

  // ── Pagination ──────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);

  // ── Expansion ───────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // ── View mode ───────────────────────────────────────────────────────────────
  const [groupByWBS, setGroupByWBS] = useState(false);

  // ── Filtered + sorted list (client-side, no refetch) ───────────────────────
  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.violations;

    if (filterCheck)  list = list.filter((v) => v.check_code === filterCheck);
    if (filterSev)    list = list.filter((v) => v.severity === filterSev);
    if (filterWBS)    list = list.filter((v) => v.wbs_code.split(".")[0] === filterWBS);
    if (filterOwner)  list = list.filter(
      (v) => (v.evidence as Record<string, unknown>)["responsible_party"] === filterOwner,
    );
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q)         ||
          v.external_id.toLowerCase().includes(q)  ||
          v.wbs_code.toLowerCase().includes(q)     ||
          v.issue_type.toLowerCase().includes(q)   ||
          v.check_name.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey] ?? 0;
      const bv = (b as Record<string, unknown>)[sortKey] ?? 0;
      const mul = sortDir === "desc" ? -1 : 1;
      if (typeof av === "number" && typeof bv === "number") return mul * (av - bv);
      return mul * String(av).localeCompare(String(bv));
    });
  }, [data, filterCheck, filterSev, filterWBS, filterOwner, searchText, sortKey, sortDir]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterCheck, filterSev, filterWBS, filterOwner, searchText]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  // ── WBS-grouped view ────────────────────────────────────────────────────────
  const groupedByWBS = useMemo(() => {
    const groups = new Map<string, DCMAViolationRecord[]>();
    for (const v of filtered) {
      const prefix = v.wbs_code.split(".")[0] || "0";
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(v);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  }, []);

  // ── Active filter count ─────────────────────────────────────────────────────
  const activeFilters = [filterCheck, filterSev, filterWBS, filterOwner, searchText].filter(Boolean);
  const clearFilters  = () => {
    setFilterCheck(""); setFilterSev(""); setFilterWBS("");
    setFilterOwner(""); setRawSearch("");
  };

  // ── CSV export ──────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!filtered.length) return;
    const headers = ["Rank","External ID","Name","Check","Issue Type","Severity","WBS","Impact Days","Risk %","Owner","Description"];
    const rows = filtered.map((v) => [
      v.risk_rank,
      v.external_id,
      `"${v.name.replace(/"/g, '""')}"`,
      v.check_code,
      v.issue_type,
      v.severity,
      v.wbs_code,
      v.schedule_impact_days,
      v.risk_contribution_pct.toFixed(2),
      (v.evidence as Record<string, unknown>)["responsible_party"] ?? "",
      `"${v.description.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `dcma-violations-${params.id}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [filtered, params.id]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!project) return (
    <div className="p-8 text-text-secondary text-sm">Project not found.</div>
  );

  const checkCtx = filterCheck && data?.facets.checks.find((c) => c.check_code === filterCheck);

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
        <Link href="/"                                    className="hover:text-text-primary">Portfolio</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/projects"                            className="hover:text-text-primary">Projects</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/projects/${project.id}`}            className="hover:text-text-primary">{project.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/projects/${project.id}/analysis`}  className="hover:text-text-primary">Analysis</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-text-primary">Violation Drill-Down</span>
      </div>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Schedule Quality Violations</h1>
          <p className="text-sm text-text-secondary mt-0.5">{project.name} · DCMA 14-Point Assessment</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface border border-border rounded-lg hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <DrillDownExportMenu projectId={params.id} />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface border border-border rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Check context banner ──────────────────────────────────────────── */}
      {checkCtx && (
        <div className={`rounded-xl border p-4 text-sm ${
          checkCtx.status === "Fail"    ? "border-danger/30 bg-danger/5"   :
          checkCtx.status === "Warning" ? "border-warning/30 bg-warning/5" :
          "border-border bg-card"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              checkCtx.status === "Fail" ? "bg-danger/10" : "bg-warning/10"
            }`}>
              <AlertTriangle className={`w-4 h-4 ${checkCtx.status === "Fail" ? "text-danger" : "text-warning"}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-text-primary">{checkCtx.check_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[checkCtx.status] ?? ""}`}>
                  {checkCtx.status}
                </span>
                <span className="text-xs text-text-secondary">
                  Pass rate: {checkCtx.pass_rate_pct.toFixed(1)}% ·
                  Risk contribution: {checkCtx.subtotal_risk_pct.toFixed(1)}% ·
                  {checkCtx.subtotal_schedule_impact_days}d schedule impact
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">{checkCtx.check_description}</p>
            </div>
            <button onClick={() => setFilterCheck("")} className="shrink-0 text-text-secondary hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {[
            { label: "DCMA Score",     value: `${data.summary.score}/100`,
              accent: data.summary.score >= 75 ? "text-success" : data.summary.score >= 50 ? "text-warning" : "text-danger" },
            { label: "Total Violations", value: data.total_count.toLocaleString(),
              accent: data.total_count === 0 ? "text-success" : "text-danger" },
            { label: "Showing",        value: filtered.length.toLocaleString(), accent: "text-text-primary" },
            { label: "Schedule Risk",  value: `${data.summary.total_schedule_impact_days}d`, accent: "text-warning" },
            { label: "CPLI",           value: data.summary.cpli.toFixed(3),
              accent: data.summary.cpli >= 0.95 ? "text-success" : data.summary.cpli >= 0.85 ? "text-warning" : "text-danger" },
            { label: "BEI",            value: (data.summary.bei * 100).toFixed(1) + "%",
              accent: data.summary.bei >= 0.95 ? "text-success" : data.summary.bei >= 0.85 ? "text-warning" : "text-danger" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${accent}`}>{value}</div>
              <div className="text-[11px] text-text-secondary mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
            <input
              type="text"
              placeholder="Search activity name, ID, WBS, check…"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
            />
            {rawSearch && (
              <button onClick={() => setRawSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Check filter */}
          <select
            value={filterCheck}
            onChange={(e) => setFilterCheck(e.target.value)}
            className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="">All Checks</option>
            {(data?.facets.checks ?? []).map((c) => (
              <option key={c.check_code} value={c.check_code}>
                {c.check_name} ({c.violation_count})
              </option>
            ))}
          </select>

          {/* Severity filter */}
          <select
            value={filterSev}
            onChange={(e) => setFilterSev(e.target.value)}
            className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="">All Severities</option>
            {(data?.facets.severities ?? []).map((s) => (
              <option key={s.severity} value={s.severity}>
                {s.severity} ({s.count})
              </option>
            ))}
          </select>

          {/* WBS filter */}
          <select
            value={filterWBS}
            onChange={(e) => setFilterWBS(e.target.value)}
            className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="">All WBS Areas</option>
            {(data?.facets.wbs_areas ?? []).map((w) => (
              <option key={w.wbs_prefix} value={w.wbs_prefix}>
                WBS {w.wbs_prefix} ({w.violation_count} · {w.risk_contribution_pct.toFixed(1)}% risk)
              </option>
            ))}
          </select>

          {/* Owner filter */}
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="">All Owners</option>
            {(data?.facets.responsible_parties ?? []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {activeFilters.length > 0 && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors">
              <X className="w-3 h-3" /> Clear ({activeFilters.length})
            </button>
          )}
        </div>

        {/* View toggles + result count */}
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            {filtered.length.toLocaleString()} violation{filtered.length !== 1 ? "s" : ""}
            {activeFilters.length > 0 ? ` (filtered from ${data?.total_count ?? 0})` : ""}
            {filtered.length > 0 && ` · ${filtered.reduce((s, v) => s + v.schedule_impact_days, 0)}d total schedule impact`}
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupByWBS}
              onChange={(e) => setGroupByWBS(e.target.checked)}
              className="w-3 h-3 accent-primary"
            />
            Group by WBS
          </label>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-xl p-4 text-sm text-danger">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Loading skeleton ──────────────────────────────────────────────── */}
      {loading && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[52px] border-b border-border animate-pulse bg-surface/30" />
          ))}
        </div>
      )}

      {/* ── Main table view ───────────────────────────────────────────────── */}
      {!loading && data && !groupByWBS && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text-secondary bg-surface/50">
                <th className="text-left px-3 py-2.5 w-10 font-medium">
                  <SortHeader label="#" sortKey="risk_rank" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-left px-3 py-2.5 font-medium">
                  <SortHeader label="Activity" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">
                  <SortHeader label="Check" sortKey="check_code" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-left px-3 py-2.5 font-medium">
                  <SortHeader label="Severity" sortKey="severity" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">
                  <SortHeader label="WBS" sortKey="wbs_code" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">
                  <SortHeader label="Impact" sortKey="schedule_impact_days" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-right px-3 py-2.5 font-medium">
                  <SortHeader label="Risk %" sortKey="risk_contribution_pct" current={sortKey} dir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Owner</th>
                <th className="w-8 px-2" />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-text-secondary text-sm">
                    No violations match the current filters.
                  </td>
                </tr>
              )}
              {paginated.map((v) => {
                const key  = rowKey(v);
                const open = expanded.has(key);
                const owner = (v.evidence as Record<string, unknown>)["responsible_party"] as string | null;

                return (
                  <>
                    <tr
                      key={key}
                      onClick={() => toggleExpand(key)}
                      className={`border-b border-border/60 cursor-pointer transition-colors ${
                        open ? "bg-canvas" : "hover:bg-surface/40"
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-3 py-3 tabular-nums text-text-secondary font-mono">
                        {v.risk_rank}
                      </td>

                      {/* Activity */}
                      <td className="px-3 py-3 max-w-[220px]">
                        <div className="font-semibold text-text-primary truncate">{v.name}</div>
                        <div className="text-[11px] text-text-secondary font-mono mt-0.5">{v.external_id}</div>
                      </td>

                      {/* Check */}
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <div className="text-text-primary">{v.check_name}</div>
                        <div className="text-[10px] text-text-secondary mt-0.5">{v.issue_type}</div>
                      </td>

                      {/* Severity */}
                      <td className="px-3 py-3">
                        <SeverityBadge severity={v.severity} />
                      </td>

                      {/* WBS */}
                      <td className="px-3 py-3 hidden md:table-cell font-mono text-text-secondary">
                        {v.wbs_code}
                      </td>

                      {/* Impact */}
                      <td className="px-3 py-3 text-right hidden md:table-cell tabular-nums">
                        {v.schedule_impact_days > 0
                          ? <span className="text-warning font-medium">{v.schedule_impact_days}d</span>
                          : <span className="text-text-secondary">—</span>}
                      </td>

                      {/* Risk % — bar + number */}
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full rounded-full bg-danger"
                              style={{ width: `${Math.min(100, v.risk_contribution_pct * 5)}%` }}
                            />
                          </div>
                          <span className="tabular-nums font-semibold text-danger">
                            {v.risk_contribution_pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="px-3 py-3 hidden lg:table-cell max-w-[120px]">
                        {owner
                          ? <span className="truncate block text-text-secondary">{owner}</span>
                          : <span className="text-danger/70 text-[10px]">Unassigned</span>}
                      </td>

                      {/* Expand toggle */}
                      <td className="px-2 py-3">
                        <span className="text-text-secondary">
                          {open
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </td>
                    </tr>

                    {/* Expanded row detail */}
                    {open && (
                      <tr key={key + "_exp"} className="border-b border-border">
                        <td colSpan={9} className="p-0">
                          <ExpandedRow violation={v} allViolations={data.violations} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-text-secondary">
              <span>
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
                {Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded border border-border hover:border-primary disabled:opacity-30"
                >
                  ←
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) p = i + 1;
                  else if (i === 0) p = 1;
                  else if (i === 6) p = totalPages;
                  else p = Math.max(2, Math.min(totalPages - 1, page - 2 + i));
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded border text-xs ${
                        p === page
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-border hover:border-primary disabled:opacity-30"
                >
                  →
                </button>
              </div>
              <span>Page {page} of {totalPages}</span>
            </div>
          )}
        </div>
      )}

      {/* ── WBS-grouped view ──────────────────────────────────────────────── */}
      {!loading && data && groupByWBS && (
        <div className="space-y-3">
          {groupedByWBS.length === 0 && (
            <div className="rounded-xl border border-border bg-card py-12 text-center text-text-secondary text-sm">
              No violations match the current filters.
            </div>
          )}
          {groupedByWBS.map(([prefix, violations]) => {
            const totalRisk   = violations.reduce((s, v) => s + v.risk_contribution_pct, 0);
            const totalImpact = violations.reduce((s, v) => s + v.schedule_impact_days, 0);
            const critCount   = violations.filter((v) => v.severity === "Critical").length;
            const open        = expandedGroups.has(prefix);

            return (
              <div key={prefix} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(prefix)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                      critCount > 0 ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                    }`}>
                      {prefix}
                    </span>
                    <div className="text-left">
                      <span className="text-sm font-semibold text-text-primary">WBS {prefix}</span>
                      <span className="text-xs text-text-secondary ml-2">
                        {violations.length} violation{violations.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {critCount > 0 && (
                      <span className="text-danger font-semibold">{critCount} Critical</span>
                    )}
                    <span className="text-warning">{totalImpact}d at risk</span>
                    <span className="text-danger font-bold">{totalRisk.toFixed(1)}% risk</span>
                    {open ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
                  </div>
                </button>

                {/* Group rows */}
                {open && (
                  <table className="w-full text-xs border-t border-border">
                    <tbody>
                      {violations.map((v) => {
                        const key  = rowKey(v);
                        const isOpen = expanded.has(key);
                        const owner = (v.evidence as Record<string, unknown>)["responsible_party"] as string | null;
                        return (
                          <>
                            <tr
                              key={key}
                              onClick={() => toggleExpand(key)}
                              className={`border-b border-border/50 cursor-pointer transition-colors ${isOpen ? "bg-canvas" : "hover:bg-surface/40"}`}
                            >
                              <td className="px-4 py-2.5 w-8 text-text-secondary tabular-nums">{v.risk_rank}</td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-text-primary">{v.name}</div>
                                <div className="text-[10px] font-mono text-text-secondary">{v.external_id} · WBS {v.wbs_code}</div>
                              </td>
                              <td className="px-3 py-2.5 hidden sm:table-cell text-text-secondary">{v.check_name}</td>
                              <td className="px-3 py-2.5"><SeverityBadge severity={v.severity} /></td>
                              <td className="px-3 py-2.5 text-right hidden md:table-cell">
                                {v.schedule_impact_days > 0 && <span className="text-warning">{v.schedule_impact_days}d</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-danger font-semibold">{v.risk_contribution_pct.toFixed(1)}%</span>
                              </td>
                              <td className="px-3 py-2.5 hidden lg:table-cell text-text-secondary text-[11px]">{owner ?? "—"}</td>
                              <td className="px-2 py-2.5">
                                {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr key={key + "_exp"} className="border-b border-border">
                                <td colSpan={8} className="p-0">
                                  <ExpandedRow violation={v} allViolations={data.violations} />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Explainability footer ─────────────────────────────────────────── */}
      {data && (
        <div className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3 text-xs text-text-secondary">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <div className="space-y-1">
            <p>
              <strong className="text-text-primary">Risk contribution formula:</strong>{" "}
              Each violation's risk % = (issue impact score / Σ all issue impact scores) × 100.
              Impact scores are 0–1 per issue, set by the DCMA engine based on severity and magnitude.
            </p>
            <p>
              Computed by DCMA Engine v{" "}
              <span className="font-mono">2.0.0</span> in {data.duration_ms}ms at {new Date(data.computed_at).toLocaleString()}.
              {" "}
              {data.summary.task_count.toLocaleString()} task activities analysed across 14 checks.
              {" "}
              {data.summary.violations_with_owner.toLocaleString()} of {data.total_count.toLocaleString()} violations have an identified owner.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
