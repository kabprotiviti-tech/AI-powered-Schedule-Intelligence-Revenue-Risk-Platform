"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Schedule } from "./types";
import {
  getActiveSchedule,
  listSchedules,
  saveSchedule as dbSave,
  setActiveSchedule as dbSetActive,
  deleteSchedule as dbDelete,
} from "./store";

interface Ctx {
  active: Schedule | null;
  all: Schedule[];
  loading: boolean;
  refresh: () => Promise<void>;
  upload: (s: Schedule) => Promise<void>;
  switchTo: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const ScheduleCtx = createContext<Ctx | null>(null);

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Schedule | null>(null);
  const [all, setAll]       = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [a, list] = await Promise.all([getActiveSchedule(), listSchedules()]);
      setActive(a ?? null);
      setAll(list);
    } catch {
      setActive(null);
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(async (s: Schedule) => {
    await dbSave(s);
    await refresh();
  }, [refresh]);

  const switchTo = useCallback(async (id: string) => {
    await dbSetActive(id);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await dbDelete(id);
    await refresh();
  }, [refresh]);

  return (
    <ScheduleCtx.Provider value={{ active, all, loading, refresh, upload, switchTo, remove }}>
      {children}
    </ScheduleCtx.Provider>
  );
}

export function useSchedule(): Ctx {
  const ctx = useContext(ScheduleCtx);
  if (!ctx) throw new Error("useSchedule must be used within ScheduleProvider");
  return ctx;
}
