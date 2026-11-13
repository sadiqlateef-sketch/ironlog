"use client";

import { useCallback, useEffect, useState } from "react";
import { loadGoals, NUTRITION_EVENT, saveGoals } from "@/lib/offline/nutrition-store";
import { emptyGoals, type NutritionGoals } from "@/lib/nutrition/goals";

/** The food goals, from the phone first. Unset until the user sets them. */
export function useNutritionGoals(): {
  goals: NutritionGoals;
  loading: boolean;
  save: (next: NutritionGoals) => Promise<NutritionGoals>;
} {
  const [goals, setGoals] = useState<NutritionGoals>(emptyGoals);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const load = () =>
      loadGoals()
        .then((g) => {
          if (live) {
            setGoals(g);
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

  const save = useCallback(async (next: NutritionGoals) => {
    const saved = await saveGoals(next);
    setGoals(saved);
    return saved;
  }, []);

  return { goals, loading, save };
}
