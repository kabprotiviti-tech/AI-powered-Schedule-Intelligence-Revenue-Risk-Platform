import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatAED } from "@/lib/calculations";
import type { Project } from "@/lib/types";

export function EscalationQueue({ projects }: { projects: Project[] }) {
  const escalations = projects
    .filter((p) => p.ragStatus === "Red" || (p.ragStatus === "Amber" && p.spi < 0.88))
    .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk)
    .slice(0, 5);

  return (
    <div className="bg-card border border-danger/20 rounded-xl p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={15} className="text-danger" />
        <h2 className="text-sm font-semibold text-text-primary">Escalation Queue</h2>
        <span className="ml-auto text-[10px] bg-danger/10 text-danger border border-danger/20 rounded-full px-2 py-0.5 font-semibold">
          {escalations.length} items
        </span>
      </div>

      <div className="space-y-3">
        {escalations.map((p, i) => (
          <Link href={`/projects/${p.id}`} key={p.id} className="block">
            <div className="rounded-lg bg-surface border border-border p-3 hover:border-danger/30 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="text-xs font-semibold text-text-primary leading-tight">{p.name}</div>
                <ArrowRight size={12} className="text-text-secondary flex-shrink-0 mt-0.5" />
              </div>
              <div className="text-[11px] text-danger font-medium mb-1">{p.topRisk}</div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">{p.projectManager}</span>
                <span className="text-[11px] font-semibold text-warning">{formatAED(p.revenueAtRisk)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
