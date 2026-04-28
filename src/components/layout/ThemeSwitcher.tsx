"use client";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Palette, Check, ChevronDown } from "lucide-react";
import { useTheme, type Theme } from "./ThemeContext";

type ThemeOption = {
  id: Theme;
  label: string;
  desc: string;
  swatches: [string, string, string]; // canvas, surface, primary preview
  icon: React.ElementType;
};

const THEMES: ThemeOption[] = [
  {
    id: "dark",
    label: "Midnight",
    desc: "Default dark — deep navy + electric blue",
    swatches: ["#070c18", "#111d2e", "#3b82f6"],
    icon: Moon,
  },
  {
    id: "light",
    label: "Daylight",
    desc: "Clean enterprise white — high readability",
    swatches: ["#f8fafc", "#ffffff", "#2563eb"],
    icon: Sun,
  },
  {
    id: "aldar",
    label: "Aldar Premium",
    desc: "Warm cream + signature gold",
    swatches: ["#faf7f0", "#ffffff", "#b48635"],
    icon: Palette,
  },
  {
    id: "protiviti",
    label: "Protiviti",
    desc: "Slate ink + signature red",
    swatches: ["#0f172a", "#1e293b", "#dc2626"],
    icon: Palette,
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const ActiveIcon = active.icon;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-overlay/[0.04] border border-border text-text-secondary hover:text-text-primary hover:border-border-subtle transition-all"
        title="Theme"
      >
        <ActiveIcon size={13} />
        <span className="text-xs font-medium hidden sm:inline">{active.label}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-scale-in">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary">
              Appearance
            </p>
          </div>
          <ul className="py-1">
            {THEMES.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === theme;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setTheme(t.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-overlay/[0.04] transition-colors ${
                      isActive ? "bg-overlay/[0.04]" : ""
                    }`}
                  >
                    <div className="flex gap-0.5 shrink-0 rounded-md overflow-hidden border border-border">
                      <span className="block w-3 h-7" style={{ background: t.swatches[0] }} />
                      <span className="block w-3 h-7" style={{ background: t.swatches[1] }} />
                      <span className="block w-3 h-7" style={{ background: t.swatches[2] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon size={11} className="text-text-secondary" />
                        <span className="text-xs font-semibold text-text-primary">{t.label}</span>
                      </div>
                      <p className="text-[10px] text-text-secondary mt-0.5 truncate">{t.desc}</p>
                    </div>
                    {isActive && <Check size={13} className="text-primary shrink-0" />}
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
