// Progressive Overload & Periodization Customization Store for IronLog
// Persists customizable overload rules and periodization options.

import { useEffect, useState } from "react";
import type { UnitSystem } from "./units.ts";

export type ProgressionTrigger = "all_sets_top" | "first_set_top" | "two_thirds_top";

export interface OverloadSettings {
  autoApplyPeriodization: boolean;
  currentMesocycleWeek: number;
  totalMesocycleWeeks: number;
  // Double progression weight increments
  upperCompoundIncLb: number; // default 5
  lowerCompoundIncLb: number; // default 10
  isolationIncLb: number; // default 2.5
  upperCompoundIncKg: number; // default 2.5
  lowerCompoundIncKg: number; // default 5
  isolationIncKg: number; // default 1.25
  // Progression trigger condition
  progressionTrigger: ProgressionTrigger;
  // Deload settings
  autoDeloadOnMiss: boolean;
  missRepThreshold: number; // default 3 reps below floor
  deloadPercent: number; // default 10%
}

export const DEFAULT_OVERLOAD_SETTINGS: OverloadSettings = {
  autoApplyPeriodization: true,
  currentMesocycleWeek: 1,
  totalMesocycleWeeks: 6,
  upperCompoundIncLb: 5,
  lowerCompoundIncLb: 10,
  isolationIncLb: 2.5,
  upperCompoundIncKg: 2.5,
  lowerCompoundIncKg: 5,
  isolationIncKg: 1.25,
  progressionTrigger: "all_sets_top",
  autoDeloadOnMiss: true,
  missRepThreshold: 3,
  deloadPercent: 10,
};

const STORAGE_KEY = "ironlog_overload_settings_v1";

export function getStoredOverloadSettings(): OverloadSettings {
  if (typeof window === "undefined") return DEFAULT_OVERLOAD_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OVERLOAD_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_OVERLOAD_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_OVERLOAD_SETTINGS;
  }
}

export function saveOverloadSettings(settings: Partial<OverloadSettings>): OverloadSettings {
  if (typeof window === "undefined") return { ...DEFAULT_OVERLOAD_SETTINGS, ...settings };
  try {
    const current = getStoredOverloadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Dispatch custom event for cross-component reactivity
    window.dispatchEvent(new CustomEvent("ironlog_overload_settings_changed", { detail: updated }));
    return updated;
  } catch {
    return { ...DEFAULT_OVERLOAD_SETTINGS, ...settings };
  }
}

/**
 * React hook to read and update progressive overload and periodization settings.
 */
export function useOverloadSettings() {
  const [settings, setSettings] = useState<OverloadSettings>(getStoredOverloadSettings);

  useEffect(() => {
    // Re-read after mount so the server render (defaults) and the phone match.
    void Promise.resolve().then(() => setSettings(getStoredOverloadSettings()));

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<OverloadSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      } else {
        setSettings(getStoredOverloadSettings());
      }
    };

    window.addEventListener("ironlog_overload_settings_changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ironlog_overload_settings_changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (patch: Partial<OverloadSettings>) => {
    const next = saveOverloadSettings(patch);
    setSettings(next);
  };

  return { settings, update };
}
