"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileCheck2, AlertCircle, Loader2, ArrowRight, Trash2, Check } from "lucide-react";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";
import { parseSchedule, detectFormat } from "@/lib/schedule/parsers";
import type { Schedule } from "@/lib/schedule/types";

interface FileState {
  fileName: string;
  status: "parsing" | "ready" | "error";
  format?: string;
  error?: string;
  schedule?: Schedule;
}

export default function UploadPage() {
  const { selectedIds, all, upload, toggleSelected, remove } = useSchedule();
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState<FileState | null>(null);
  const [name, setName] = useState("");      // editable project name
  const router = useRouter();

  // Whenever a fresh parse completes, prefill the name input with the parsed name
  useEffect(() => {
    if (pending?.status === "ready" && pending.schedule) {
      setName(pending.schedule.project.name);
    }
  }, [pending?.status, pending?.schedule]);

  const handleFile = useCallback(async (file: File) => {
    setPending({ fileName: file.name, status: "parsing" });
    setName("");
    await new Promise((r) => setTimeout(r, 0));
    try {
      const text = await file.text();
      const format = detectFormat(text, file.name);
      await new Promise((r) => setTimeout(r, 0));
      const sched  = await parseSchedule(file);
      setPending({ fileName: file.name, status: "ready", format, schedule: sched });
    } catch (e) {
      console.error("Schedule parse failed:", e);
      setPending({
        fileName: file.name,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const confirm = async () => {
    if (!pending?.schedule) return;
    const finalName = name.trim() || pending.schedule.project.name;
    const tagged: Schedule = {
      ...pending.schedule,
      project: { ...pending.schedule.project, name: finalName },
    };
    await upload(tagged);
    setPending(null);
    setName("");
    router.push("/");
  };

  const isSelected = (id: string) => selectedIds.includes(id);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Import Schedule</h1>
        <p className="text-sm text-text-secondary mt-1">
          Drop a Primavera P6 (.xer) or P6/MSP XML file. Native .mpp must be exported to XML first.
          Multiple schedules can be selected at once — the dashboard shows cumulative analytics across all selected.
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
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Upload size={36} className="mx-auto text-primary mb-3" />
        <div className="text-sm font-semibold text-text-primary mb-1">Drop schedule file or click to browse</div>
        <div className="text-xs text-text-secondary">
          Primavera P6 XER · Primavera P6 XML · Microsoft Project XML — up to ~100 MB
        </div>
      </label>

      {/* Pending state */}
      {pending && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start gap-3">
            {pending.status === "parsing" && <Loader2 size={20} className="text-primary animate-spin mt-0.5" />}
            {pending.status === "ready"   && <FileCheck2 size={20} className="text-success mt-0.5" />}
            {pending.status === "error"   && <AlertCircle size={20} className="text-danger mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate">{pending.fileName}</div>
              <div className="text-xs text-text-secondary mt-0.5">
                {pending.status === "parsing" && "Parsing…"}
                {pending.status === "ready" && pending.schedule && (
                  <>
                    {pending.format} · {pending.schedule.activities.length.toLocaleString()} activities ·{" "}
                    {pending.schedule.wbs.length} WBS nodes · {pending.schedule.calendars.length} calendars
                    {pending.schedule.warnings.length > 0 && (
                      <span className="text-warning"> · {pending.schedule.warnings.length} warnings</span>
                    )}
                  </>
                )}
                {pending.status === "error" && <span className="text-danger">{pending.error}</span>}
              </div>

              {/* Editable project name */}
              {pending.status === "ready" && pending.schedule && (
                <div className="mt-4">
                  <label className="block text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1.5">
                    Project name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={pending.schedule.project.name}
                    className="w-full px-3 py-2 text-sm bg-overlay/[0.04] border border-border rounded-lg text-text-primary outline-none focus:border-primary/50"
                  />
                  <p className="text-[10px] text-text-secondary mt-1">
                    Override the schedule&rsquo;s parsed project name (default: {pending.schedule.project.name}).
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={confirm}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition-opacity"
                    >
                      Import &amp; add to dashboard
                      <ArrowRight size={12} />
                    </button>
                    <button
                      onClick={() => { setPending(null); setName(""); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
              const sel = isSelected(s.id);
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
