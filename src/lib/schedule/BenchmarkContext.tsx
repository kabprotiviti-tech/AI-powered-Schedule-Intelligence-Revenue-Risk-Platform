"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { ProjectType, Region } from "./benchmarks";

interface Ctx {
  type:   ProjectType;
  region: Region;
  setType:   (t: ProjectType) => void;
  setRegion: (r: Region)      => void;
}
const BenchmarkCtx = createContext<Ctx | null>(null);

export function BenchmarkProvider({ children }: { children: React.ReactNode }) {
  const [type, setTypeState]     = useState<ProjectType>("MixedUse");
  const [region, setRegionState] = useState<Region>("MENA");

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("nexus-bench-type") : null;
    const r = typeof window !== "undefined" ? localStorage.getItem("nexus-bench-region") : null;
    if (t) setTypeState(t as ProjectType);
    if (r) setRegionState(r as Region);
  }, []);

  const setType = (t: ProjectType) => {
    setTypeState(t);
    if (typeof window !== "undefined") localStorage.setItem("nexus-bench-type", t);
  };
  const setRegion = (r: Region) => {
    setRegionState(r);
    if (typeof window !== "undefined") localStorage.setItem("nexus-bench-region", r);
  };

  return (
    <BenchmarkCtx.Provider value={{ type, region, setType, setRegion }}>
      {children}
    </BenchmarkCtx.Provider>
  );
}

export function useBenchmark() {
  const ctx = useContext(BenchmarkCtx);
  if (!ctx) throw new Error("useBenchmark must be used within BenchmarkProvider");
  return ctx;
}
