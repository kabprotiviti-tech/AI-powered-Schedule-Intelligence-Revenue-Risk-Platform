import { PROJECTS } from "@/lib/data/mock";
import { formatAED } from "@/lib/calculations";
import { RAGBadge } from "@/components/ui/RAGBadge";
import Link from "next/link";

export default function RisksPage() {
  const risks = PROJECTS
    .filter((p) => p.ragStatus !== "Green" || p.revenueAtRisk > 50_000_000)
    .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Risk Register</h1>
        <p className="text-sm text-text-secondary mt-0.5">Auto-generated from schedule analysis · {risks.length} active risks</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm data-table">
          <thead>
            <tr className="text-[11px] text-text-secondary uppercase tracking-wider border-b border-border bg-surface">
              <th className="text-left py-3 px-5 font-medium">Project</th>
              <th className="text-left py-3 px-3 font-medium">Risk Description</th>
              <th className="text-center py-3 px-3 font-medium">Status</th>
              <th className="text-right py-3 px-3 font-medium">Delay</th>
              <th className="text-right py-3 px-3 font-medium">Revenue at Risk</th>
              <th className="text-left py-3 px-5 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {risks.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-primary/3">
                <td className="py-3.5 px-5">
                  <Link href={`/projects/${p.id}`} className="text-sm font-medium text-text-primary hover:text-primary transition-colors">{p.name}</Link>
                  <div className="text-[11px] text-text-secondary">{p.type}</div>
                </td>
                <td className="py-3.5 px-3">
                  <span className="text-xs text-text-secondary max-w-xs block">{p.topRisk}</span>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <RAGBadge status={p.ragStatus} size="sm" />
                </td>
                <td className="py-3.5 px-3 text-right">
                  <span className={`text-xs font-mono font-semibold ${p.delayDays > 0 ? "text-danger" : "text-success"}`}>
                    {p.delayDays > 0 ? `+${p.delayDays}d` : `${Math.abs(p.delayDays)}d ahead`}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right">
                  <span className={`text-xs font-semibold ${p.revenueAtRisk > 500_000_000 ? "text-danger" : p.revenueAtRisk > 100_000_000 ? "text-warning" : "text-text-secondary"}`}>
                    {formatAED(p.revenueAtRisk)}
                  </span>
                </td>
                <td className="py-3.5 px-5">
                  <span className="text-xs text-text-secondary">{p.projectManager}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
