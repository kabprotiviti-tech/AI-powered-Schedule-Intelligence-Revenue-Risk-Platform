"use client";
// Earned Value Management panel — board-grade cost performance view.
//
// Renders BAC / PV / EV / AC + CV / SV + CPI / SPI + EAC / VAC. When the
// underlying schedule lacks cost data the panel renders a clear "no cost
// data" callout instead of zeroed numbers (those would lie).

import { DollarSign, AlertCircle, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { EVMResult } from "@/lib/schedule/evm";

interface Props {
  evm: EVMResult;
  compact?: boolean;
}

export function EVMPanel({ evm, compact }: Props) {
  if (!evm.hasCostData) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={15} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">Earned Value (EVM)</span>
          <span className="text-xs text-text-secondary">— ANSI/EIA-748</span>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-border bg-overlay/[0.02] px-4 py-3 text-[12px] text-text-secondary">
          <Info size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="text-text-primary font-semibold mb-0.5">No cost data in this schedule.</div>
            <div>
              EVM needs <code className="bg-overlay/[0.05] px-1 rounded font-mono">target_cost</code>,{" "}
              <code className="bg-overlay/[0.05] px-1 rounded font-mono">act_reg_cost</code>, and{" "}
              <code className="bg-overlay/[0.05] px-1 rounded font-mono">remain_cost</code> populated at the
              activity (or resource) level. {evm.activitiesWithCost > 0
                ? `Only ${evm.activitiesWithCost} of ${evm.totalActivities.toLocaleString()} activities carry cost (< 10%).`
                : `None of the ${evm.totalActivities.toLocaleString()} activities carry cost.`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cur = evm.currency || "";
  const fmt = (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? "−" : "";
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`;
    return `${sign}${abs.toFixed(0)}`;
  };
  const fmtMoney = (v: number) => `${cur ? cur + " " : ""}${fmt(v)}`;

  const cpiTone = evm.cpi < 0.95 ? "danger" : evm.cpi < 1   ? "warning" : "success";
  const spiTone = evm.spi < 0.95 ? "danger" : evm.spi < 1   ? "warning" : "success";
  const cvTone  = evm.cv  < -0.05 * evm.bac ? "danger" : evm.cv  < 0 ? "warning" : "success";
  const svTone  = evm.sv  < -0.05 * evm.bac ? "danger" : evm.sv  < 0 ? "warning" : "success";

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign size={15} className="text-primary" />
          <span className="text-sm font-semibold text-text-primary">Earned Value (EVM)</span>
          <span className="text-xs text-text-secondary">— ANSI/EIA-748</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-secondary">
          {evm.activitiesWithCost.toLocaleString()} of {evm.totalActivities.toLocaleString()} priced
        </span>
      </div>

      {/* Top row: BAC + PV + EV + AC */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="BAC"           value={fmtMoney(evm.bac)} hint="Budget at completion" />
        <Stat label="Planned (PV)"  value={fmtMoney(evm.pv)}  hint="Budgeted cost of work scheduled" />
        <Stat label="Earned (EV)"   value={fmtMoney(evm.ev)}  hint="Budgeted cost of work performed" />
        <Stat label="Actual (AC)"   value={fmtMoney(evm.ac)}  hint="Actual cost of work performed" />
      </div>

      {/* Variance & index row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <PerformanceCard label="Cost Variance"   value={fmtMoney(evm.cv)} delta tone={cvTone}  hint="EV − AC (positive = under-budget)" />
        <PerformanceCard label="Schedule Variance" value={fmtMoney(evm.sv)} delta tone={svTone} hint="EV − PV (positive = ahead of plan)" />
        <PerformanceCard label="CPI" value={evm.cpi.toFixed(2)} tone={cpiTone} hint={`EV / AC · ${cpiLabel(evm.cpi)}`} index />
        <PerformanceCard label="SPI" value={evm.spi.toFixed(2)} tone={spiTone} hint={`EV / PV · ${spiLabel(evm.spi)}`} index />
      </div>

      {/* Forecast */}
      {!compact && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Stat label="EAC" value={fmtMoney(evm.eac)} hint="Estimate at completion (BAC / CPI)" />
          <Stat label="ETC" value={fmtMoney(evm.etc)} hint="Estimate to complete (EAC − AC)" />
          <Stat
            label="VAC"
            value={fmtMoney(evm.vac)}
            hint={`Variance at completion (BAC − EAC) · ${evm.vac >= 0 ? "forecast under-budget" : "forecast over-budget"}`}
          />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border flex items-start gap-2 text-[10px] text-text-secondary">
        <Info size={10} className="mt-0.5 shrink-0" />
        <span>
          PV from planned start/finish curves through schedule data date. EV from activity % complete × budget.
          Tints turn warning at 5% variance vs BAC, danger at &lt; 0.95 index.
        </span>
      </div>
    </div>
  );
}

function cpiLabel(v: number) {
  return v >= 1.05 ? "under-budget" : v >= 1 ? "on budget" : v >= 0.95 ? "slightly over" : "over-budget";
}
function spiLabel(v: number) {
  return v >= 1.05 ? "ahead" : v >= 1 ? "on plan" : v >= 0.95 ? "slightly behind" : "behind";
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-overlay/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">{label}</div>
      <div className="text-lg font-bold text-text-primary font-mono mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-text-secondary mt-0.5">{hint}</div>}
    </div>
  );
}

function PerformanceCard({
  label, value, hint, tone, delta, index,
}: {
  label: string; value: string; hint: string;
  tone: "danger" | "warning" | "success";
  delta?: boolean; index?: boolean;
}) {
  const text =
    tone === "danger"  ? "text-danger"  :
    tone === "warning" ? "text-warning" : "text-success";
  const border =
    tone === "danger"  ? "border-danger/40"  :
    tone === "warning" ? "border-warning/40" : "border-success/40";
  let Icon = Minus;
  if (delta) {
    Icon = tone === "success" ? TrendingUp : tone === "danger" ? TrendingDown : Minus;
  } else if (index) {
    Icon = tone === "success" ? TrendingUp : tone === "danger" ? TrendingDown : Minus;
  }
  return (
    <div className={`rounded-xl border ${border} bg-card px-4 py-3`}>
      <div className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold flex items-center gap-1">
        {label}
        {tone === "danger" && <AlertCircle size={9} className="text-danger" />}
      </div>
      <div className={`text-2xl font-bold ${text} font-mono mt-0.5 flex items-baseline gap-1.5`}>
        <Icon size={14} className={text} />
        {value}
      </div>
      <div className="text-[10px] text-text-secondary mt-0.5">{hint}</div>
    </div>
  );
}
