"use client";
import { EmptyState } from "@/components/ui/EmptyState";

export default function RisksPage() {
  return (
    <EmptyState
      title="Risk register — coming in Phase 2"
      message="Risk register will be auto-derived from DCMA violations, critical-path constraints, and schedule slip drivers once schedule is imported. Phase 2 build."
    />
  );
}
