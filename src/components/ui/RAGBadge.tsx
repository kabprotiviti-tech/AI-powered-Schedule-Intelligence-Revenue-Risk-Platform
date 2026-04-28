import clsx from "clsx";
import type { RAGStatus } from "@/lib/types";

interface Props {
  status: RAGStatus;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function RAGBadge({ status, size = "md", showDot = true }: Props) {
  const styles: Record<RAGStatus, string> = {
    Green: "text-success bg-success/10 border-success/25",
    Amber: "text-warning bg-warning/10 border-warning/25",
    Red:   "text-danger  bg-danger/10  border-danger/25",
  };

  const dotBase: Record<RAGStatus, string> = {
    Green: "bg-success",
    Amber: "bg-warning",
    Red:   "bg-danger",
  };

  const dotPulse: Record<RAGStatus, string> = {
    Green: "",
    Amber: "dot-pulse-amber",
    Red:   "dot-pulse-red",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        styles[status],
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
      )}
    >
      {showDot && (
        <span
          className={clsx(
            "rounded-full flex-shrink-0",
            dotBase[status],
            dotPulse[status],
            size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2",
          )}
        />
      )}
      {status}
    </span>
  );
}
