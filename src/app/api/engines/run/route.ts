// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
import { NextRequest, NextResponse } from "next/server";
import { PROJECTS as mockProjects } from "@/lib/data/mock";
import { projectToEngineRequest } from "@/lib/engines/adapter";
import { runEngines } from "@/lib/engines/orchestrator";
import type { EngineId } from "@/lib/engines/core/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project_id, engines, options } = body as {
      project_id: string;
      engines?:   EngineId[];
      options?:   { mc_iterations?: number; mc_seed?: number };
    };

    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const project = mockProjects.find((p) => p.id === project_id);
    if (!project) {
      return NextResponse.json({ error: `Project "${project_id}" not found` }, { status: 404 });
    }

    const request = projectToEngineRequest(project, options);

    // Allow caller to override which engines to run
    if (engines && engines.length > 0) {
      request.engines = engines;
    }

    const result = await runEngines(request);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("project_id");
  if (!id) {
    return NextResponse.json(
      mockProjects.map((p) => ({ id: p.id, name: p.name }))
    );
  }
  const project = mockProjects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ id: project.id, name: project.name, available: true });
}
