"use client";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Check, ChevronDown } from "lucide-react";
import { useTheme, type Theme } from "./ThemeContext";

type ThemeOption = {
  id: Theme;
  label: string;
  desc: string;
  swatches: [string, string, string]; // canvas, surface/card, primary
};

const DARK_THEMES: ThemeOption[] = [
  { id: "midnight", label: "Midnight", desc: "Deep navy + electric blue",   swatches: ["#070c18", "#111d2e", "#3b82f6"] },
  { id: "carbon",   label: "Carbon",   desc: "Pure black + cyan",            swatches: ["#000000", "#121216", "#06b6d4"] },
  { id: "forest",   label: "Forest",   desc: "Dark green + sage",            swatches: ["#08140f", "#12261e", "#34d399"] },
  { id: "plum",     label: "Plum",     desc: "Dark purple + magenta",        swatches: ["#12091e", "#24163c", "#d946ef"] },
];

const LIGHT_THEMES: ThemeOption[] = [
  { id: "daylight", label: "Daylight", desc: "Clean white + blue",           swatches: ["#f8fafc", "#ffffff", "#2563eb"] },
  { id: "linen",    label: "Linen",    desc: "Warm cream + amber",           swatches: ["#fcf8f0", "#ffffff", "#c27c0e"] },
  { id: "mint",     label: "Mint",     desc: "Cool white + teal",            swatches: ["#f4fbfa", "#ffffff", "#0d9488"] },
  { id: "graphite", label: "Graphite", desc: "Light slate + indigo",         swatches: ["#f1f4f9", "#ffffff", "#4f46e5"] },
];

const ALL_OPTIONS = [...DARK_THEMES, ...LIGHT_THEMES];

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

  const active = ALL_OPTIONS.find((t) => t.id === theme) ?? DARK_THEMES[0];
  const isDarkActive = DARK_THEMES.some((t) => t.id === active.id);
  const ActiveIcon = isDarkActive ? Moon : Sun;

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
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-scale-in">
          {/* Dark group */}
          <div className="px-3 pt-2.5 pb-1.5 border-b border-border flex items-center gap-1.5">
            <Moon size={11} className="text-text-secondary" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary">Night mode</p>
          </div>
          <ul className="py-1">
            {DARK_THEMES.map((t) => (
              <ThemeRow key={t.id} option={t} isActive={t.id === theme} onPick={() => { setTheme(t.id); setOpen(false); }} />
            ))}
          </ul>

          {/* Light group */}
          <div className="px-3 pt-2.5 pb-1.5 border-t border-b border-border flex items-center gap-1.5">
            <Sun size={11} className="text-text-secondary" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary">Day mode</p>
          </div>
          <ul className="py-1">
            {LIGHT_THEMES.map((t) => (
              <ThemeRow key={t.id} option={t} isActive={t.id === theme} onPick={() => { setTheme(t.id); setOpen(false); }} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ThemeRow({ option: t, isActive, onPick }: { option: ThemeOption; isActive: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        onClick={onPick}
        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-overlay/[0.04] transition-colors ${
          isActive ? "bg-overlay/[0.04]" : ""
        }`}
      >
        <div className="flex gap-0.5 shrink-0 rounded-md overflow-hidden border border-border">
          <span className="block w-3 h-6" style={{ background: t.swatches[0] }} />
          <span className="block w-3 h-6" style={{ background: t.swatches[1] }} />
          <span className="block w-3 h-6" style={{ background: t.swatches[2] }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-text-primary">{t.label}</div>
          <p className="text-[10px] text-text-secondary truncate">{t.desc}</p>
        </div>
        {isActive && <Check size={13} className="text-primary shrink-0" />}
      </button>
    </li>
  );
}
