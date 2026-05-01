// GET /api/health — production sanity check.
//
// Returns:
//   200 { status: "ok",    db: { connected: true,  latencyMs } }
//   503 { status: "error", db: { connected: false, error } }
//
// Use this to verify Vercel Postgres provisioning end-to-end.
// Configured cron / monitoring can ping this for uptime.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// No caching — always reflect live DB state.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const start = Date.now();
  try {
    // Lightest possible round-trip
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: {
        connected: true,
        latencyMs: Date.now() - start,
      },
      app: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
        env:    process.env.VERCEL_ENV ?? "development",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        db: {
          connected: false,
          error: e instanceof Error ? e.message : String(e),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
