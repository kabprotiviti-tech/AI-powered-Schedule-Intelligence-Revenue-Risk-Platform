// IndexedDB persistence for parsed schedules.
// Schemas can be 50–500 MB; localStorage cannot hold them.
import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { Schedule } from "./types";

const DB_NAME    = "nexus-schedules";
const DB_VERSION = 1;

interface NexusDB extends DBSchema {
  schedules: { key: string; value: Schedule };
  meta:      { key: string; value: { activeId: string | null } };
}

let dbPromise: Promise<IDBPDatabase<NexusDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NexusDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on server."));
  }
  if (!dbPromise) {
    dbPromise = openDB<NexusDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("schedules")) db.createObjectStore("schedules");
        if (!db.objectStoreNames.contains("meta"))      db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function saveSchedule(s: Schedule): Promise<void> {
  const db = await getDB();
  await db.put("schedules", s, s.id);
  await db.put("meta", { activeId: s.id }, "active");
}

export async function listSchedules(): Promise<Schedule[]> {
  const db = await getDB();
  return db.getAll("schedules");
}

export async function getSchedule(id: string): Promise<Schedule | undefined> {
  const db = await getDB();
  return db.get("schedules", id);
}

export async function getActiveSchedule(): Promise<Schedule | undefined> {
  const db   = await getDB();
  const meta = await db.get("meta", "active");
  if (!meta?.activeId) return undefined;
  return db.get("schedules", meta.activeId);
}

export async function setActiveSchedule(id: string): Promise<void> {
  const db = await getDB();
  await db.put("meta", { activeId: id }, "active");
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("schedules", id);
  const meta = await db.get("meta", "active");
  if (meta?.activeId === id) await db.put("meta", { activeId: null }, "active");
}

export async function clearAllSchedules(): Promise<void> {
  const db = await getDB();
  await db.clear("schedules");
  await db.put("meta", { activeId: null }, "active");
}
