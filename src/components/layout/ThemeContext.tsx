"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "aldar" | "protiviti";

type Ctx = { theme: Theme; setTheme: (t: Theme) => void };
const ThemeCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "nexus-theme";
const isTheme = (v: string | null): v is Theme =>
  v === "dark" || v === "light" || v === "aldar" || v === "protiviti";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (isTheme(saved)) setThemeState(saved);
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
