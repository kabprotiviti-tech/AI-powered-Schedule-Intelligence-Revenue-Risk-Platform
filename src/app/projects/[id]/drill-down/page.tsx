// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
"use client";

/**
 * Activity-Level Drill-Down — Enterprise Data Table
 *
 * Architecture:
 *  - Single fetch from /api/drill-down (DCMA + CPM, 5-min cache)
 *  - All filter/sort/group runs client-side via useMemo (no re-fetch)
 *  - Critical path: sets derived from API critical_path_ids / negative_float_ids
 *  - Status column: On CP → Neg Float → Near Crit → Open (CPM-derived)
 *  - Left row accent encodes severity; CP activities get a teal ring
 *  - Pagination at 100 rows; sticky table header for long lists
 *  - Download at every level: page header, WBS group headers, footer
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, ChevronUp, Search, X, Filter,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Download,
  ArrowUpDown, ArrowUp, ArrowDown, Layers, Info,
  FileSpreadsheet, FileText, SlidersHorizontal, LayoutList,
  Activity, Minus,
} from "lucide-react";
import { PROJECTS } from "@/lib/data/mock";
import type { DCMAViolationRecord } from "@/lib/engines/dcma/index";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FacetCheck {
  check_code: string; check_name: string; check_description: string;
  violation_count: number; status: string; severity_weight: number;
  pass_rate_pct: number; subtotal_risk_pct: number;
}
interface FacetSeverity { severity: string; count: number; }
interface FacetWBS {
  wbs_prefix: string; violation_count: number;
  risk_contribution_pct: number; severity_counts: Record<string, number>;
}

interface DrillDownResponse {
  project_id: string; project_name: string;
  execution_id: string; computed_at: string; duration_ms: number;
  total_count: number; filtered_count: number;
  violations: DCMAViolationRecord[];
  // CPM enrichment
  critical_path_ids:  string[];
  negative_float_ids: string[];
  near_critical_ids:  string[];
  float_map:          Record<string, number>;
  cpm_summary: {
    critical_path_length: number; negative_float_count: number;
    near_critical_count: number; finish_variance_days: number; cpli: number;
  };
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
  activity_cross_check: Array<{
    check_code: string; check_name: string; issue_type: string; severity: string;
  }> | null;
}

type Density = "compact" | "comfortable";
type ViewMode = "flat" | "wbs";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

const SEV_BADGE: Record<string, string> = {
  Critical: "bg-danger/15 text-danger border-danger/30",
  High:     "bg-warning/15 text-warning border-warning/30",
  Medium:   "bg-blue-500/10 text-blue-400 border-blue-500/25",
  Low:      "bg-surface text-text-secondary border-border",
};
const SEV_DOT: Record<string, string> = {
  Critical: "bg-danger", High: "bg-warning", Medium: "bg-blue-400", Low: "bg-muted",
};
// Left border accent — severity-coded
const SEV_BORDER: Record<string, string> = {
  Critical: "border-l-danger",
  High:     "border-l-warning",
  Medium:   "border-l-blue-400",
  Low:      "border-l-border",
};

// ─── Utility hooks ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 180): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowKey(v: DCMAViolationRecord) { return `${v.activity_id}__${v.check_code}`; }

function ev(v: DCMAViolationRecord, key: string): unknown {
  return (v.evidence as Record<string, unknown>)[key];
}
function evStr(v: DCMAViolationRecord, key: string): string {
  const val = ev(v, key);
  return typeof val === "string" ? val : "";
}

function fmtKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtVal(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

type ActivityStatus = "on-cp" | "neg-float" | "near-crit" | "overdue" | "open";

function getStatus(
  activityId: string,
  critSet:    Set<string>,
  negSet:     Set<string>,
  nearSet:    Set<string>,
  violation:  DCMAViolationRecord,
): ActivityStatus {
  if (critSet.has(activityId))                           return "on-cp";
  if (negSet.has(activityId))                            return "neg-float";
  if (nearSet.has(activityId))                           return "near-crit";
  if (violation.check_code === "BEI" || (ev(violation, "overdue_days") != null)) return "overdue";
  return "open";
}

const STATUS_META: Record<ActivityStatus, { label: string; cls: string; dot: string }> = {
  "on-cp":     { label: "On CP",      cls: "bg-orange-500/15 text-orange-400 border-orange-400/30",  dot: "bg-orange-400" },
  "neg-float": { label: "Neg Float",  cls: "bg-danger/15 text-danger border-danger/30",              dot: "bg-danger" },
  "near-crit": { label: "Near Crit",  cls: "bg-amber-500/15 text-amber-400 border-amber-400/30",     dot: "bg-amber-400" },
  "overdue":   { label: "Overdue",    cls: "bg-warning/15 text-warning border-warning/30",           dot: "bg-warning" },
  "open":      { label: "Open",       cls: "bg-surface text-text-secondary border-border",           dot: "bg-muted" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortHeader({
  label, sortKey: k, current, dir, onSort,
}: { label: string; sortKey: string; current: string; dir: "asc"|"desc"; onSort: (k: string) => void }) {
  const active = current === k;
  return (
    <button onClick={() => onSort(k)} className="flex items-center gap-1 group hover:text-text-primary transition-colors whitespace-nowrap">
      {label}
      <span className="text-text-secondary">
        {active
          ? dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
          : <ArrowUpDown className="w-3 h-3 opacity-35 group-hover:opacity-70" />}
      </span>
    </button>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${SEV_BADGE[severity] ?? SEV_BADGE.Low}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[severity] ?? "bg-muted"}`} />
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.dot}`} />
      {m.label}
    </span>
  );
}

function FilterPill({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[11px] font-medium">
      <span className="text-primary/60 mr-0.5">{label}:</span>
      {value}
      <button onClick={onRemove} className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 transition-colors">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

function RiskBar({ pct }: { pct: number }) {
  const w = Math.min(100, pct * 4);   // 25% pct → full bar
  const color = pct > 5 ? "bg-danger" : pct > 2 ? "bg-warning" : "bg-primary/60";
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-12 h-1.5 bg-surface rounded-full overflow-hidden hidden sm:block">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className={`tabular-nums font-semibold text-xs ${pct > 5 ? "text-danger" : pct > 2 ? "text-warning" : "text-text-primary"}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Evidence grid ────────────────────────────────────────────────────────────

function EvidenceGrid({ evidence }: { evidence: Record<string, unknown> }) {
  const SKIP = new Set(["formula", "violation_codes"]);
  const entries = Object.entries(evidence).filter(([k]) => !SKIP.has(k));
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-2 text-xs">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[10px] text-text-secondary uppercase tracking-wide mb-0.5">{fmtKey(k)}</dt>
          <dd className={`font-semibold ${
            typeof v === "number" && k.includes("float") && (v as number) < 0 ? "text-danger" :
            typeof v === "boolean" ? (v ? "text-danger" : "text-success") :
            "text-text-primary"
          }`}>{fmtVal(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({
  violation, allViolations, floatMap, status,
}: {
  violation: DCMAViolationRecord;
  allViolations: DCMAViolationRecord[];
  floatMap: Record<string, number>;
  status: ActivityStatus;
}) {
  const crossChecks = allViolations.filter(
    (v) => v.activity_id === violation.activity_id && v.check_code !== violation.check_code,
  );
  const totalFloat = floatMap[violation.activity_id];
  const sm = STATUS_META[status];

  return (
    <div className="bg-canvas border-t border-border/60">
      {/* Status ribbon */}
      <div className={`px-5 py-2 flex items-center gap-3 text-[11px] font-semibold border-b border-border/30 ${sm.cls}`}>
        <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
        <span className="uppercase tracking-wider">{sm.label}</span>
        {totalFloat != null && (
          <span className="font-normal opacity-80">
            Total Float: <strong>{totalFloat}d</strong>
          </span>
        )}
        <span className="ml-auto font-normal opacity-70">
          Risk Rank #{violation.risk_rank} · {violation.risk_contribution_pct.toFixed(2)}% of total schedule risk
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Metadata strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: "Activity ID",     value: violation.external_id,              mono: true  },
            { label: "WBS Code",        value: violation.wbs_code,                 mono: true  },
            { label: "Issue Code",      value: violation.issue_code,               mono: true  },
            { label: "Check",           value: violation.check_name,               mono: false },
            { label: "Impact (days)",   value: `${violation.schedule_impact_days}d`, mono: false },
            { label: "Responsible",     value: evStr(violation, "responsible_party") || "Unassigned", mono: false },
            { label: "Baseline Start",  value: evStr(violation, "baseline_start")  || "—",      mono: true  },
            { label: "Baseline Finish", value: evStr(violation, "baseline_finish") || "—",      mono: true  },
          ].map(({ label, value, mono }) => (
            <div key={label} className="bg-surface rounded-lg px-3 py-2">
              <div className="text-[10px] text-text-secondary uppercase tracking-wide">{label}</div>
              <div className={`font-semibold text-xs mt-0.5 text-text-primary ${mono ? "font-mono" : ""}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Two-column: description + evidence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Violation Detail</p>
            <p className="text-xs text-text-primary leading-relaxed">{violation.description}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Raw Schedule Evidence</p>
            <EvidenceGrid evidence={violation.evidence} />
            {Boolean((violation.evidence as Record<string, unknown>)["formula"]) && (
              <p className="text-[11px] text-text-secondary font-mono mt-1">
                Formula: {String((violation.evidence as Record<string, unknown>)["formula"])}
              </p>
            )}
          </div>
        </div>

        {/* Recommended action */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
                Recommended Action
              </p>
              <p className="text-xs text-text-primary leading-relaxed">{violation.recommended_action}</p>
            </div>
          </div>
        </div>

        {/* Cross-checks */}
        {crossChecks.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
              Also flagged by {crossChecks.length} other check{crossChecks.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {crossChecks.map((x) => (
                <span key={x.check_code} className={`text-[11px] px-2 py-0.5 rounded border font-medium ${SEV_BADGE[x.severity] ?? SEV_BADGE.Low}`}>
                  {x.check_name} · {x.severity}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export menu (shared) ─────────────────────────────────────────────────────

function ExportMenu({ projectId, label = "Download Report", size = "sm" }: {
  projectId: string; label?: string; size?: "xs" | "sm";
}) {
  const [open,     setOpen]     = useState(false);
  const [xlState,  setXlState]  = useState<"idle"|"loading"|"error">("idle");
  const [pdfState, setPdfState] = useState<"idle"|"loading"|"error">("idle");
  const [csvDone,  setCsvDone]  = useState(false);

  async function dl(endpoint: string, filename: string, setter: (s: "idle"|"loading"|"error") => void) {
    setter("loading");
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href, download: filename }).click();
      URL.revokeObjectURL(href);
      setter("idle");
    } catch { setter("error"); setTimeout(() => setter("idle"), 3000); }
  }

  const sizeBtn = size === "xs"
    ? "px-2.5 py-1.5 text-[11px] gap-1"
    : "px-3 py-2 text-xs gap-1.5";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg transition-colors ${sizeBtn}`}
      >
        <Download className={size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"} />
        {label}
        <ChevronRight className={`transition-transform ${open ? "rotate-90" : ""} ${size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-30 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-surface/50">
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Export format</p>
            </div>
            {[
              { icon: <FileSpreadsheet className="w-4 h-4 text-success" />, label: "Excel Workbook", sub: "6 sheets · all engine data", state: xlState, action: () => dl("/api/reports/excel", `${projectId}_NEXUS.xlsx`, setXlState) },
              { icon: <FileText       className="w-4 h-4 text-danger"  />, label: "PDF Report",     sub: "A4 · executive · consulting", state: pdfState, action: () => dl("/api/reports/pdf",   `${projectId}_NEXUS.pdf`,  setPdfState) },
            ].map(({ icon, label: lbl, sub, state, action }) => (
              <button key={lbl} onClick={() => { setOpen(false); action(); }} disabled={state === "loading"}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-primary hover:bg-surface transition-colors disabled:opacity-50">
                <span className="shrink-0">{icon}</span>
                <div className="text-left flex-1">
                  <div className="text-xs font-medium">{lbl}</div>
                  <div className="text-[10px] text-text-secondary">{sub}</div>
                </div>
                {state === "loading" && <RefreshCw className="w-3.5 h-3.5 animate-spin text-text-secondary" />}
                {state === "error"   && <AlertTriangle className="w-3.5 h-3.5 text-danger" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── WBS risk bar ─────────────────────────────────────────────────────────────

function WBSRiskBar({ severityCounts }: { severityCounts: Record<string, number> }) {
  const total = Object.values(severityCounts).reduce((s, n) => s + n, 0);
  if (!total) return null;
  const segs = [
    { key: "Critical", color: "bg-danger"  },
    { key: "High",     color: "bg-warning" },
    { key: "Medium",   color: "bg-blue-400" },
    { key: "Low",      color: "bg-surface" },
  ];
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-24 gap-px" title="Severity distribution">
      {segs.map(({ key, color }) => {
        const w = ((severityCounts[key] ?? 0) / total) * 100;
        return w > 0 ? <div key={key} className={`${color} h-full`} style={{ width: `${w}%` }} /> : null;
      })}
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
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/drill-down?project_id=${params.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  // ── Sets derived from CPM data ───────────────────────────────────────────
  const critSet  = useMemo(() => new Set(data?.critical_path_ids  ?? []), [data]);
  const negSet   = useMemo(() => new Set(data?.negative_float_ids ?? []), [data]);
  const nearSet  = useMemo(() => new Set(data?.near_critical_ids  ?? []), [data]);
  const floatMap = useMemo(() => data?.float_map ?? {}, [data]);

  // ── Filter state (init from URL) ─────────────────────────────────────────
  const [filterCheck,  setFilterCheck]  = useState(searchParams.get("check")    ?? "");
  const [filterSev,    setFilterSev]    = useState(searchParams.get("severity") ?? "");
  const [filterWBS,    setFilterWBS]    = useState(searchParams.get("wbs")      ?? "");
  const [filterOwner,  setFilterOwner]  = useState(searchParams.get("owner")    ?? "");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status")   ?? "");  // "on-cp" | "neg-float" | "near-crit" | "overdue"
  const [rawSearch,    setRawSearch]    = useState(searchParams.get("search")   ?? "");
  const searchText = useDebounce(rawSearch, 180);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState("risk_contribution_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      setSortDir(prev === key ? (d => d === "desc" ? "asc" : "desc") : () => "desc");
      return key;
    });
    setPage(1);
  }, []);

  // ── View settings ─────────────────────────────────────────────────────────
  const [density,   setDensity]   = useState<Density>("comfortable");
  const [viewMode,  setViewMode]  = useState<ViewMode>("flat");

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filterCheck, filterSev, filterWBS, filterOwner, filterStatus, searchText]);

  // ── Expansion ─────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((key: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }), []);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((pfx: string) =>
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(pfx) ? n.delete(pfx) : n.add(pfx); return n; }), []);

  // ── Filtered + sorted (client-side, no refetch) ───────────────────────────
  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.violations;

    if (filterCheck)  list = list.filter((v) => v.check_code === filterCheck);
    if (filterSev)    list = list.filter((v) => v.severity === filterSev);
    if (filterWBS)    list = list.filter((v) => v.wbs_code.split(".")[0] === filterWBS);
    if (filterOwner)  list = list.filter((v) => evStr(v, "responsible_party") === filterOwner);
    if (filterStatus) {
      list = list.filter((v) => {
        const s = getStatus(v.activity_id, critSet, negSet, nearSet, v);
        return s === filterStatus;
      });
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (v) => v.name.toLowerCase().includes(q)         ||
               v.external_id.toLowerCase().includes(q)  ||
               v.wbs_code.toLowerCase().includes(q)     ||
               v.issue_type.toLowerCase().includes(q)   ||
               v.check_name.toLowerCase().includes(q)   ||
               evStr(v, "responsible_party").toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, unknown>)[sortKey] ?? 0;
      const m  = sortDir === "desc" ? -1 : 1;
      if (typeof av === "number" && typeof bv === "number") return m * (av - bv);
      return m * String(av).localeCompare(String(bv));
    });
  }, [data, filterCheck, filterSev, filterWBS, filterOwner, filterStatus, searchText, sortKey, sortDir, critSet, negSet, nearSet]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  // ── WBS-grouped ───────────────────────────────────────────────────────────
  const groupedByWBS = useMemo(() => {
    const groups = new Map<string, DCMAViolationRecord[]>();
    for (const v of filtered) {
      const pfx = v.wbs_code.split(".")[0] || "0";
      if (!groups.has(pfx)) groups.set(pfx, []);
      groups.get(pfx)!.push(v);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // ── Active filters ────────────────────────────────────────────────────────
  const activeFilters: Array<{ label: string; value: string; clear: () => void }> = [
    filterCheck  && { label: "Check",    value: data?.facets.checks.find((c) => c.check_code === filterCheck)?.check_name ?? filterCheck, clear: () => setFilterCheck("") },
    filterSev    && { label: "Severity", value: filterSev,    clear: () => setFilterSev("") },
    filterWBS    && { label: "WBS",      value: `WBS ${filterWBS}`, clear: () => setFilterWBS("") },
    filterOwner  && { label: "Owner",    value: filterOwner,  clear: () => setFilterOwner("") },
    filterStatus && { label: "Status",   value: STATUS_META[filterStatus as ActivityStatus]?.label ?? filterStatus, clear: () => setFilterStatus("") },
    searchText   && { label: "Search",   value: searchText,   clear: () => setRawSearch("") },
  ].filter(Boolean) as Array<{ label: string; value: string; clear: () => void }>;

  const clearAll = () => {
    setFilterCheck(""); setFilterSev(""); setFilterWBS("");
    setFilterOwner(""); setFilterStatus(""); setRawSearch("");
  };

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleCSV = useCallback((rows: DCMAViolationRecord[] = filtered) => {
    if (!rows.length) return;
    const headers = ["Rank","Activity ID","Name","WBS","Check","Issue Type","Severity","Status","Impact (d)","Risk %","Total Float","Owner","Description"];
    const body = rows.map((v) => [
      v.risk_rank, v.external_id,
      `"${v.name.replace(/"/g, '""')}"`,
      v.wbs_code, v.check_code, v.issue_type, v.severity,
      STATUS_META[getStatus(v.activity_id, critSet, negSet, nearSet, v)].label,
      v.schedule_impact_days, v.risk_contribution_pct.toFixed(2),
      floatMap[v.activity_id] ?? "",
      evStr(v, "responsible_party"),
      `"${v.description.replace(/"/g, '""')}"`,
    ]);
    const csv  = [headers, ...body].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href, download: `dcma_${params.id}.csv` }).click();
    URL.revokeObjectURL(href);
  }, [filtered, critSet, negSet, nearSet, floatMap, params.id]);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!project) return <div className="p-8 text-text-secondary text-sm">Project not found.</div>;

  const checkCtx = filterCheck && data?.facets.checks.find((c) => c.check_code === filterCheck);
  const rowPad   = density === "compact" ? "py-2" : "py-3";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1440px] mx-auto space-y-4">

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-[11px] text-text-secondary flex-wrap">
        {[
          { href: "/",                                   label: "Portfolio" },
          { href: "/projects",                           label: "Projects" },
          { href: `/projects/${project.id}`,             label: project.name },
          { href: `/projects/${project.id}/analysis`,   label: "Analysis" },
        ].map(({ href, label }) => (
          <span key={href} className="flex items-center gap-1.5">
            <Link href={href} className="hover:text-text-primary transition-colors">{label}</Link>
            <ChevronRight className="w-3 h-3" />
          </span>
        ))}
        <span className="text-text-primary font-medium">Violation Drill-Down</span>
      </nav>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Schedule Quality Violations
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {project.name} · DCMA 14-Point Assessment
            {data && ` · ${data.summary.task_count.toLocaleString()} activities analysed`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleCSV()}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface border border-border rounded-lg hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          {data && <ExportMenu projectId={params.id} label="Download Report" />}
          <button
            onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-surface border border-border rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Summary KPIs ───────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {[
            { label: "DCMA Score",     value: `${data.summary.score}/100`,
              accent: data.summary.score >= 75 ? "text-success" : data.summary.score >= 50 ? "text-warning" : "text-danger",
              sub: data.summary.score >= 75 ? "Good" : data.summary.score >= 50 ? "Warning" : "Poor" },
            { label: "Total Violations", value: data.total_count.toLocaleString(),
              accent: data.total_count === 0 ? "text-success" : "text-danger",
              sub: `${data.summary.violations_by_severity.Critical ?? 0} Critical` },
            { label: "Showing",        value: filtered.length.toLocaleString(),
              accent: "text-text-primary", sub: activeFilters.length > 0 ? "filtered" : "all" },
            { label: "Sched. at Risk", value: `${data.summary.total_schedule_impact_days}d`,
              accent: "text-warning", sub: "total exposure" },
            { label: "Critical Path",  value: data.cpm_summary.critical_path_length.toLocaleString(),
              accent: "text-orange-400", sub: `${data.cpm_summary.negative_float_count} neg float` },
            { label: "CPLI",           value: data.summary.cpli.toFixed(3),
              accent: data.summary.cpli >= 0.95 ? "text-success" : "text-danger",
              sub: data.summary.cpli >= 0.95 ? "Healthy" : "Below threshold" },
          ].map(({ label, value, accent, sub }) => (
            <div key={label} className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <div className={`text-lg font-bold tabular-nums ${accent}`}>{value}</div>
              <div className="text-[10px] text-text-secondary mt-0.5 font-medium">{label}</div>
              {sub && <div className="text-[10px] text-text-secondary/70 mt-0.5">{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Check context banner ───────────────────────────────────────────── */}
      {checkCtx && (
        <div className={`rounded-xl border p-4 ${
          checkCtx.status === "Fail"    ? "border-danger/30 bg-danger/5"   :
          checkCtx.status === "Warning" ? "border-warning/30 bg-warning/5" : "border-border bg-card"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${checkCtx.status === "Fail" ? "bg-danger/10" : "bg-warning/10"}`}>
              <AlertTriangle className={`w-4 h-4 ${checkCtx.status === "Fail" ? "text-danger" : "text-warning"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-text-primary">{checkCtx.check_name}</span>
                <span className={`text-xs font-bold ${checkCtx.status === "Fail" ? "text-danger" : checkCtx.status === "Warning" ? "text-warning" : "text-success"}`}>
                  {checkCtx.status}
                </span>
                <span className="text-xs text-text-secondary">
                  {checkCtx.pass_rate_pct.toFixed(1)}% pass rate ·
                  {checkCtx.subtotal_risk_pct.toFixed(1)}% of schedule risk ·
                  {checkCtx.subtotal_schedule_impact_days}d exposure
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">{checkCtx.check_description}</p>
            </div>
            <button onClick={() => setFilterCheck("")} className="shrink-0 text-text-secondary hover:text-text-primary p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Toolbar: search + dropdowns + quick filters ─────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
            <input
              type="text"
              placeholder="Search activity, ID, WBS, check…"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 bg-surface border border-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary transition-colors"
            />
            {rawSearch && (
              <button onClick={() => setRawSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dropdowns */}
          {[
            { value: filterCheck,  setter: setFilterCheck,  placeholder: "All Checks",
              options: (data?.facets.checks ?? []).map((c) => ({ value: c.check_code, label: `${c.check_name} (${c.violation_count})` })) },
            { value: filterSev,    setter: setFilterSev,    placeholder: "All Severities",
              options: (data?.facets.severities ?? []).map((s) => ({ value: s.severity, label: `${s.severity} (${s.count})` })) },
            { value: filterWBS,    setter: setFilterWBS,    placeholder: "All WBS Areas",
              options: (data?.facets.wbs_areas ?? []).map((w) => ({ value: w.wbs_prefix, label: `WBS ${w.wbs_prefix} (${w.violation_count})` })) },
            { value: filterOwner,  setter: setFilterOwner,  placeholder: "All Owners",
              options: (data?.facets.responsible_parties ?? []).map((p) => ({ value: p, label: p })) },
          ].map(({ value, setter, placeholder, options }) => (
            <select
              key={placeholder}
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="px-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">{placeholder}</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}

          {activeFilters.length > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1 px-2.5 py-2 text-xs text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors">
              <X className="w-3 h-3" /> Clear ({activeFilters.length})
            </button>
          )}
        </div>

        {/* Quick-filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-text-secondary font-medium shrink-0">Quick:</span>
          {[
            { label: "Critical Only",     action: () => { setFilterSev("Critical"); setFilterStatus(""); } },
            { label: "On Critical Path",  action: () => { setFilterStatus("on-cp"); setFilterSev(""); } },
            { label: "Negative Float",    action: () => { setFilterStatus("neg-float"); setFilterSev(""); } },
            { label: "No Owner",          action: () => { setFilterOwner("Unallocated"); } },
            { label: "Logic Issues",      action: () => { setFilterCheck("LOGIC"); } },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="px-2.5 py-1 rounded-full border border-border text-[11px] text-text-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Active filter pills */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-text-secondary font-medium shrink-0">Active:</span>
            {activeFilters.map((f) => (
              <FilterPill key={f.label + f.value} label={f.label} value={f.value} onRemove={f.clear} />
            ))}
          </div>
        )}

        {/* Footer: result count + view controls */}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/50">
          <p className="text-[11px] text-text-secondary">
            <strong className="text-text-primary">{filtered.length.toLocaleString()}</strong> violation{filtered.length !== 1 ? "s" : ""}
            {activeFilters.length > 0 && ` of ${data?.total_count.toLocaleString() ?? 0}`}
            {filtered.length > 0 && (
              <> · <strong className="text-warning">{filtered.reduce((s, v) => s + v.schedule_impact_days, 0).toLocaleString()}d</strong> schedule exposure</>
            )}
          </p>
          <div className="flex items-center gap-3">
            {/* Density */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
              {(["compact", "comfortable"] as Density[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${density === d ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
                >
                  {d === "compact" ? "Compact" : "Comfortable"}
                </button>
              ))}
            </div>
            {/* View mode */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
              <button onClick={() => setViewMode("flat")} title="Flat list"
                className={`p-1.5 rounded transition-colors ${viewMode === "flat" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}>
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode("wbs")} title="Group by WBS"
                className={`p-1.5 rounded transition-colors ${viewMode === "wbs" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}>
                <Layers className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
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
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 h-14 border-b border-border animate-pulse">
              <div className="w-8 h-4 bg-surface rounded" />
              <div className="flex-1 h-4 bg-surface rounded" />
              <div className="w-20 h-4 bg-surface rounded" />
              <div className="w-16 h-4 bg-surface rounded" />
            </div>
          ))}
        </div>
      )}

      {/* ── Flat table view ───────────────────────────────────────────────── */}
      {!loading && data && viewMode === "flat" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b-2 border-border text-text-secondary bg-card">
                  {/* Left border spacer */}
                  <th className="w-1 p-0" />
                  <th className="text-left px-3 py-3 w-10 font-medium whitespace-nowrap">
                    <SortHeader label="#" sortKey="risk_rank" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium min-w-[200px]">
                    <SortHeader label="Activity" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden sm:table-cell">
                    <SortHeader label="WBS" sortKey="wbs_code" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    <SortHeader label="Issue Type" sortKey="issue_type" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium">
                    <SortHeader label="Severity" sortKey="severity" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden sm:table-cell">
                    <SortHeader label="Impact" sortKey="schedule_impact_days" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <SortHeader label="Risk %" sortKey="risk_contribution_pct" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">
                    <SortHeader label="Status" sortKey="activity_id" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Owner</th>
                  <th className="w-8 px-2" />
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-text-secondary text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Filter className="w-8 h-8 opacity-20" />
                        No violations match the active filters.
                      </div>
                    </td>
                  </tr>
                )}
                {paginated.map((v) => {
                  const key    = rowKey(v);
                  const open   = expanded.has(key);
                  const owner  = evStr(v, "responsible_party");
                  const status = getStatus(v.activity_id, critSet, negSet, nearSet, v);
                  const isCrit = critSet.has(v.activity_id);
                  const isNeg  = negSet.has(v.activity_id);

                  const accentBorder = SEV_BORDER[v.severity] ?? "border-l-border";
                  const rowBg = open
                    ? "bg-canvas"
                    : isCrit
                      ? "hover:bg-orange-500/5 bg-orange-500/[0.02]"
                      : "hover:bg-surface/50";

                  return (
                    <>
                      <tr
                        key={key}
                        onClick={() => toggleExpand(key)}
                        className={`border-b border-border/50 cursor-pointer transition-colors border-l-[3px] ${accentBorder} ${rowBg}`}
                      >
                        {/* Left border spacer */}
                        <td className="p-0 w-0" />

                        {/* Rank */}
                        <td className={`px-3 ${rowPad} tabular-nums text-text-secondary font-mono text-[11px]`}>
                          {v.risk_rank}
                        </td>

                        {/* Activity — name + ID + CP badge */}
                        <td className={`px-3 ${rowPad} max-w-[240px]`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-text-primary truncate leading-tight">{v.name}</span>
                            {isCrit && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[9px] font-bold tracking-wider shrink-0">
                                <Activity className="w-2.5 h-2.5" /> CP
                              </span>
                            )}
                            {isNeg && !isCrit && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-danger/15 text-danger text-[9px] font-bold tracking-wider shrink-0">
                                <Minus className="w-2.5 h-2.5" /> NF
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-text-secondary font-mono mt-0.5">{v.external_id}</div>
                        </td>

                        {/* WBS */}
                        <td className={`px-3 ${rowPad} hidden sm:table-cell font-mono text-text-secondary text-[11px]`}>
                          {v.wbs_code}
                        </td>

                        {/* Issue Type */}
                        <td className={`px-3 ${rowPad} hidden md:table-cell`}>
                          <div className="text-text-primary leading-tight">{v.check_name}</div>
                          <div className="text-[10px] text-text-secondary mt-0.5">{v.issue_type}</div>
                        </td>

                        {/* Severity */}
                        <td className={`px-3 ${rowPad}`}>
                          <SeverityBadge severity={v.severity} />
                        </td>

                        {/* Impact */}
                        <td className={`px-3 ${rowPad} text-right tabular-nums hidden sm:table-cell`}>
                          {v.schedule_impact_days > 0
                            ? <span className={`font-semibold ${v.schedule_impact_days > 14 ? "text-danger" : "text-warning"}`}>{v.schedule_impact_days}d</span>
                            : <span className="text-text-secondary">—</span>}
                        </td>

                        {/* Risk % with inline bar */}
                        <td className={`px-3 ${rowPad}`}>
                          <RiskBar pct={v.risk_contribution_pct} />
                        </td>

                        {/* Status (CPM-derived) */}
                        <td className={`px-3 ${rowPad} hidden lg:table-cell`}>
                          <StatusBadge status={status} />
                        </td>

                        {/* Owner */}
                        <td className={`px-3 ${rowPad} hidden lg:table-cell`}>
                          {owner
                            ? <span className="text-text-secondary text-[11px] truncate block max-w-[110px]">{owner}</span>
                            : <span className="text-[10px] text-danger/60 italic">Unassigned</span>}
                        </td>

                        {/* Expand */}
                        <td className="px-2 py-2 text-center">
                          <span className="text-text-secondary">
                            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                        </td>
                      </tr>

                      {open && (
                        <tr key={key + "_exp"} className="border-b border-border border-l-[3px] border-l-primary/40">
                          <td colSpan={11} className="p-0">
                            <ExpandedRow
                              violation={v}
                              allViolations={data.violations}
                              floatMap={floatMap}
                              status={status}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ───────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-text-secondary">
              <span className="tabular-nums">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
                {Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)}  disabled={page === 1}
                  className="px-2 py-1 rounded border border-border hover:border-primary disabled:opacity-30 transition-colors">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-1 rounded border border-border hover:border-primary disabled:opacity-30 transition-colors">‹</button>

                {/* Smart page numbers with ellipsis */}
                {(() => {
                  const pages: (number | "…")[] = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (page > 3) pages.push("…");
                    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                    if (page < totalPages - 2) pages.push("…");
                    pages.push(totalPages);
                  }
                  return pages.map((p, i) =>
                    p === "…"
                      ? <span key={`e${i}`} className="w-7 text-center text-text-secondary">…</span>
                      : <button key={p} onClick={() => setPage(p)}
                          className={`w-7 h-7 rounded border text-xs transition-colors ${
                            p === page ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary"
                          }`}>{p}</button>
                  );
                })()}

                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-border hover:border-primary disabled:opacity-30 transition-colors">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-border hover:border-primary disabled:opacity-30 transition-colors">»</button>
              </div>
              <span>Page {page} / {totalPages}</span>
            </div>
          )}
        </div>
      )}

      {/* ── WBS-grouped view ──────────────────────────────────────────────── */}
      {!loading && data && viewMode === "wbs" && (
        <div className="space-y-2.5">
          {/* Group controls */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">
              {groupedByWBS.length} WBS area{groupedByWBS.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandedGroups(new Set(groupedByWBS.map(([k]) => k)))}
                className="text-xs text-primary hover:underline"
              >Expand all</button>
              <span className="text-text-secondary">·</span>
              <button
                onClick={() => setExpandedGroups(new Set())}
                className="text-xs text-text-secondary hover:underline"
              >Collapse all</button>
            </div>
          </div>

          {groupedByWBS.length === 0 && (
            <div className="rounded-xl border border-border bg-card py-14 text-center text-text-secondary text-sm">
              No violations match the current filters.
            </div>
          )}

          {groupedByWBS.map(([prefix, violations]) => {
            const totalRisk   = violations.reduce((s, v) => s + v.risk_contribution_pct, 0);
            const totalImpact = violations.reduce((s, v) => s + v.schedule_impact_days, 0);
            const critCount   = violations.filter((v) => v.severity === "Critical").length;
            const cpCount     = violations.filter((v) => critSet.has(v.activity_id)).length;
            const isOpen      = expandedGroups.has(prefix);

            // Get WBS severity counts for the mini bar
            const wbsFacet    = data.facets.wbs_areas.find((w) => w.wbs_prefix === prefix);
            const sevCounts   = wbsFacet?.severity_counts ?? {};

            return (
              <div key={prefix} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Group header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors ${isOpen ? "border-b border-border" : ""}`}
                  onClick={() => toggleGroup(prefix)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      critCount > 0 ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"
                    }`}>
                      {prefix}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">WBS {prefix}</span>
                        <span className="text-xs text-text-secondary">
                          {violations.length} violation{violations.length !== 1 ? "s" : ""}
                        </span>
                        {cpCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-semibold">
                            {cpCount} on CP
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <WBSRiskBar severityCounts={sevCounts} />
                        <span className="text-[10px] text-text-secondary">
                          {critCount > 0 && <span className="text-danger font-medium">{critCount} Crit · </span>}
                          {totalImpact}d exposure
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-danger tabular-nums">{totalRisk.toFixed(1)}%</span>
                    <span className="text-xs text-text-secondary">risk</span>
                    {/* Per-group download */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleCSV(violations)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary border border-border rounded hover:border-primary hover:text-primary transition-colors"
                        title="Export this WBS group as CSV"
                      >
                        <Download className="w-3 h-3" /> CSV
                      </button>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
                  </div>
                </div>

                {/* Group rows */}
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[700px]">
                      <thead>
                        <tr className="border-b border-border/50 text-text-secondary bg-surface/30">
                          <th className="w-1 p-0" />
                          <th className="text-left px-4 py-2 w-8 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Activity</th>
                          <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Issue Type</th>
                          <th className="text-left px-3 py-2 font-medium">Severity</th>
                          <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Status</th>
                          <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Impact</th>
                          <th className="text-right px-3 py-2 font-medium">Risk %</th>
                          <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Owner</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {violations.map((v) => {
                          const key    = rowKey(v);
                          const isOpen = expanded.has(key);
                          const owner  = evStr(v, "responsible_party");
                          const status = getStatus(v.activity_id, critSet, negSet, nearSet, v);
                          const isCrit = critSet.has(v.activity_id);

                          return (
                            <>
                              <tr
                                key={key}
                                onClick={() => toggleExpand(key)}
                                className={`border-b border-border/40 cursor-pointer transition-colors border-l-[3px] ${SEV_BORDER[v.severity] ?? "border-l-border"} ${
                                  isOpen ? "bg-canvas" : isCrit ? "hover:bg-orange-500/5 bg-orange-500/[0.02]" : "hover:bg-surface/30"
                                }`}
                              >
                                <td className="p-0 w-0" />
                                <td className={`px-4 ${rowPad} tabular-nums text-text-secondary font-mono text-[10px]`}>{v.risk_rank}</td>
                                <td className={`px-3 ${rowPad}`}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-text-primary truncate max-w-[200px]">{v.name}</span>
                                    {isCrit && <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold">CP</span>}
                                  </div>
                                  <div className="text-[10px] font-mono text-text-secondary mt-0.5">{v.external_id}</div>
                                </td>
                                <td className={`px-3 ${rowPad} hidden sm:table-cell`}>
                                  <div className="text-text-primary">{v.check_name}</div>
                                  <div className="text-[10px] text-text-secondary">{v.issue_type}</div>
                                </td>
                                <td className={`px-3 ${rowPad}`}><SeverityBadge severity={v.severity} /></td>
                                <td className={`px-3 ${rowPad} hidden md:table-cell`}><StatusBadge status={status} /></td>
                                <td className={`px-3 ${rowPad} text-right hidden sm:table-cell tabular-nums`}>
                                  {v.schedule_impact_days > 0 ? <span className="text-warning font-medium">{v.schedule_impact_days}d</span> : <span className="text-text-secondary">—</span>}
                                </td>
                                <td className={`px-3 ${rowPad}`}><RiskBar pct={v.risk_contribution_pct} /></td>
                                <td className={`px-3 ${rowPad} hidden lg:table-cell`}>
                                  {owner ? <span className="text-[11px] text-text-secondary truncate max-w-[100px] block">{owner}</span> : <span className="text-[10px] text-danger/60 italic">Unassigned</span>}
                                </td>
                                <td className="px-2 text-center">
                                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />}
                                </td>
                              </tr>
                              {isOpen && (
                                <tr key={key + "_exp"} className="border-b border-border border-l-[3px] border-l-primary/40">
                                  <td colSpan={10} className="p-0">
                                    <ExpandedRow
                                      violation={v}
                                      allViolations={data.violations}
                                      floatMap={floatMap}
                                      status={status}
                                    />
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Explainability footer + bottom download ────────────────────────── */}
      {data && (
        <div className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3 text-xs text-text-secondary">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <div className="flex-1 space-y-1">
            <p>
              <strong className="text-text-primary">Risk %</strong> = (issue impact / Σ all impacts) × 100.
              {" "}<strong className="text-text-primary">Status</strong> is CPM-derived:{" "}
              <span className="text-orange-400">On CP</span> = activity is on the critical path ·{" "}
              <span className="text-danger">Neg Float</span> = total float &lt; 0 ·{" "}
              <span className="text-amber-400">Near Crit</span> = 0 ≤ float ≤ 14d.
            </p>
            <p>
              DCMA Engine {data.duration_ms}ms · computed {new Date(data.computed_at).toLocaleString()} ·
              {" "}{data.summary.task_count.toLocaleString()} activities · {data.total_count.toLocaleString()} violations ·
              {" "}{data.summary.violations_with_owner}/{data.total_count} with identified owner.
            </p>
          </div>
          <div className="shrink-0">
            <ExportMenu projectId={params.id} label="Download Report" size="xs" />
          </div>
        </div>
      )}
    </div>
  );
}
