"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileCheck2, AlertCircle, Loader2, ArrowRight, Trash2, Check, X, ChevronDown, ChevronRight, Files } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { parseSchedule, detectFormat } from "@/lib/schedule/parsers";
import type { Schedule } from "@/lib/schedule/types";

type QueueStatus = "queued" | "parsing" | "ready" | "error" | "imported";

interface QueueItem {
  id: string;                  // local row id
  file: File;
  fileName: string;
  status: QueueStatus;
  format?: string;
  error?: string;
  schedule?: Schedule;
  rename?: string;             // user-edited project name override
  expanded?: boolean;
}

let _rowId = 0;
const nextRowId = () => `r${++_rowId}_${Date.now()}`;

export default function UploadPage() {
  const { selectedIds, all, upload, toggleSelected, remove } = useSchedule();
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);          // running parse loop
  const [bulkImporting, setBulkImporting] = useState(false);
  const router = useRouter();

  // Parse a single queued file. Sequential — parsing is CPU-heavy (10k+ activities)
  // and running in parallel just thrashes the main thread for no wall-clock win.
  const parseOne = useCallback(async (item: QueueItem): Promise<QueueItem> => {
    try {
      const text   = await item.file.text();
      const format = detectFormat(text, item.file.name);
      // Yield once so the UI can paint "parsing…"
      await new Promise((r) => setTimeout(r, 0));
      const sched  = await parseSchedule(item.file);
      return { ...item, status: "ready", format, schedule: sched, rename: sched.project.name };
    } catch (e) {
      return { ...item, status: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  // Enqueue files (drag-drop or file picker), then parse them one by one.
  const enqueue = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const fresh: QueueItem[] = files.map((f) => ({
      id: nextRowId(),
      file: f,
      fileName: f.name,
      status: "queued",
    }));
    setQueue((q) => [...q, ...fresh]);

    setBusy(true);
    for (const item of fresh) {
      // Mark current row as parsing
      setQueue((q) => q.map((r) => (r.id === item.id ? { ...r, status: "parsing" } : r)));
      const parsed = await parseOne(item);
      setQueue((q) => q.map((r) => (r.id === item.id ? parsed : r)));
    }
    setBusy(false);
  }, [parseOne]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files);
    enqueue(files);
  };

  const importOne = async (rowId: string) => {
    const row = queue.find((r) => r.id === rowId);
    if (!row?.schedule) return;
    const finalName = (row.rename ?? row.schedule.project.name).trim() || row.schedule.project.name;
    const tagged: Schedule = {
      ...row.schedule,
      project: { ...row.schedule.project, name: finalName },
    };
    await upload(tagged);
    setQueue((q) => q.map((r) => (r.id === rowId ? { ...r, status: "imported" } : r)));
  };

  const importAllReady = async () => {
    const ready = queue.filter((r) => r.status === "ready");
    if (ready.length === 0) return;
    setBulkImporting(true);
    for (const row of ready) {
      if (!row.schedule) continue;
      const finalName = (row.rename ?? row.schedule.project.name).trim() || row.schedule.project.name;
      const tagged: Schedule = {
        ...row.schedule,
        project: { ...row.schedule.project, name: finalName },
      };
      await upload(tagged);
      setQueue((q) => q.map((r) => (r.id === row.id ? { ...r, status: "imported" } : r)));
    }
    setBulkImporting(false);
  };

  const discardRow = (rowId: string) => {
    setQueue((q) => q.filter((r) => r.id !== rowId));
  };
  const clearImported = () => {
    setQueue((q) => q.filter((r) => r.status !== "imported"));
  };
  const setRename = (rowId: string, val: string) => {
    setQueue((q) => q.map((r) => (r.id === rowId ? { ...r, rename: val } : r)));
  };
  const toggleExpand = (rowId: string) => {
    setQueue((q) => q.map((r) => (r.id === rowId ? { ...r, expanded: !r.expanded } : r)));
  };

  const readyCount    = queue.filter((r) => r.status === "ready").length;
  const errorCount    = queue.filter((r) => r.status === "error").length;
  const importedCount = queue.filter((r) => r.status === "imported").length;
  const parsingCount  = queue.filter((r) => r.status === "parsing" || r.status === "queued").length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Import Schedules</h1>
        <p className="text-sm text-text-secondary mt-1">
          Drop one or many Primavera P6 (.xer) / P6 XML / MSP XML files. Each is parsed independently;
          parsing happens sequentially to keep the UI responsive. Click <strong>Import all ready</strong> when done.
        </p>
      </div>

      {/* Drop zone */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          drag ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
        }`}
      >
        <input
          type="file"
          accept=".xer,.xml"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && enqueue(Array.from(e.target.files))}
        />
        <Files size={36} className="mx-auto text-primary mb-3" />
        <div className="text-sm font-semibold text-text-primary mb-1">Drop schedule files or click to browse</div>
        <div className="text-xs text-text-secondary">
          Bulk supported — select multiple. Primavera P6 XER · P6 XML · MSP XML — up to ~100 MB each
        </div>
      </label>

      {/* Queue summary + bulk action */}
      {queue.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-sm font-semibold text-text-primary">Queue</span>
              <span className="text-text-secondary">·</span>
              <span className="text-text-secondary">{queue.length} file{queue.length === 1 ? "" : "s"}</span>
              {parsingCount > 0  && <Chip color="primary">{parsingCount} parsing</Chip>}
              {readyCount > 0    && <Chip color="success">{readyCount} ready</Chip>}
              {errorCount > 0    && <Chip color="danger">{errorCount} error</Chip>}
              {importedCount > 0 && <Chip color="secondary">{importedCount} imported</Chip>}
            </div>
            <div className="flex items-center gap-2">
              {importedCount > 0 && (
                <button
                  onClick={clearImported}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary"
                >
                  Clear imported
                </button>
              )}
              <button
                onClick={importAllReady}
                disabled={readyCount === 0 || bulkImporting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {bulkImporting ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                Import all ready ({readyCount})
              </button>
              {!busy && readyCount === 0 && parsingCount === 0 && errorCount > 0 && (
                <button
                  onClick={() => router.push("/")}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary"
                >
                  Go to dashboard
                </button>
              )}
              {importedCount > 0 && !bulkImporting && (
                <button
                  onClick={() => router.push("/")}
                  className="text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10"
                >
                  View dashboard
                </button>
              )}
            </div>
          </div>

          <ul className="divide-y divide-border">
            {queue.map((r) => (
              <QueueRow
                key={r.id}
                row={r}
                onRename={(v) => setRename(r.id, v)}
                onImport={() => importOne(r.id)}
                onDiscard={() => discardRow(r.id)}
                onToggleExpand={() => toggleExpand(r.id)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Imported schedules — multi-select */}
      {all.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Imported schedules</h2>
            <span className="text-[11px] text-text-secondary">{selectedIds.length} of {all.length} selected</span>
          </div>
          <ul className="divide-y divide-border">
            {all.map((s) => {
              const sel = selectedIds.includes(s.id);
              return (
                <li key={s.id} className="py-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleSelected(s.id)}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                      sel ? "bg-primary border-primary" : "bg-overlay/[0.04] border-border hover:border-primary/50"
                    }`}
                    aria-label={sel ? "Deselect" : "Select"}
                  >
                    {sel && <Check size={12} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {s.project.name}
                      {sel && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-primary font-semibold">
                          On dashboard
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-secondary">
                      {s.project.source.replace("_", " ")} · {s.activities.length.toLocaleString()} activities ·
                      imported {new Date(s.project.importedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(s.id)}
                    className="text-text-secondary hover:text-danger p-1"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  row, onRename, onImport, onDiscard, onToggleExpand,
}: {
  row: QueueItem;
  onRename: (v: string) => void;
  onImport: () => void;
  onDiscard: () => void;
  onToggleExpand: () => void;
}) {
  const Icon =
    row.status === "parsing"  ? Loader2 :
    row.status === "ready"    ? FileCheck2 :
    row.status === "imported" ? Check :
    row.status === "error"    ? AlertCircle : Upload;
  const iconClass =
    row.status === "parsing"  ? "text-primary animate-spin" :
    row.status === "ready"    ? "text-success" :
    row.status === "imported" ? "text-success" :
    row.status === "error"    ? "text-danger" : "text-text-secondary";

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <Icon size={18} className={`shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary truncate max-w-[420px]">{row.fileName}</span>
            {row.status === "queued"   && <span className="text-[10px] uppercase tracking-wider text-text-secondary">Queued</span>}
            {row.status === "parsing"  && <span className="text-[10px] uppercase tracking-wider text-primary">Parsing…</span>}
            {row.status === "imported" && <span className="text-[10px] uppercase tracking-wider text-success">Imported</span>}
            {row.status === "error"    && <span className="text-[10px] uppercase tracking-wider text-danger">Error</span>}
          </div>

          {row.status === "ready" && row.schedule && (
            <div className="text-[11px] text-text-secondary mt-0.5">
              {row.format} · {row.schedule.activities.length.toLocaleString()} activities ·
              {" "}{row.schedule.wbs.length} WBS · {row.schedule.calendars.length} cal
              {row.schedule.warnings.length > 0 && (
                <span className="text-warning"> · {row.schedule.warnings.length} warnings</span>
              )}
            </div>
          )}
          {row.status === "imported" && row.schedule && (
            <div className="text-[11px] text-text-secondary mt-0.5">
              {row.schedule.activities.length.toLocaleString()} activities · added to dashboard
            </div>
          )}
          {row.status === "error" && (
            <div className="text-[11px] text-danger mt-0.5 truncate">{row.error}</div>
          )}

          {/* Inline rename + per-row import — only when ready */}
          {row.status === "ready" && row.schedule && row.expanded && (
            <div className="mt-3">
              <label className="block text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-1.5">
                Project name override
              </label>
              <input
                value={row.rename ?? row.schedule.project.name}
                onChange={(e) => onRename(e.target.value)}
                placeholder={row.schedule.project.name}
                className="w-full px-3 py-1.5 text-xs bg-overlay/[0.04] border border-border rounded-lg text-text-primary outline-none focus:border-primary/50"
              />
              <p className="text-[10px] text-text-secondary mt-1">
                Parsed name: {row.schedule.project.name}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {row.status === "ready" && (
            <>
              <button
                onClick={onToggleExpand}
                className="text-text-secondary hover:text-text-primary p-1"
                title={row.expanded ? "Hide name override" : "Rename"}
              >
                {row.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button
                onClick={onImport}
                className="text-xs px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 font-medium"
              >
                Import
              </button>
            </>
          )}
          {row.status !== "imported" && (
            <button
              onClick={onDiscard}
              className="text-text-secondary hover:text-danger p-1"
              title="Remove from queue"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({ color, children }: { color: "primary" | "success" | "danger" | "secondary"; children: React.ReactNode }) {
  const cls =
    color === "primary"   ? "bg-primary/10 text-primary border-primary/30" :
    color === "success"   ? "bg-success/10 text-success border-success/30" :
    color === "danger"    ? "bg-danger/10 text-danger border-danger/30" :
                            "bg-overlay/[0.05] text-text-secondary border-border";
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}
