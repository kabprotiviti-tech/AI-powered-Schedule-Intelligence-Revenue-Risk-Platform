// IndexedDB persistence for parsed schedules.
// Multi-select: meta.selectedIds is the list of schedules currently shown
// on the dashboard. Empty list ⇒ nothing selected; the dashboard shows an
// "import or pick a schedule" empty state.
//
// Classifier overrides: persisted manual reclassifications. The classifier
// is heuristic; when it gets a project wrong the user can pin the correct
// asset/tier and the override always wins downstream.
import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { Schedule } from "./types";
import type { AssetType, Tier } from "./classifier";

const DB_NAME    = "nexus-schedules";
const DB_VERSION = 3;

export interface ClassifierOverride {
  scheduleId: string;
  assetType:  AssetType;
  tier:       Tier;
  setAt:      string; // ISO
  setBy?:     string; // future: user email when auth lands
}

interface NexusDB extends DBSchema {
  schedules: { key: string; value: Schedule };
  meta:      { key: string; value: { selectedIds: string[] } };
  classifierOverrides: { key: string; value: ClassifierOverride };
}

let dbPromise: Promise<IDBPDatabase<NexusDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NexusDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on server."));
  }
  if (!dbPromise) {
    dbPromise = openDB<NexusDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains("schedules")) db.createObjectStore("schedules");
        if (!db.objectStoreNames.contains("meta"))      db.createObjectStore("meta");
        if (oldVersion < 2) {
          // v1 → v2: single activeId → selectedIds[]. Existing meta gets overwritten on next set.
        }
        if (oldVersion < 3) {
          // v2 → v3: classifier overrides store
          if (!db.objectStoreNames.contains("classifierOverrides")) {
            db.createObjectStore("classifierOverrides");
          }
        }
      },
    });
  }
  return dbPromise;
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function saveSchedule(s: Schedule): Promise<void> {
  const db = await getDB();
  await db.put("schedules", s, s.id);
  // Add this schedule to the selection (cumulative-by-default).
  const ids = await getSelectedIds();
  if (!ids.includes(s.id)) {
    await setSelectedIds([...ids, s.id]);
  }
}

export async function listSchedules(): Promise<Schedule[]> {
  const db = await getDB();
  return db.getAll("schedules");
}

export async function getSchedule(id: string): Promise<Schedule | undefined> {
  const db = await getDB();
  return db.get("schedules", id);
}

export async function getSelectedIds(): Promise<string[]> {
  const db   = await getDB();
  const meta = await db.get("meta", "selection");
  return Array.isArray(meta?.selectedIds) ? meta!.selectedIds : [];
}

export async function setSelectedIds(ids: string[]): Promise<void> {
  const db = await getDB();
  await db.put("meta", { selectedIds: ids }, "selection");
}

export async function toggleSelected(id: string): Promise<void> {
  const ids = await getSelectedIds();
  await setSelectedIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("schedules", id);
  const ids = await getSelectedIds();
  if (ids.includes(id)) await setSelectedIds(ids.filter((x) => x !== id));
}

export async function clearAllSchedules(): Promise<void> {
  const db = await getDB();
  await db.clear("schedules");
  await setSelectedIds([]);
}

// ── Classifier overrides ──────────────────────────────────────────────────
export async function listOverrides(): Promise<ClassifierOverride[]> {
  const db = await getDB();
  return db.getAll("classifierOverrides");
}

export async function setOverride(o: ClassifierOverride): Promise<void> {
  const db = await getDB();
  await db.put("classifierOverrides", o, o.scheduleId);
}

export async function clearOverride(scheduleId: string): Promise<void> {
  const db = await getDB();
  await db.delete("classifierOverrides", scheduleId);
}
