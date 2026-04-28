import { PROJECTS } from "@/lib/data/mock";
import { formatAED, ragColor } from "@/lib/calculations";
import { ProjectCard } from "@/components/ui/ProjectCard";
import Link from "next/link";
import { ChevronRight, LayoutGrid } from "lucide-react";

export default function ProjectsPage() {
  const groups = {
    Red:   PROJECTS.filter((p) => p.ragStatus === "Red"),
    Amber: PROJECTS.filter((p) => p.ragStatus === "Amber"),
    Green: PROJECTS.filter((p) => p.ragStatus === "Green"),
  };

  const groupConfig = {
    Red:   { label: "Critical — Immediate Action Required", pulse: true  },
    Amber: { label: "At Risk — Monitoring Required",        pulse: true  },
    Green: { label: "On Track",                             pulse: false },
  };

  // Global card index for stagger
  let globalIdx = 0;

  return (
    <div className="max-w-[1360px] mx-auto space-y-10 pb-12">

      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
            <Link href="/" className="hover:text-primary transition-colors">Portfolio</Link>
            <ChevronRight size={12} />
            <span className="text-text-primary">Projects</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">All Projects</h1>
          <p className="text-sm text-text-secondary mt-1">
            {PROJECTS.length} projects · PMO governance view
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary border border-border rounded-xl px-3 py-1.5 bg-surface">
            <LayoutGrid size={13} />
            Card view
          </div>
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-border bg-surface text-xs">
            {(["Red","Amber","Green"] as const).map((r) => (
              <span key={r} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: ragColor(r) }} />
                <span className="text-text-secondary">{groups[r].length}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* RAG-grouped sections */}
      {(["Red","Amber","Green"] as const).map((rag) => {
        if (groups[rag].length === 0) return null;
        const cfg = groupConfig[rag];
        const riskAED = groups[rag].reduce((s, p) => s + p.revenueAtRisk, 0);

        return (
          <section key={rag} className="animate-fade-up" style={{ animationDelay: `${rag === "Red" ? 0 : rag === "Amber" ? 0.1 : 0.2}s` }}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  background: ragColor(rag),
                  boxShadow: rag !== "Green" ? `0 0 8px ${ragColor(rag)}80` : undefined,
                  animation: cfg.pulse ? (rag === "Red" ? "dot-pulse-red 2s ease-in-out infinite" : "dot-pulse-amber 2.5s ease-in-out infinite") : undefined,
                }}
              />
              <h2 className="text-sm font-semibold text-text-primary">{cfg.label}</h2>
              <span className="text-xs text-text-secondary">
                {groups[rag].length} project{groups[rag].length !== 1 ? "s" : ""} · {formatAED(riskAED)} at risk
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups[rag].map((p) => {
                const idx = globalIdx++;
                return <ProjectCard key={p.id} project={p} index={idx} />;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
