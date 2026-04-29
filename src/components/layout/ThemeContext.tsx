"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Theme =
  // Dark
  | "midnight"   // deep navy + electric blue
  | "carbon"     // pure black + cyan
  | "forest"     // dark green + sage
  | "plum"       // dark purple + magenta
  // Light
  | "daylight"   // clean white + blue
  | "linen"      // warm cream + amber
  | "mint"       // cool white + teal
  | "graphite";  // light slate + indigo

export const ALL_THEMES: Theme[] = [
  "midnight", "carbon", "forest", "plum",
  "daylight", "linen", "mint", "graphite",
];

type Ctx = { theme: Theme; setTheme: (t: Theme) => void };
const ThemeCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "nexus-theme";
const isTheme = (v: string | null): v is Theme =>
  v !== null && (ALL_THEMES as string[]).includes(v);

// Migrate legacy theme ids stored in localStorage
function migrateLegacy(saved: string | null): Theme | null {
  if (!saved) return null;
  switch (saved) {
    case "dark":      return "midnight";
    case "light":     return "daylight";
    case "aldar":     return "linen";
    case "protiviti": return "carbon";
  }
  return isTheme(saved) ? saved : null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("midnight");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const t = migrateLegacy(saved);
    if (t) setThemeState(t);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, t);
  };

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
