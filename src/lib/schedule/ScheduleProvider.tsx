"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Schedule } from "./types";
import type { ClassifierOverrideInput, AssetType, Tier } from "./classifier";
import {
  getSelectedIds,
  listSchedules,
  saveSchedule as dbSave,
  setSelectedIds as dbSetSelected,
  toggleSelected as dbToggle,
  deleteSchedule as dbDelete,
  listOverrides,
  setOverride as dbSetOverride,
  clearOverride as dbClearOverride,
} from "./store";
import { clearAnalyticsCache } from "./analytics";
import { clearPortfolioCache } from "./portfolio";

interface Ctx {
  all: Schedule[];                // every imported schedule
  selectedIds: string[];          // currently shown on dashboard
  selected: Schedule[];           // helper: all.filter(selected)
  active: Schedule | null;        // first selected — for single-schedule pages
  loading: boolean;
  // Classifier overrides — manual reclassifications keyed by schedule id
  overrides: Map<string, ClassifierOverrideInput>;
  setOverride: (scheduleId: string, assetType: AssetType, tier: Tier) => Promise<void>;
  clearOverride: (scheduleId: string) => Promise<void>;
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
  const [overrides, setOverridesState] = useState<Map<string, ClassifierOverrideInput>>(() => new Map());
  const [loading, setLoading]       = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [list, ids, ovs] = await Promise.all([listSchedules(), getSelectedIds(), listOverrides()]);
      setAll(list);
      setSelectedIdsState(ids);
      const map = new Map<string, ClassifierOverrideInput>();
      for (const o of ovs) map.set(o.scheduleId, { assetType: o.assetType, tier: o.tier });
      setOverridesState(map);
    } catch {
      setAll([]);
      setSelectedIdsState([]);
      setOverridesState(new Map());
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
    clearAnalyticsCache(id);
    clearPortfolioCache();
    await refresh();
  }, [refresh]);

  const setOverride = useCallback(async (scheduleId: string, assetType: AssetType, tier: Tier) => {
    await dbSetOverride({ scheduleId, assetType, tier, setAt: new Date().toISOString() });
    clearAnalyticsCache(scheduleId);
    clearPortfolioCache();
    await refresh();
  }, [refresh]);

  const clearOverride = useCallback(async (scheduleId: string) => {
    await dbClearOverride(scheduleId);
    clearAnalyticsCache(scheduleId);
    clearPortfolioCache();
    await refresh();
  }, [refresh]);

  const selected = useMemo(() => {
    const map = new Map(all.map((s) => [s.id, s]));
    return selectedIds.map((id) => map.get(id)).filter((s): s is Schedule => !!s);
  }, [all, selectedIds]);

  const active = selected[0] ?? null;

  return (
    <ScheduleCtx.Provider
      value={{ all, selectedIds, selected, active, loading, overrides, setOverride, clearOverride, refresh, upload, setSelected, toggleSelected, remove }}
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
