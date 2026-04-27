import type {
  EngineId, EngineOutput, ValidationResult,
  ExecutionContext, ExecutionOptions,
  ScheduleActivity, ActivityRelationship,
} from "./types";

// ─── Canonical input every engine receives ───────────────────────────────────

export interface EngineInput {
  project_id:        string;
  update_id:         string;
  activities:        ScheduleActivity[];
  relationships:     ActivityRelationship[];
  project_start_id:  string;
  project_finish_id: string;
  data_date:         string;             // ISO date — the P6 data date
  planned_finish:    string;             // contractual finish date
  project_budget:    number;             // total BAC in AED
  planned_duration:  number;             // working days from start to planned_finish
  elapsed_duration:  number;             // working days from start to data_date
  options:           ExecutionOptions;
}

// ─── Every engine must satisfy this contract ─────────────────────────────────

export interface IFrameworkEngine<
  TInput  extends EngineInput  = EngineInput,
  TOutput extends EngineOutput = EngineOutput,
> {
  readonly engineId: EngineId;
  readonly version:  string;

  validate(input: TInput): ValidationResult;
  execute(input: TInput, ctx: ExecutionContext): Promise<TOutput>;
  describe(): EngineDescriptor;
}

export interface EngineDescriptor {
  engineId:    EngineId;
  version:     string;
  name:        string;
  description: string;
  inputs:      string[];
  outputs:     string[];
}
