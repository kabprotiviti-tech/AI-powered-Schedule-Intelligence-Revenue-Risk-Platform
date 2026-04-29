"use client";
import Link from "next/link";
import { Check, Plus, Layers, GitCompare } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";

export function SchedulePicker() {
  const { all, selectedIds, toggleSelected, setSelected } = useSchedule();
  if (all.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Layers size={14} className="text-primary shrink-0" />
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Schedules on dashboard</span>
          <span className="text-[11px] text-text-secondary">{selectedIds.length} of {all.length}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSelected(all.map((s) => s.id))}
            disabled={selectedIds.length === all.length}
            className="text-[11px] px-2 py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Select all
          </button>
          <button
            onClick={() => setSelected([])}
            disabled={selectedIds.length === 0}
            className="text-[11px] px-2 py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          {all.length >= 2 && (
            <Link
              href="/compare"
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-primary/40"
              title="Compare schedules side-by-side"
            >
              <GitCompare size={11} /> Compare
            </Link>
          )}
          <Link
            href="/upload"
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
          >
            <Plus size={11} /> Add
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {all.map((s) => {
          const sel = selectedIds.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSelected(s.id)}
              title={`${s.activities.length.toLocaleString()} activities · ${s.project.source.replace("_", " ")}`}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-all max-w-[260px] ${
                sel
                  ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                  : "bg-overlay/[0.04] border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {sel && <Check size={10} className="shrink-0" />}
              <span className="truncate">{s.project.name}</span>
              <span className="text-[10px] text-text-secondary font-mono shrink-0">·{s.activities.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
