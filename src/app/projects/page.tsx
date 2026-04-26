import { PROJECTS } from "@/lib/data/mock";
import { formatAED, healthColor, ragColor } from "@/lib/calculations";
import { RAGBadge } from "@/components/ui/RAGBadge";
import Link from "next/link";
import { ArrowUpRight, Filter } from "lucide-react";

export default function ProjectsPage() {
  const byRag = {
    Red: PROJECTS.filter((p) => p.ragStatus === "Red"),
    Amber: PROJECTS.filter((p) => p.ragStatus === "Amber"),
    Green: PROJECTS.filter((p) => p.ragStatus === "Green"),
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">All Projects</h1>
          <p className="text-sm text-text-secondary mt-0.5">PMO governance view — {PROJECTS.length} active projects</p>
        </div>
        <button className="flex items-center gap-2 text-xs text-text-secondary border border-border bg-card px-3 py-1.5 rounded-lg hover:border-primary/40 transition-colors">
          <Filter size={13} />
          Filter & Sort
        </button>
      </div>

      {/* RAG sections */}
      {(["Red", "Amber", "Green"] as const).map((rag) => (
        <section key={rag}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: ragColor(rag) }} />
            <h2 className="text-sm font-semibold text-text-primary">{rag} — {byRag[rag].length} Project{byRag[rag].length !== 1 ? "s" : ""}</h2>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {byRag[rag].map((p) => (
              <Link href={`/projects/${p.id}`} key={p.id} className="block group">
                <div className={`bg-card border rounded-xl p-5 hover:border-primary/30 transition-all h-full ${rag === "Red" ? "border-danger/20" : rag === "Amber" ? "border-warning/20" : "border-success/20"}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors truncate">{p.name}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{p.location}</div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <RAGBadge status={p.ragStatus} size="sm" />
                      <ArrowUpRight size={14} className="text-text-muted group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  {/* Health bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-text-secondary uppercase tracking-wider">Health Score</span>
                      <span className="text-xs font-semibold font-mono" style={{ color: healthColor(p.healthScore) }}>{p.healthScore}/100</span>
                    </div>
                    <div className="h-1.5 bg-border-subtle rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.healthScore}%`, background: healthColor(p.healthScore) }} />
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center">
                      <div className="text-[10px] text-text-secondary mb-0.5">SPI</div>
                      <div className="text-sm font-mono font-bold" style={{ color: p.spi >= 0.95 ? "#10b981" : p.spi >= 0.85 ? "#f59e0b" : "#ef4444" }}>{p.spi.toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-text-secondary mb-0.5">Complete</div>
                      <div className="text-sm font-mono font-bold text-text-primary">{p.percentComplete}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-text-secondary mb-0.5">Delay</div>
                      <div className={`text-sm font-mono font-bold ${p.delayDays > 0 ? "text-danger" : "text-success"}`}>
                        {p.delayDays > 0 ? `+${p.delayDays}d` : `${Math.abs(p.delayDays)}d`}
                      </div>
                    </div>
                  </div>

                  {/* Revenue at risk */}
                  <div className={`rounded-lg px-3 py-2 ${rag === "Red" ? "bg-danger/8" : rag === "Amber" ? "bg-warning/8" : "bg-success/8"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary uppercase tracking-wider">Revenue at Risk</span>
                      <span className={`text-xs font-bold ${rag === "Red" ? "text-danger" : rag === "Amber" ? "text-warning" : "text-success"}`}>
                        {formatAED(p.revenueAtRisk)}
                      </span>
                    </div>
                  </div>

                  {/* Top risk */}
                  <div className="mt-3 text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                    ⚠ {p.topRisk}
                  </div>

                  {/* Milestone strip */}
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[10px] text-text-secondary">Milestones:</span>
                    {p.milestones.slice(0, 6).map((m) => (
                      <div
                        key={m.id}
                        className="w-2 h-2 rounded-full"
                        title={`${m.name}: ${m.status}`}
                        style={{
                          background: m.status === "Complete" ? "#10b981" : m.status === "On Track" ? "#3b82f6" : m.status === "At Risk" ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
