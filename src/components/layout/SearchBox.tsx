"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";

export function SearchBox() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const router   = useRouter();
  const { active } = useSchedule();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    if (!active) return [];
    const term = q.trim().toLowerCase();
    const acts = active.activities;
    if (!term) return acts.slice(0, 8);
    return acts
      .filter((a) =>
        a.code.toLowerCase().includes(term) ||
        a.name.toLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [q, active]);

  useEffect(() => setActiveIdx(0), [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      router.push(`/activity/${results[activeIdx].id}`);
      setOpen(false);
      setQ("");
    }
  };

  const placeholder = active ? `Search ${active.activities.length.toLocaleString()} activities…` : "Import a schedule to search…";

  return (
    <div ref={wrapRef} className="relative flex-1 max-w-xs">
      {!open ? (
        <button
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          disabled={!active}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-overlay/[0.04] border border-border rounded-xl text-sm text-text-secondary cursor-pointer hover:border-primary/40 hover:bg-overlay/[0.06] transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search size={13} className="group-hover:text-primary transition-colors" />
          <span className="text-sm truncate">{placeholder}</span>
          <kbd className="ml-auto text-[10px] bg-border-subtle px-1.5 py-0.5 rounded-md border border-border text-text-muted font-mono">
            ⌘K
          </kbd>
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-overlay/[0.06] border border-primary/40 rounded-xl text-sm">
          <Search size={13} className="text-primary shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search activities by code or name…"
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-secondary"
          />
          <button
            onClick={() => { setQ(""); setOpen(false); }}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Close search"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-scale-in">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-text-secondary">
              {active ? <>No activities match &ldquo;{q}&rdquo;</> : "Import a schedule first."}
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((a, i) => (
                <li key={a.id}>
                  <Link
                    href={`/activity/${a.id}`}
                    onClick={() => { setOpen(false); setQ(""); }}
                    className={`flex items-center gap-3 px-3 py-2 text-xs ${i === activeIdx ? "bg-primary/10" : "hover:bg-overlay/[0.03]"}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.isCritical ? "bg-danger" : a.status === "Completed" ? "bg-success" : a.status === "InProgress" ? "bg-primary" : "bg-border"}`} />
                    <span className="font-mono text-text-secondary w-24 shrink-0 truncate">{a.code}</span>
                    <span className="font-medium text-text-primary truncate flex-1">{a.name}</span>
                    <span className="text-[10px] text-text-secondary uppercase tracking-wide shrink-0">{a.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
