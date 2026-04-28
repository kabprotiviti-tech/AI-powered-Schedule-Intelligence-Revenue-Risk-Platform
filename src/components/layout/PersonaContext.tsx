"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Persona } from "@/lib/types";

type Ctx = { persona: Persona; setPersona: (p: Persona) => void };
const PersonaCtx = createContext<Ctx | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersonaState] = useState<Persona>("PMO");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("nexus-persona") : null;
    if (saved === "CEO" || saved === "PMO" || saved === "Planner") setPersonaState(saved);
  }, []);

  const setPersona = (p: Persona) => {
    setPersonaState(p);
    if (typeof window !== "undefined") localStorage.setItem("nexus-persona", p);
  };

  return <PersonaCtx.Provider value={{ persona, setPersona }}>{children}</PersonaCtx.Provider>;
}

export function usePersona() {
  const ctx = useContext(PersonaCtx);
  if (!ctx) throw new Error("usePersona must be used within PersonaProvider");
  return ctx;
}
