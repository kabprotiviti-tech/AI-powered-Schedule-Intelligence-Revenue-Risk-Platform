"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROJECTS } from "@/lib/data/mock";
import { ragColor } from "@/lib/calculations";

export function SearchBox() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K to focus
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

  // Click outside closes
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return PROJECTS.slice(0, 6);
    return PROJECTS
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          p.contractor?.toLowerCase().includes(term) ||
          p.location?.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [q]);

  useEffect(() => setActiveIdx(0), [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      router.push(`/projects/${results[activeIdx].id}`);
      setOpen(false);
      setQ("");
    }
  };

  return (
    <div ref={wrapRef} className="relative flex-1 max-w-xs">
      {!open ? (
        <button
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-overlay/[0.04] border border-border rounded-xl text-sm text-text-secondary cursor-pointer hover:border-primary/40 hover:bg-overlay/[0.06] transition-all group"
        >
          <Search size={13} className="group-hover:text-primary transition-colors" />
          <span className="text-sm">Search projects, activities…</span>
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
            placeholder="Search projects…"
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-secondary"
          />
          <button
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
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
              No projects match &ldquo;{q}&rdquo;
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                    className={`flex items-center gap-3 px-3 py-2 text-xs ${
                      i === activeIdx ? "bg-primary/10" : "hover:bg-overlay/[0.03]"
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: ragColor(p.ragStatus) }}
                    />
                    <span className="font-medium text-text-primary truncate flex-1">{p.name}</span>
                    <span className="text-[10px] text-text-secondary uppercase tracking-wide">
                      {p.ragStatus}
                    </span>
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
