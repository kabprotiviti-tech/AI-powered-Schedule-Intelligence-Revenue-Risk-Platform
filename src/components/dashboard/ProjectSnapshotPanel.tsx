"use client";
import { useState } from "react";
import {
  Building2, Layers as LayersIcon, Hammer, Wrench, PaintBucket, Cpu,
  TreePine, Anchor, ArrowUpFromLine, Sparkles, AlertCircle, Info, Pencil, Pin, X,
} from "lucide-react";
import type { ProjectSnapshot, Component, Tier, AssetType } from "@/lib/schedule/classifier";
import { ASSET_LABELS } from "@/lib/schedule/classifier";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";

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
  /**
   * When provided, the panel renders a "Reclassify" affordance that pins a
   * manual asset+tier choice for this schedule. Pass the schedule id; the
   * panel pulls setOverride/clearOverride from ScheduleProvider.
   * Omitted on portfolio/aggregate views where a single override has no meaning.
   */
  scheduleId?: string;
}

export function ProjectSnapshotPanel({ snapshot, compact, scheduleId }: Props) {
  const tier = tierStyle[snapshot.tier];
  const lowAssetConfidence = !snapshot.overridden && snapshot.assetConfidence < 0.55;
  const isGeneric = snapshot.assetType === "Generic";
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 size={15} className="text-primary" />
          <span className="text-sm font-semibold text-text-primary">Project Snapshot</span>
          <span className="text-xs text-text-secondary">
            — {snapshot.overridden ? "manually pinned" : "auto-classified from WBS & activities"}
          </span>
        </div>
        {scheduleId && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded border border-border bg-overlay/[0.03] hover:bg-overlay/[0.08] text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
          >
            <Pencil size={11} />
            {editing ? "Cancel" : snapshot.overridden ? "Edit override" : "Reclassify"}
          </button>
        )}
      </div>

      {/* Inline reclassify picker */}
      {editing && scheduleId && (
        <ReclassifyPicker
          scheduleId={scheduleId}
          currentAsset={snapshot.assetType}
          currentTier={snapshot.tier}
          overridden={snapshot.overridden}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Headline */}
      <div className={`rounded-xl border ${tier.bg} px-4 py-3 mb-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] uppercase tracking-wider font-bold ${tier.text} flex items-center gap-1.5`}>
            {tier.label}
            {snapshot.overridden && (
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded font-bold border bg-primary/10 text-primary border-primary/30">
                <Pin size={8} /> Pinned
              </span>
            )}
          </div>
          <div className="text-sm text-text-primary mt-0.5 font-semibold">{snapshot.headline}</div>
          <div className="text-[11px] text-text-secondary mt-0.5 leading-snug">{snapshot.tierRationale}</div>
          {snapshot.tierStandard && (
            <div className="text-[10px] text-text-secondary mt-1 leading-snug font-mono opacity-75">
              {snapshot.tierStandard}
            </div>
          )}
        </div>
        {lowAssetConfidence && (
          <span
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold border bg-warning/10 text-warning border-warning/30"
            title="Asset-type confidence below threshold. Add more descriptive WBS names — or use Reclassify above to pin the correct type."
          >
            <AlertCircle size={10} />
            Low confidence
          </span>
        )}
      </div>

      {/* Alternates — runner-up classifications */}
      {!snapshot.overridden && snapshot.alternates.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Also could be:</span>
          {snapshot.alternates.map((alt) => (
            <span
              key={alt.type}
              className="text-[10px] px-2 py-0.5 rounded-md border bg-overlay/[0.03] border-border text-text-secondary"
              title={`${(alt.confidence * 100).toFixed(0)}% of dominant asset's evidence weight`}
            >
              {alt.label}
              <span className="ml-1 font-mono opacity-60">{(alt.confidence * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      )}

      {/* Generic fallback CTA */}
      {isGeneric && scheduleId && !editing && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 flex items-start gap-2">
          <Info size={13} className="text-warning shrink-0 mt-0.5" />
          <div className="text-[11px] text-text-primary leading-relaxed flex-1">
            <span className="font-semibold">Couldn&apos;t auto-classify</span> — the schedule&apos;s WBS and activity names didn&apos;t match
            a known asset taxonomy. Pin the correct type so portfolio rollups and benchmarks line up.
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-warning/15 text-warning border border-warning/40 hover:bg-warning/25 transition-colors shrink-0"
          >
            Classify manually
          </button>
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Cell label="Asset type"        value={snapshot.assetLabel}                                  hint={`${Math.round(snapshot.assetConfidence * 100)}% confidence`} />
        <Cell label="Floors above grade" value={snapshot.floors.totalAboveGrade > 0 ? `${snapshot.floors.totalAboveGrade}` : "—"} hint={snapshot.floors.totalAboveGrade > 0 ? floorBreakdownLine(snapshot.floors) : "no floor markers in WBS"} />
        <Cell label="Basements"          value={`${snapshot.floors.basements}`}                       hint={snapshot.floors.basements > 0 ? `${snapshot.floors.basementNumbers.map((n) => `B${n}`).join(", ")}` : "none detected"} />
        <Cell label="Activities"         value={snapshot.scale.activities.toLocaleString()}            hint={`${snapshot.scale.wbsNodes.toLocaleString()} WBS nodes`} />
      </div>

      {/* Floor structure — full audit of what was detected, where */}
      {!compact && (snapshot.floors.totalAboveGrade > 0 || snapshot.floors.basements > 0) && (
        <FloorStructureBlock floors={snapshot.floors} />
      )}

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

// Inline editor for the manual classifier override. Renders inside the
// snapshot panel; on Save persists via ScheduleProvider's setOverride. No
// modal — keep the surface light and inline so the panel doesn't fight the
// rest of the dashboard for attention.
function ReclassifyPicker({
  scheduleId,
  currentAsset,
  currentTier,
  overridden,
  onClose,
}: {
  scheduleId: string;
  currentAsset: AssetType;
  currentTier: Tier;
  overridden: boolean;
  onClose: () => void;
}) {
  const { setOverride, clearOverride } = useSchedule();
  const [asset, setAsset] = useState<AssetType>(currentAsset);
  const [tier, setTier] = useState<Tier>(currentTier);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await setOverride(scheduleId, asset, tier);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await clearOverride(scheduleId);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // All asset types except Generic
  const assetOptions = (Object.entries(ASSET_LABELS) as [AssetType, string][])
    .filter(([t]) => t !== "Generic")
    .sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/[0.04] px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Pencil size={12} className="text-primary" />
        <span className="text-[11px] uppercase tracking-wider font-bold text-primary">Manual classification</span>
        <button
          onClick={onClose}
          className="ml-auto text-text-secondary hover:text-text-primary"
          title="Cancel"
        >
          <X size={13} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-1">Asset type</div>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value as AssetType)}
            className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {assetOptions.map(([t, label]) => (
              <option key={t} value={t}>{label}</option>
            ))}
          </select>
        </label>

        <div className="block">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-1">Tier</div>
          <div className="flex gap-1.5">
            {(["A", "B", "C"] as Tier[]).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                  tier === t
                    ? t === "A" ? "bg-danger/15 border-danger/40 text-danger"
                    : t === "B" ? "bg-warning/15 border-warning/40 text-warning"
                    : "bg-success/15 border-success/30 text-success"
                    : "bg-surface border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                Tier {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={save}
          disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {busy ? "Saving…" : "Save override"}
        </button>
        {overridden && (
          <button
            onClick={remove}
            disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-danger hover:border-danger/40 disabled:opacity-60 transition-colors"
          >
            Remove override
          </button>
        )}
        <span className="text-[10px] text-text-secondary ml-auto">
          Manual override always wins over the auto-classifier.
        </span>
      </div>
    </div>
  );
}

// One-line breakdown for the "Floors above grade" detail-grid hint.
function floorBreakdownLine(f: ProjectSnapshot["floors"]): string {
  const parts: string[] = [];
  if (f.hasLowerGround) parts.push("LG");
  if (f.hasGroundFloor) parts.push("GF");
  if (f.hasUpperGround) parts.push("UG");
  if (f.podiumLevels)   parts.push(`${f.podiumLevels}×P`);
  if (f.mezzanines)     parts.push(f.mezzanines === 1 ? "MZ" : `${f.mezzanines}×MZ`);
  if (f.typicalFloors)  parts.push(`${f.typicalFloors}×L`);
  if (f.hasPenthouse)   parts.push("PH");
  if (f.hasPlantLevel)  parts.push("Plant");
  if (f.hasRoof)        parts.push("Roof");
  return parts.join(" + ") || "GF only";
}

// Compact range formatter: [1,2,3,5,7,8,9] -> "L1–L3, L5, L7–L9"
function compactRange(prefix: string, nums: number[]): string {
  if (nums.length === 0) return "";
  const out: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i];
    if (n !== prev + 1) {
      out.push(start === prev ? `${prefix}${start}` : `${prefix}${start}–${prefix}${prev}`);
      if (n !== undefined) start = n;
    }
    if (n !== undefined) prev = n;
  }
  return out.join(", ");
}

// Detailed floor-structure block. Renders one row per floor "stratum"
// (below-grade / at-grade / mid / habitable / top) with the actual level
// numbers detected. Below it, an expandable audit list of the WBS nodes
// that produced each marker. This is the answer to "show me your work."
function FloorStructureBlock({ floors }: { floors: ProjectSnapshot["floors"] }) {
  const [showEvidence, setShowEvidence] = useState(false);

  const groundLabel = [
    floors.hasLowerGround && "Lower Ground (LG)",
    floors.hasGroundFloor && "Ground Floor (GF)",
    floors.hasUpperGround && "Upper Ground (UG)",
  ].filter(Boolean).join(" · ") || null;

  const rows: { label: string; value: string; detail?: string }[] = [];
  if (floors.basements > 0) {
    rows.push({
      label: "Below grade",
      value: `${floors.basements} basement${floors.basements === 1 ? "" : "s"}`,
      detail: compactRange("B", floors.basementNumbers),
    });
  }
  if (groundLabel) {
    rows.push({ label: "At grade", value: groundLabel });
  }
  if (floors.podiumLevels > 0) {
    rows.push({
      label: "Mid-level (podium)",
      value: `${floors.podiumLevels} level${floors.podiumLevels === 1 ? "" : "s"} — typically parking / retail`,
      detail: compactRange("P", floors.podiumNumbers),
    });
  }
  if (floors.mezzanines > 0) {
    rows.push({ label: "Mezzanine", value: `${floors.mezzanines}`, detail: "" });
  }
  if (floors.typicalFloors > 0) {
    rows.push({
      label: "Habitable / typical",
      value: `${floors.typicalFloors} floor${floors.typicalFloors === 1 ? "" : "s"}`,
      detail: compactRange("L", floors.typicalNumbers),
    });
  }
  if (floors.hasPenthouse) rows.push({ label: "Penthouse", value: "detected" });
  if (floors.hasPlantLevel) rows.push({ label: "Plant / MEP level", value: "detected" });
  if (floors.hasRoof)      rows.push({ label: "Roof", value: "detected" });

  return (
    <div className="mb-4 rounded-xl border border-border bg-overlay/[0.02] px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <LayersIcon size={12} className="text-primary" />
        <span className="text-[11px] uppercase tracking-wider font-bold text-text-secondary">Floor Structure</span>
        <span className="text-[10px] text-text-secondary">— extracted from WBS</span>
        <button
          onClick={() => setShowEvidence((v) => !v)}
          className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-text-secondary hover:text-primary transition-colors"
        >
          {showEvidence ? "Hide audit" : `Audit (${floors.evidence.length} markers)`}
        </button>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-3 text-xs">
            <span className="text-text-secondary uppercase tracking-wider text-[10px] font-semibold w-36 shrink-0">
              {r.label}
            </span>
            <span className="text-text-primary font-semibold">{r.value}</span>
            {r.detail && <span className="text-text-secondary font-mono text-[11px]">{r.detail}</span>}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-[11px] text-text-secondary">No floor structure markers detected in WBS.</div>
        )}
      </div>

      {showEvidence && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-2">
            Raw markers (WBS source → bucket)
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5 font-mono text-[10px]">
            {floors.evidence.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-text-secondary">
                <code className="bg-overlay/[0.05] px-1 rounded">{e.marker}</code>
                <span className="opacity-60">→ {e.bucket}</span>
                <span className="opacity-50 truncate">in &quot;{e.source}&quot;</span>
              </div>
            ))}
            {floors.evidence.length === 0 && <div className="text-text-secondary">No markers.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
