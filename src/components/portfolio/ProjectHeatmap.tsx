"use client";
import Link from "next/link";
import { RAGBadge } from "@/components/ui/RAGBadge";
import { formatAED, healthColor } from "@/lib/calculations";
import type { Project } from "@/lib/types";

export function ProjectHeatmap({ projects }: { projects: Project[] }) {
  const sorted = [...projects].sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Project Portfolio — Risk Matrix</h2>
          <p className="text-xs text-text-secondary mt-0.5">Sorted by revenue at risk. Click any row to drill in.</p>
        </div>
        <Link href="/projects" className="text-xs text-primary hover:underline">View all →</Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm data-table">
          <thead>
            <tr className="text-[11px] text-text-secondary uppercase tracking-wider border-b border-border">
              <th className="text-left py-2 pr-4 font-medium">Project</th>
              <th className="text-center py-2 px-3 font-medium">Status</th>
              <th className="text-right py-2 px-3 font-medium">Health</th>
              <th className="text-right py-2 px-3 font-medium">SPI</th>
              <th className="text-right py-2 px-3 font-medium">Delay</th>
              <th className="text-right py-2 pl-3 font-medium">Revenue at Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {sorted.map((p) => (
              <tr key={p.id} className="transition-colors cursor-pointer group">
                <td className="py-3 pr-4">
                  <Link href={`/projects/${p.id}`} className="block">
                    <div className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors">{p.name}</div>
                    <div className="text-[11px] text-text-secondary">{p.location} · {p.contractor.split(" ").slice(0, 2).join(" ")}</div>
                  </Link>
                </td>
                <td className="py-3 px-3 text-center">
                  <RAGBadge status={p.ragStatus} size="sm" />
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-border-subtle rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.healthScore}%`, background: healthColor(p.healthScore) }} />
                    </div>
                    <span className="text-xs font-mono font-medium w-6" style={{ color: healthColor(p.healthScore) }}>{p.healthScore}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-xs font-mono font-medium" style={{ color: p.spi >= 0.95 ? "#10b981" : p.spi >= 0.85 ? "#f59e0b" : "#ef4444" }}>
                    {p.spi.toFixed(2)}
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className={`text-xs font-mono ${p.delayDays > 0 ? "text-danger" : "text-success"}`}>
                    {p.delayDays > 0 ? `+${p.delayDays}d` : `${Math.abs(p.delayDays)}d ahead`}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right">
                  <span className={`text-xs font-semibold ${p.revenueAtRisk > 500_000_000 ? "text-danger" : p.revenueAtRisk > 100_000_000 ? "text-warning" : "text-text-secondary"}`}>
                    {formatAED(p.revenueAtRisk)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
