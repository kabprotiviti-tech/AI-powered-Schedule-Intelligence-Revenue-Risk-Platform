import type { EngineId, EngineOutput } from "./types";
import type { IFrameworkEngine, EngineInput, EngineDescriptor } from "./interface";

export class EngineRegistry {
  private engines = new Map<EngineId, IFrameworkEngine>();

  register(engine: IFrameworkEngine): this {
    this.engines.set(engine.engineId, engine);
    return this;
  }

  get<T extends IFrameworkEngine = IFrameworkEngine>(id: EngineId): T {
    const e = this.engines.get(id);
    if (!e) throw new Error(`Engine '${id}' not registered`);
    return e as T;
  }

  has(id: EngineId): boolean {
    return this.engines.has(id);
  }

  list(): EngineDescriptor[] {
    return [...this.engines.values()].map((e) => e.describe());
  }
}
