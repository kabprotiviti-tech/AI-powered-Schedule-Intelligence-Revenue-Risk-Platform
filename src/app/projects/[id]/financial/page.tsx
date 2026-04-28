// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, TrendingDown, DollarSign,
  FileWarning, AlertTriangle, CheckCircle2, Activity,
  ArrowLeft, Layers, Cpu, BarChart3,
} from "lucide-react";
import type { FinancialTraceResponse, FinancialImpactRecord, ActivityExposureSummary, ImpactType } from "@/lib/financial/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAED(n: number): string {
  if (n >= 1_000_000_000) return `AED ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
  return `AED ${Math.round(n).toLocaleString()}`;
}
function fmtAEDS(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Math.round(n).toLocaleString();
}

function confidenceColor(c: string): string {
  if (c === "High")   return "text-danger  bg-danger/10  border-danger/30";
  if (c === "Medium") return "text-warning bg-warning/10 border-warning/30";
  return                     "text-text-secondary bg-surface border-border";
}

function typeColor(t: ImpactType): string {
  if (t === "revenue_delay")    return "text-purple-400 bg-purple-500/10 border-purple-500/30";
  if (t === "cost_escalation")  return "text-warning bg-warning/10 border-warning/30";
  return                               "text-danger  bg-danger/10  border-danger/30";
}

function typeLabel(t: ImpactType): string {
  if (t === "revenue_delay")   return "Revenue Delay";
  if (t === "cost_escalation") return "Cost Escalation";
  return "Claim";
}

function typeIcon(t: ImpactType) {
  if (t === "revenue_delay")   return <TrendingDown size={14} />;
  if (t === "cost_escalation") return <DollarSign size={14} />;
  return <FileWarning size={14} />;
}

function sourceTag(s: string): string {
  const colors: Record<string, string> = {
    CPM:      "text-blue-400 bg-blue-500/10 border-blue-500/30",
    DCMA:     "text-purple-400 bg-purple-500/10 border-purple-500/30",
    EVM:      "text-green-400 bg-green-500/10 border-green-500/30",
    Contract: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  };
  return colors[s] ?? "text-text-secondary bg-surface border-border";
}

// ─── Summary KPI card ─────────────────────────────────────────────────────────

function KPICard({
  label, amount, pct, icon, colorClass,
}: {
  label: string;
  amount: number;
  pct: number;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`p-1.5 rounded-md border ${colorClass}`}>{icon}</span>
        <span className="text-xs text-text-secondary uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono">{fmtAED(amount)}</div>
      <div className="text-xs text-text-secondary mt-1">{pct.toFixed(1)}% of total exposure</div>
    </div>
  );
}

// ─── Stacked bar (exposure breakdown) ────────────────────────────────────────

function ExposureBar({ revenue, cost, claims, total }: {
  revenue: number; cost: number; claims: number; total: number;
}) {
  const revPct   = (revenue / total) * 100;
  const costPct  = (cost   / total) * 100;
  const claimPct = (claims / total) * 100;
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden bg-surface flex">
        <div className="bg-purple-500 h-full transition-all" style={{ width: `${revPct}%` }} title={`Revenue Delay ${fmtAED(revenue)}`} />
        <div className="bg-warning h-full transition-all"   style={{ width: `${costPct}%` }} title={`Cost Escalation ${fmtAED(cost)}`} />
        <div className="bg-danger h-full transition-all"    style={{ width: `${claimPct}%` }} title={`Claims ${fmtAED(claims)}`} />
      </div>
      <div className="flex gap-4 mt-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Revenue {revPct.toFixed(0)}%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning   inline-block" />Cost {costPct.toFixed(0)}%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger    inline-block" />Claims {claimPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─── Activity attribution bar ─────────────────────────────────────────────────

function ActivityBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-text-secondary w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

// ─── Impact record card ───────────────────────────────────────────────────────

function RecordCard({ record, totalExposure }: {
  record: FinancialImpactRecord;
  totalExposure: number;
}) {
  const [open, setOpen] = useState(false);
  const sharePct = (record.amount_aed / totalExposure) * 100;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-surface/50 transition-colors"
      >
        <div className="mt-0.5 shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${typeColor(record.type)}`}>
            {typeIcon(record.type)}
            {typeLabel(record.type)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary leading-snug">{record.title}</div>
          <div className="text-xs text-text-secondary mt-0.5">{record.category}</div>

          {/* inline bar */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, sharePct)}%`,
                  backgroundColor: record.type === "revenue_delay" ? "#a855f7" : record.type === "cost_escalation" ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <span className="text-xs text-text-secondary w-10 text-right">{sharePct.toFixed(1)}%</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-text-primary font-mono">{fmtAED(record.amount_aed)}</div>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${confidenceColor(record.confidence)}`}>
              {record.confidence}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${sourceTag(record.driver.source)}`}>
              {record.driver.source}
            </span>
          </div>
        </div>

        <ChevronDown size={16} className={`shrink-0 text-text-secondary mt-1 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Detail panel */}
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {/* Driver */}
          <div className="p-4 space-y-1">
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Primary Driver</div>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 text-xs px-1.5 py-0.5 rounded border ${sourceTag(record.driver.source)}`}>
                {record.driver.source}{record.driver.check_code ? ` · ${record.driver.check_code}` : ""}
              </span>
              <div>
                <div className="text-sm text-text-primary">{record.driver.description}</div>
                <div className="text-xs text-text-secondary mt-1">
                  <span className="font-medium">{record.driver.metric_label}:</span> {record.driver.metric_value}
                </div>
              </div>
            </div>
          </div>

          {/* Basis */}
          <div className="p-4">
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Calculation Basis</div>
            <div className="text-xs text-text-primary bg-surface rounded-lg p-3 border border-border font-mono leading-relaxed">
              {record.basis}
            </div>
          </div>

          {/* Activities */}
          {record.activities.length > 0 && (
            <div className="p-4">
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-3">
                Contributing Activities ({record.activities.length})
              </div>
              <div className="space-y-2">
                {record.activities.map((act) => (
                  <div
                    key={act.activity_id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-surface border border-border"
                  >
                    <div className="shrink-0 mt-0.5">
                      {act.is_critical
                        ? <AlertTriangle size={13} className="text-danger" />
                        : <Activity size={13} className="text-text-secondary" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-medium text-primary">{act.external_id}</span>
                        <span className="text-xs text-text-primary truncate">{act.name}</span>
                        {act.is_critical && (
                          <span className="text-[10px] px-1 py-0 rounded bg-danger/10 text-danger border border-danger/30">Critical</span>
                        )}
                        {act.driver_checks.length > 0 && act.driver_checks.map((c) => (
                          <span key={c} className="text-[10px] px-1 py-0 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">{c}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-text-secondary">
                        <span>WBS {act.wbs_code}</span>
                        {act.responsible_party && <span>Owner: {act.responsible_party}</span>}
                        {act.float_days !== null && (
                          <span className={act.float_days < 0 ? "text-danger" : act.float_days === 0 ? "text-warning" : ""}>
                            Float: {act.float_days}d
                          </span>
                        )}
                        {act.delay_days > 0 && <span>Delay: {act.delay_days}d</span>}
                      </div>
                      <ActivityBar pct={act.share_pct} />
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-mono font-semibold text-text-primary">{fmtAED(act.share_amount_aed)}</div>
                      <div className="text-[11px] text-text-secondary">{act.share_pct.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity exposure table ──────────────────────────────────────────────────

function ExposureTable({ rows }: { rows: ActivityExposureSummary[] }) {
  const top = rows.slice(0, 15);
  const maxExp = top[0]?.total_exposure_aed ?? 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="text-left py-2 pr-3 font-medium">Activity</th>
            <th className="text-left py-2 pr-3 font-medium">WBS</th>
            <th className="text-left py-2 pr-3 font-medium">Owner</th>
            <th className="text-left py-2 pr-3 font-medium">Float</th>
            <th className="text-left py-2 pr-3 font-medium">Impact Types</th>
            <th className="text-right py-2 font-medium">Exposure</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {top.map((row) => (
            <tr key={row.activity_id} className="hover:bg-surface/50 transition-colors">
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  {row.is_critical && <AlertTriangle size={11} className="text-danger shrink-0" />}
                  <div>
                    <span className="font-mono font-medium text-primary">{row.external_id}</span>
                    <div className="text-text-secondary text-[11px] truncate max-w-[180px]">{row.name}</div>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-3 text-text-secondary">{row.wbs_code}</td>
              <td className="py-2 pr-3 text-text-secondary">{row.responsible_party ?? "—"}</td>
              <td className="py-2 pr-3">
                {row.float_days === null ? (
                  <span className="text-text-secondary">—</span>
                ) : (
                  <span className={row.float_days < 0 ? "text-danger" : row.float_days === 0 ? "text-warning" : "text-success"}>
                    {row.float_days}d
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-1 flex-wrap">
                  {row.impact_types.map((t) => (
                    <span key={t} className={`text-[10px] px-1 py-0 rounded border ${typeColor(t)}`}>
                      {typeLabel(t)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 text-right">
                <div className="font-mono font-semibold text-text-primary">{fmtAED(row.total_exposure_aed)}</div>
                <div className="mt-0.5 h-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(row.total_exposure_aed / maxExp) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancialPage() {
  const { id } = useParams<{ id: string }>();
  const [data,    setData]    = useState<FinancialTraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<ImpactType | "all">("all");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/financial-trace?project_id=${id}`)
      .then((r) => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then((d: FinancialTraceResponse) => { setData(d); setLoading(false); })
      .catch((e: string) => { setError(String(e)); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto p-6">
        <div className="flex items-center gap-3 text-text-secondary">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Building financial trace…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1200px] mx-auto p-6">
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">
          {error ?? "Unable to load financial data."}
        </div>
      </div>
    );
  }

  const s = data.summary;
  const visibleRecords = filter === "all"
    ? data.records
    : data.records.filter((r) => r.type === filter);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link href="/"                              className="hover:text-primary transition-colors">Portfolio</Link>
        <ChevronRight size={12} />
        <Link href="/projects"                      className="hover:text-primary transition-colors">Projects</Link>
        <ChevronRight size={12} />
        <Link href={`/projects/${id}`}              className="hover:text-primary transition-colors">{data.project_name}</Link>
        <ChevronRight size={12} />
        <span className="text-text-primary">Financial Traceability</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Financial Traceability</h1>
          <p className="text-sm text-text-secondary mt-1">
            {data.project_name} · Full exposure breakdown with activity-level attribution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${id}/analysis`}
            className="flex items-center gap-1.5 text-xs bg-surface border border-border text-text-primary px-3 py-2 rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Cpu size={12} />
            Analysis
          </Link>
          <Link
            href={`/projects/${id}/activities`}
            className="flex items-center gap-1.5 text-xs bg-surface border border-border text-text-primary px-3 py-2 rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Layers size={12} />
            Activities
          </Link>
        </div>
      </div>

      {/* Total exposure hero */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Total Financial Exposure</div>
            <div className="text-4xl font-bold font-mono text-text-primary">{fmtAED(s.total_exposure_aed)}</div>
            <div className="flex items-center gap-2 mt-2 text-sm text-text-secondary">
              <span className="font-mono text-danger font-semibold">{s.exposure_pct_of_budget.toFixed(1)}%</span>
              <span>of budget ·</span>
              <span className="font-mono text-text-primary">{fmtAED(s.budget_aed)} BAC</span>
            </div>
          </div>

          <div className="flex-1 min-w-[200px] max-w-[400px]">
            <ExposureBar
              revenue={s.revenue_delay_aed}
              cost={s.cost_escalation_aed}
              claims={s.claims_aed}
              total={s.total_exposure_aed}
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Revenue Delay"
          amount={s.revenue_delay_aed}
          pct={(s.revenue_delay_aed / s.total_exposure_aed) * 100}
          icon={<TrendingDown size={14} />}
          colorClass="text-purple-400 bg-purple-500/10 border-purple-500/30"
        />
        <KPICard
          label="Cost Escalation"
          amount={s.cost_escalation_aed}
          pct={(s.cost_escalation_aed / s.total_exposure_aed) * 100}
          icon={<DollarSign size={14} />}
          colorClass="text-warning bg-warning/10 border-warning/30"
        />
        <KPICard
          label="Claims Exposure"
          amount={s.claims_aed}
          pct={(s.claims_aed / s.total_exposure_aed) * 100}
          icon={<FileWarning size={14} />}
          colorClass="text-danger bg-danger/10 border-danger/30"
        />
      </div>

      {/* Impact records */}
      <div>
        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-semibold text-text-primary">Impact Breakdown</span>
          <div className="ml-auto flex gap-1">
            {(["all", "revenue_delay", "cost_escalation", "claim"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  filter === f
                    ? "bg-primary text-white border-primary"
                    : "bg-surface border-border text-text-secondary hover:text-primary hover:border-primary"
                }`}
              >
                {f === "all" ? "All" : typeLabel(f as ImpactType)}
                {f !== "all" && (
                  <span className="ml-1 opacity-60">
                    ({data.records.filter((r) => r.type === f).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {visibleRecords.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              totalExposure={s.total_exposure_aed}
            />
          ))}
          {visibleRecords.length === 0 && (
            <div className="text-center py-10 text-text-secondary text-sm">
              No records for this filter.
            </div>
          )}
        </div>
      </div>

      {/* Activity exposure matrix */}
      {data.activity_exposure.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">Activity Exposure Matrix</span>
            <span className="text-xs text-text-secondary ml-1">— top {Math.min(15, data.activity_exposure.length)} by total exposure</span>
          </div>
          <ExposureTable rows={data.activity_exposure} />
        </div>
      )}

      {/* Footer metadata */}
      <div className="text-xs text-text-secondary text-right">
        Computed {new Date(data.computed_at).toLocaleString()} · Revenue at risk: {fmtAED(s.revenue_at_risk_aed)}
      </div>
    </div>
  );
}
