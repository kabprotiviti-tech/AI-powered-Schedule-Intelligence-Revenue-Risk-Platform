"use client";
import {
  Building2, Hash, Layers as LayersIcon, Hammer, Wrench, PaintBucket, Cpu,
  TreePine, Anchor, ArrowUpFromLine, Sparkles, AlertCircle, Info,
} from "lucide-react";
import type { ProjectSnapshot, Component, Tier } from "@/lib/schedule/classifier";

const tierStyle: Record<Tier, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-danger/15  border-danger/40",  text: "text-danger",  label: "Tier A — Mega" },
  B: { bg: "bg-warning/15 border-warning/40", text: "text-warning", label: "Tier B — Mid" },
  C: { bg: "bg-success/15 border-success/30", text: "text-success", label: "Tier C — Small" },
};

const COMPONENT_META: Record<Component, { icon: React.ElementType; label: string }> = {
  Civil:             { icon: Hammer,         label: "Civil / Foundations" },
  Structural:        { icon: Building2,      label: "Structural Frame" },
  Facade:            { icon: PaintBucket,    label: "Facade / Cladding" },
  MEP:               { icon: Cpu,            label: "MEP / Services" },
  FitOut:            { icon: Wrench,         label: "Fit-Out / Finishes" },
  External:          { icon: TreePine,       label: "External / Landscape" },
  Marine:            { icon: Anchor,         label: "Marine Works" },
  VerticalTransport: { icon: ArrowUpFromLine,label: "Vertical Transport" },
  Specialty:         { icon: Sparkles,       label: "Specialty / FF&E" },
};

interface Props {
  snapshot: ProjectSnapshot;
  compact?: boolean;
}

export function ProjectSnapshotPanel({ snapshot, compact }: Props) {
  const tier = tierStyle[snapshot.tier];
  const lowAssetConfidence = snapshot.assetConfidence < 0.55;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={15} className="text-primary" />
        <span className="text-sm font-semibold text-text-primary">Project Snapshot</span>
        <span className="text-xs text-text-secondary">— auto-classified from WBS &amp; activities</span>
      </div>

      {/* Headline */}
      <div className={`rounded-xl border ${tier.bg} px-4 py-3 mb-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] uppercase tracking-wider font-bold ${tier.text}`}>{tier.label}</div>
          <div className="text-sm text-text-primary mt-0.5 font-semibold">{snapshot.headline}</div>
          <div className="text-[11px] text-text-secondary mt-0.5 leading-snug">{snapshot.tierRationale}</div>
        </div>
        {lowAssetConfidence && (
          <span
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border bg-warning/10 text-warning border-warning/30"
            title="Asset-type confidence below threshold. Add more descriptive WBS names to improve classification."
          >
            <AlertCircle size={10} />
            Low confidence
          </span>
        )}
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Cell label="Asset type"        value={snapshot.assetLabel}                                  hint={`${Math.round(snapshot.assetConfidence * 100)}% confidence`} />
        <Cell label="Floors above grade" value={snapshot.floors.totalAboveGrade > 0 ? `${snapshot.floors.totalAboveGrade}` : "—"} hint={snapshot.floors.totalAboveGrade > 0 ? floorBreakdown(snapshot.floors) : "no floor markers in WBS"} />
        <Cell label="Basements"          value={`${snapshot.floors.basements}`}                       hint={snapshot.floors.basements > 0 ? "detected from WBS" : "none detected"} />
        <Cell label="Activities"         value={snapshot.scale.activities.toLocaleString()}            hint={`${snapshot.scale.wbsNodes.toLocaleString()} WBS nodes`} />
      </div>

      {/* Components / scope strip */}
      {!compact && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <LayersIcon size={12} className="text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Detected Scope</span>
            <span className="text-[10px] text-text-secondary">
              · {snapshot.components.length} of {Object.keys(COMPONENT_META).length} components
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(COMPONENT_META) as Component[]).map((c) => {
              const meta = COMPONENT_META[c];
              const detail = snapshot.componentDetails[c];
              const detected = detail?.detected ?? false;
              const Icon = meta.icon;
              return (
                <div
                  key={c}
                  title={detected
                    ? `${meta.label} — ${detail.matches} keyword match${detail.matches === 1 ? "" : "es"}`
                    : `${meta.label} — not detected in this schedule`}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border ${
                    detected
                      ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                      : "bg-overlay/[0.02] border-border text-text-secondary opacity-60"
                  }`}
                >
                  <Icon size={11} />
                  {meta.label}
                  {detected && <span className="font-mono text-[10px] opacity-70">·{detail.matches}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Evidence (debug-style, low visual weight) */}
      {!compact && snapshot.assetEvidence.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-start gap-1.5 text-[10px] text-text-secondary">
            <Info size={10} className="mt-0.5 shrink-0" />
            <div className="leading-relaxed">
              <span className="font-semibold uppercase tracking-wider">Evidence:</span>{" "}
              {snapshot.assetEvidence.slice(0, 5).map((e, i) => (
                <code key={i} className="bg-overlay/[0.04] px-1 py-0.5 rounded mr-1 font-mono">{e}</code>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-overlay/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">{label}</div>
      <div className="text-sm font-bold text-text-primary mt-0.5 truncate">{value}</div>
      {hint && <div className="text-[10px] text-text-secondary mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function floorBreakdown(f: ProjectSnapshot["floors"]): string {
  const parts: string[] = [];
  if (f.hasGroundFloor) parts.push("GF");
  if (f.podiumLevels)   parts.push(`${f.podiumLevels}×P`);
  if (f.mezzanines)     parts.push("MZ");
  if (f.typicalFloors)  parts.push(`${f.typicalFloors}×L`);
  if (f.hasPenthouse)   parts.push("PH");
  if (f.hasRoof)        parts.push("Roof");
  return parts.join(" + ") || "GF only";
}
