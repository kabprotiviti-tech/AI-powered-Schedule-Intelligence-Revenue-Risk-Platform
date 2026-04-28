"use client";
import { useState } from "react";
import { Building2, BarChart2, Wrench } from "lucide-react";
import clsx from "clsx";
import type { Persona } from "@/lib/types";

const PERSONAS: { id: Persona; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "CEO",     label: "CEO",     icon: Building2, desc: "Portfolio & Revenue Risk" },
  { id: "PMO",     label: "PMO",     icon: BarChart2, desc: "Governance & Milestones" },
  { id: "Planner", label: "Planner", icon: Wrench,    desc: "Activity Detail & Root Cause" },
];

export function PersonaSwitcher() {
  const [active, setActive] = useState<Persona>("PMO");

  return (
    <div className="flex items-center gap-0.5 bg-white/[0.04] border border-border rounded-xl p-1">
      {PERSONAS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActive(id)}
          title={PERSONAS.find((p) => p.id === id)?.desc}
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
            active === id
              ? "bg-primary text-white shadow-sm"
              : "text-text-secondary hover:text-text-primary hover:bg-white/[0.05]",
          )}
        >
          <Icon size={12} strokeWidth={active === id ? 2.5 : 1.8} />
          {label}
        </button>
      ))}
    </div>
  );
}
