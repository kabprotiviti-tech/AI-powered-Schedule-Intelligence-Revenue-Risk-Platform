// POST /api/admin/migrate?token=BOOTSTRAP_TOKEN
//
// Applies any pending SQL migrations from /prisma/migrations/<name>/migration.sql.
// Tracks applied migrations in a _nexus_migrations table so re-running is a no-op.
//
// Why a custom endpoint instead of `prisma migrate deploy`?
// - We can't run the Prisma CLI from a serverless route at runtime
// - Vercel Postgres is provisioned separately from build time
// - This gives an auditable, idempotent way to bring the schema up to date
//   without local Node or shell access.
//
// Security: requires BOOTSTRAP_TOKEN env var to match ?token= query param.
// Set the token in Vercel Dashboard → Settings → Environment Variables.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";  // need filesystem access for migrations

const LEDGER = `_nexus_migrations`;

async function ensureLedger() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${LEDGER}" (
      "id"          TEXT PRIMARY KEY,
      "applied_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "checksum"    TEXT NOT NULL
    );
  `);
}

async function listAppliedMigrations(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "${LEDGER}";`);
  return new Set(rows.map((r) => r.id));
}

async function listAvailableMigrations(): Promise<{ id: string; sqlPath: string }[]> {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const migrations: { id: string; sqlPath: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sqlPath = path.join(dir, e.name, "migration.sql");
    try {
      await fs.access(sqlPath);
      migrations.push({ id: e.name, sqlPath });
    } catch { /* no migration.sql in this folder */ }
  }
  return migrations.sort((a, b) => a.id.localeCompare(b.id));
}

function checksum(text: string): string {
  // Simple FNV-1a — good enough for change detection, not cryptographic.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `fnv1a_${h.toString(16)}`;
}

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const expected = process.env.BOOTSTRAP_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "BOOTSTRAP_TOKEN env var not set. Generate a long random string and set it in Vercel Dashboard → Project → Settings → Environment Variables.",
      },
      { status: 503 },
    );
  }
  const got = req.nextUrl.searchParams.get("token");
  if (got !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid or missing token." }, { status: 401 });
  }
  return null;
}

// ── GET: dry-run, show what would be applied ──────────────────────────────
export async function GET(req: NextRequest) {
  const authErr = await authorize(req);
  if (authErr) return authErr;

  try {
    await ensureLedger();
    const applied   = await listAppliedMigrations();
    const available = await listAvailableMigrations();
    const pending   = available.filter((m) => !applied.has(m.id));
    return NextResponse.json({
      ok: true,
      applied:   [...applied].sort(),
      available: available.map((m) => m.id),
      pending:   pending.map((m) => m.id),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// ── POST: actually apply pending migrations ───────────────────────────────
export async function POST(req: NextRequest) {
  const authErr = await authorize(req);
  if (authErr) return authErr;

  const log: string[] = [];
  try {
    await ensureLedger();
    const applied = await listAppliedMigrations();
    const available = await listAvailableMigrations();
    const pending = available.filter((m) => !applied.has(m.id));

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, message: "Schema already up to date.", applied: [...applied] });
    }

    for (const m of pending) {
      const sql = await fs.readFile(m.sqlPath, "utf-8");
      const stmts = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));
      for (const stmt of stmts) {
        await prisma.$executeRawUnsafe(stmt);
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${LEDGER}" ("id","checksum") VALUES ($1,$2);`,
        m.id,
        checksum(sql),
      );
      log.push(`Applied ${m.id} (${stmts.length} stmts)`);
    }

    return NextResponse.json({ ok: true, applied: pending.map((m) => m.id), log });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), log },
      { status: 500 },
    );
  }
}
