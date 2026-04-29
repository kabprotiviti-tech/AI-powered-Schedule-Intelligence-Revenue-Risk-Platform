"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Schedule } from "./types";
import {
  getSelectedIds,
  listSchedules,
  saveSchedule as dbSave,
  setSelectedIds as dbSetSelected,
  toggleSelected as dbToggle,
  deleteSchedule as dbDelete,
} from "./store";

interface Ctx {
  all: Schedule[];                // every imported schedule
  selectedIds: string[];          // currently shown on dashboard
  selected: Schedule[];           // helper: all.filter(selected)
  active: Schedule | null;        // first selected — for single-schedule pages
  loading: boolean;
  refresh: () => Promise<void>;
  upload: (s: Schedule) => Promise<void>;
  setSelected: (ids: string[]) => Promise<void>;
  toggleSelected: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const ScheduleCtx = createContext<Ctx | null>(null);

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [all, setAll]               = useState<Schedule[]>([]);
  const [selectedIds, setSelectedIdsState] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [list, ids] = await Promise.all([listSchedules(), getSelectedIds()]);
      setAll(list);
      setSelectedIdsState(ids);
    } catch {
      setAll([]);
      setSelectedIdsState([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(async (s: Schedule) => {
    await dbSave(s); // also adds to selection
    await refresh();
  }, [refresh]);

  const setSelected = useCallback(async (ids: string[]) => {
    await dbSetSelected(ids);
    await refresh();
  }, [refresh]);

  const toggleSelected = useCallback(async (id: string) => {
    await dbToggle(id);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await dbDelete(id);
    await refresh();
  }, [refresh]);

  const selected = useMemo(() => {
    const map = new Map(all.map((s) => [s.id, s]));
    return selectedIds.map((id) => map.get(id)).filter((s): s is Schedule => !!s);
  }, [all, selectedIds]);

  const active = selected[0] ?? null;

  return (
    <ScheduleCtx.Provider
      value={{ all, selectedIds, selected, active, loading, refresh, upload, setSelected, toggleSelected, remove }}
    >
      {children}
    </ScheduleCtx.Provider>
  );
}

export function useSchedule(): Ctx {
  const ctx = useContext(ScheduleCtx);
  if (!ctx) throw new Error("useSchedule must be used within ScheduleProvider");
  return ctx;
}
