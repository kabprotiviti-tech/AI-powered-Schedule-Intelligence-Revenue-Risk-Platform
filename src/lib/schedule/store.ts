// IndexedDB persistence for parsed schedules.
// Schemas can be 50–500 MB; localStorage cannot hold them.
import { openDB, type IDBPDatabase } from "idb";
import type { Schedule } from "./types";

const DB_NAME    = "nexus-schedules";
const DB_VERSION = 1;
const STORE      = "schedules";
const META       = "meta";

interface NexusDB {
  schedules: { key: string; value: Schedule };
  meta:      { key: string; value: { activeId: string | null } };
}

let dbPromise: Promise<IDBPDatabase<NexusDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on server."));
  }
  if (!dbPromise) {
    dbPromise = openDB<NexusDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META))  db.createObjectStore(META);
      },
    });
  }
  return dbPromise;
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function saveSchedule(s: Schedule): Promise<void> {
  const db = await getDB();
  await db.put(STORE, s, s.id);
  await db.put(META, { activeId: s.id }, "active");
}

export async function listSchedules(): Promise<Schedule[]> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE);
  const all  = await Promise.all(keys.map((k) => db.get(STORE, k)));
  return all.filter((x): x is Schedule => !!x);
}

export async function getSchedule(id: string): Promise<Schedule | undefined> {
  const db = await getDB();
  return db.get(STORE, id);
}

export async function getActiveSchedule(): Promise<Schedule | undefined> {
  const db   = await getDB();
  const meta = await db.get(META, "active");
  if (!meta?.activeId) return undefined;
  return db.get(STORE, meta.activeId);
}

export async function setActiveSchedule(id: string): Promise<void> {
  const db = await getDB();
  await db.put(META, { activeId: id }, "active");
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
  const meta = await db.get(META, "active");
  if (meta?.activeId === id) await db.put(META, { activeId: null }, "active");
}

export async function clearAllSchedules(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
  await db.put(META, { activeId: null }, "active");
}
