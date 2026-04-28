// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
/**
 * Report data builder — runs engines and assembles ReportMeta.
 * Shared by both the Excel and PDF API routes.
 */
import { PROJECTS }                from "@/lib/data/mock";
import { projectToEngineRequest }  from "@/lib/engines/adapter";
import { runEngines }              from "@/lib/engines/orchestrator";
import type { OrchestratorResult } from "@/lib/engines/orchestrator";
import type { ReportMeta }         from "./types";

// ─── In-memory cache (5-min TTL) ─────────────────────────────────────────────
const cache = new Map<string, { result: OrchestratorResult; ts: number }>();
const TTL   = 5 * 60_000;

export async function getEngineResult(projectId: string): Promise<OrchestratorResult | null> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.ts < TTL) return hit.result;

  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;

  const req = projectToEngineRequest(project);

  const input: EngineInput = {
    project_id:        req.project_id,
    update_id:         req.update_id,
    activities:        req.activities,
    relationships:     req.relationships,
    project_start_id:  req.project_start_id,
    project_finish_id: req.project_finish_id,
    data_date:         req.data_date,
    planned_finish:    req.planned_finish,
    project_budget:    req.project_budget,
    planned_duration:  req.planned_duration,
    elapsed_duration:  req.elapsed_duration,
    options:           req.options ?? {},
  };

  const ctx = {
    execution_id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    project_id:   projectId,
    update_id:    req.update_id,
    triggered_by: "report",
    dry_run:      false,
  };

  const result = await runEngines({
    ...req,
    engines: ["DCMA", "CPM", "EVM", "MONTE_CARLO"],
    options: req.options ?? {},
  });

  cache.set(projectId, { result, ts: Date.now() });
  return result;
}

export function buildMeta(
  projectId: string,
  result:    OrchestratorResult,
  level:     "portfolio" | "project" | "issue" = "project",
): ReportMeta {
  const project = PROJECTS.find((p) => p.id === projectId)!;

  return {
    title:         `Schedule Analysis Report — ${project.name}`,
    project_id:    projectId,
    project_name:  project.name,
    project_type:  project.type ?? "Unknown",
    update_id:     result.update_id ?? "BL-01",
    data_date:     project.data_date ?? new Date().toISOString().slice(0, 10),
    generated_at:  new Date().toISOString(),
    generated_by:  "NEXUS SRP v0.1",
    version:       "v0.1.0",
    level,
    data_source:   `DCMA Engine · CPM Engine · EVM Engine · Monte Carlo · ${result.summary.engines_run.length} engines run`,
  };
}
