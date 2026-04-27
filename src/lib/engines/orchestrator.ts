import type { EngineId, EngineOutput, ExecutionOptions } from "./core/types";
import type { EngineInput } from "./core/interface";
import { EngineRegistry } from "./core/registry";
import { DCMAEngine }        from "./dcma/index";
import { CPMEngine }         from "./cpm/index";
import { EVMEngine }         from "./evm/index";
import { MonteCarloEngine }  from "./monte-carlo/index";
import type { ScheduleActivity, ActivityRelationship } from "./core/types";

export interface OrchestratorRequest {
  project_id:        string;
  update_id:         string;
  activities:        ScheduleActivity[];
  relationships:     ActivityRelationship[];
  project_start_id:  string;
  project_finish_id: string;
  data_date:         string;
  planned_finish:    string;
  project_budget:    number;
  planned_duration:  number;
  elapsed_duration:  number;
  engines:           EngineId[];
  options?:          ExecutionOptions;
  triggered_by?:     string;
}

export interface OrchestratorResult {
  execution_id: string;
  project_id:   string;
  completed_at: string;
  duration_ms:  number;
  results:      Partial<Record<EngineId, EngineOutput>>;
  errors:       Partial<Record<EngineId, string>>;
  summary: {
    engines_run:     EngineId[];
    engines_failed:  EngineId[];
    overall_score:   number;           // mean of all engine scores
    highest_risk:    string;           // engine with lowest score
  };
}

// Execution groups — CPM must run before Monte Carlo (MC uses CPM internally)
const EXECUTION_GROUPS: EngineId[][] = [
  ["DCMA", "CPM", "EVM"],
  ["MONTE_CARLO"],
];

// Build and cache the registry once
const globalRegistry = new EngineRegistry()
  .register(new DCMAEngine())
  .register(new CPMEngine())
  .register(new EVMEngine())
  .register(new MonteCarloEngine());

export { globalRegistry };

export async function runEngines(request: OrchestratorRequest): Promise<OrchestratorResult> {
  const t0           = Date.now();
  const execution_id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const options      = request.options ?? {};

  const ctx = {
    execution_id,
    project_id:   request.project_id,
    update_id:    request.update_id,
    triggered_by: request.triggered_by ?? "api",
    dry_run:      false,
  };

  const input: EngineInput = {
    project_id:        request.project_id,
    update_id:         request.update_id,
    activities:        request.activities,
    relationships:     request.relationships,
    project_start_id:  request.project_start_id,
    project_finish_id: request.project_finish_id,
    data_date:         request.data_date,
    planned_finish:    request.planned_finish,
    project_budget:    request.project_budget,
    planned_duration:  request.planned_duration,
    elapsed_duration:  request.elapsed_duration,
    options,
  };

  const results:  Partial<Record<EngineId, EngineOutput>> = {};
  const errors:   Partial<Record<EngineId, string>>       = {};

  for (const group of EXECUTION_GROUPS) {
    const toRun = group.filter((id) => request.engines.includes(id));
    if (toRun.length === 0) continue;

    // Run group in parallel
    await Promise.all(
      toRun.map(async (engineId) => {
        try {
          const engine     = globalRegistry.get(engineId);
          const validation = engine.validate(input);

          if (!validation.valid) {
            errors[engineId] = `Validation failed: ${validation.errors.join("; ")}`;
            return;
          }

          const output = await engine.execute(input, ctx);
          results[engineId] = output;
        } catch (err) {
          errors[engineId] = err instanceof Error ? err.message : String(err);
        }
      })
    );
  }

  const scores        = Object.values(results).map((r) => r.summary.score);
  const overallScore  = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const worstEngine   = (Object.entries(results) as [EngineId, EngineOutput][])
    .sort((a, b) => a[1].summary.score - b[1].summary.score)[0]?.[0] ?? "N/A";

  return {
    execution_id,
    project_id:   request.project_id,
    completed_at: new Date().toISOString(),
    duration_ms:  Date.now() - t0,
    results,
    errors,
    summary: {
      engines_run:    Object.keys(results) as EngineId[],
      engines_failed: Object.keys(errors)  as EngineId[],
      overall_score:  overallScore,
      highest_risk:   worstEngine as string,
    },
  };
}
