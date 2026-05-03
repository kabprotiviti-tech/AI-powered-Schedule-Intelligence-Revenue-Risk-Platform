-- Migration 20260501000000_init — Phase 1.1: User table
-- Generated to match prisma/schema.prisma. Applied via /api/admin/migrate.
-- Idempotent (CREATE ... IF NOT EXISTS) so re-running is safe.

CREATE TABLE IF NOT EXISTS "User" (
  "id"        TEXT         NOT NULL,
  "email"     TEXT         NOT NULL,
  "name"      TEXT,
  "image"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_email_idx"          ON "User"("email");
