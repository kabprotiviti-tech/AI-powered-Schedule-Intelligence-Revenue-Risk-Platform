// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
import { NextRequest, NextResponse } from "next/server";
import { PROJECTS as mockProjects } from "@/lib/data/mock";
import { projectToEngineRequest } from "@/lib/engines/adapter";
import { runEngines } from "@/lib/engines/orchestrator";

// In-memory cache keyed by project_id — good enough for demo;
// replace with DB read in production.
const cache = new Map<string, { result: unknown; ts: number }>();
const TTL_MS = 5 * 60 * 1_000; // 5 minutes

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  const force     = req.nextUrl.searchParams.get("force") === "1";

  if (!projectId) {
    return NextResponse.json({ error: "project_id query param required" }, { status: 400 });
  }

  const project = mockProjects.find((p) => p.id === projectId);
  if (!project) {
    return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 });
  }

  const cached = cache.get(projectId);
  if (!force && cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json({ cached: true, ...cached.result as object });
  }

  const request = projectToEngineRequest(project);
  const result  = await runEngines(request);

  cache.set(projectId, { result, ts: Date.now() });
  return NextResponse.json({ cached: false, ...result });
}
