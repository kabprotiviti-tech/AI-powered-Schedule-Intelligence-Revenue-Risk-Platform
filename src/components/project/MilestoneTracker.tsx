import { CheckCircle2, Circle, AlertCircle, XCircle } from "lucide-react";
import { formatAED } from "@/lib/calculations";
import type { Milestone } from "@/lib/types";

const icons = {
  Complete: { icon: CheckCircle2, color: "text-success" },
  "On Track": { icon: Circle, color: "text-primary" },
  "At Risk": { icon: AlertCircle, color: "text-warning" },
  Delayed: { icon: XCircle, color: "text-danger" },
};

export function MilestoneTracker({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="space-y-2">
      {milestones.map((m) => {
        const { icon: Icon, color } = icons[m.status];
        return (
          <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface border border-border hover:border-border transition-colors">
            <Icon size={16} className={`${color} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">{m.name}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-text-secondary">
                  Planned: <span className="text-text-primary font-mono">{m.plannedDate}</span>
                </span>
                {m.delayDays > 0 && (
                  <span className="text-[10px] text-danger font-semibold">+{m.delayDays}d delay</span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                m.status === "Complete" ? "text-success bg-success/10" :
                m.status === "On Track" ? "text-primary bg-primary/10" :
                m.status === "At Risk" ? "text-warning bg-warning/10" :
                "text-danger bg-danger/10"
              }`}>{m.status}</div>
              {m.revenueImpact > 0 && (
                <div className="text-[10px] text-text-secondary mt-1">{formatAED(m.revenueImpact)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
