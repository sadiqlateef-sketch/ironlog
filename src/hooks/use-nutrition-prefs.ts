"use client";

import { useCallback, useEffect, useState } from "react";
import { loadPrefs, NUTRITION_EVENT, savePrefs } from "@/lib/offline/nutrition-store";
import { DEFAULT_PREFS } from "@/lib/nutrition/day";
import type { NutritionPrefs } from "@/lib/nutrition/diary-types";

/** The food settings (day start, meal slots), from the phone first. */
export function useNutritionPrefs(): {
  prefs: NutritionPrefs;
  loading: boolean;
  save: (next: NutritionPrefs) => Promise<NutritionPrefs>;
} {
  const [prefs, setPrefs] = useState<NutritionPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const load = () =>
      loadPrefs()
        .then((p) => {
          if (live) {
            setPrefs(p);
            setLoading(false);
          }
        })
        .catch(() => {
          if (live) setLoading(false);
        });
    void load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, load);
    };
  }, []);

  const save = useCallback(async (next: NutritionPrefs) => {
    const saved = await savePrefs(next);
    setPrefs(saved);
    return saved;
  }, []);

  return { prefs, loading, save };
}
