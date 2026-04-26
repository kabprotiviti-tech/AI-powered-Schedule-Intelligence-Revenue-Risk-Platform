"use client";
import { useState } from "react";
import { Building2, BarChart2, Wrench } from "lucide-react";
import clsx from "clsx";
import type { Persona } from "@/lib/types";

const PERSONAS: { id: Persona; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "CEO", label: "CEO", icon: Building2, desc: "Portfolio & Revenue Risk" },
  { id: "PMO", label: "PMO", icon: BarChart2, desc: "Governance & Milestones" },
  { id: "Planner", label: "Planner", icon: Wrench, desc: "Activity Detail & Root Cause" },
];

export function PersonaSwitcher() {
  const [active, setActive] = useState<Persona>("PMO");

  return (
    <div className="flex items-center gap-1 bg-border-subtle border border-border rounded-lg p-0.5">
      {PERSONAS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActive(id)}
          title={PERSONAS.find((p) => p.id === id)?.desc}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            active === id
              ? "bg-primary text-white"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}
