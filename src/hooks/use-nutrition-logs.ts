"use client";

import { useEffect, useState } from "react";
import { listLogs, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import type { Stored } from "@/lib/offline/nutrition-collections";
import type { NutritionLog } from "@/lib/nutrition/hydration";

/** Water and supplement logs the phone has (all days; filter by foodDay), kept fresh on food changes. */
export function useNutritionLogs(): Stored<NutritionLog>[] {
  const [logs, setLogs] = useState<Stored<NutritionLog>[]>([]);
  useEffect(() => {
    let live = true;
    const load = () =>
      listLogs()
        .then((l) => {
          if (live) setLogs(l);
        })
        .catch(() => {});
    void load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, load);
    };
  }, []);
  return logs;
}
