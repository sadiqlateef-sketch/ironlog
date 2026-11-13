"use client";

import { useEffect } from "react";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { foodNudgeTime, isNative, scheduleFoodNudge } from "@/lib/native";
import { foodDayFor } from "@/lib/nutrition/day";
import { nextNudgeAt } from "@/lib/nutrition/nudge";
import type { NutritionPrefs } from "@/lib/nutrition/diary-types";
import { listDay, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import type { Shift } from "@/lib/shifts";

/** Work out and (re)schedule the evening food nudge from today's log. No-op on the web or when the nudge is off. */
export async function refreshFoodNudge(prefs: NutritionPrefs, shifts: readonly Shift[]): Promise<void> {
  if (!isNative()) return;
  const time = foodNudgeTime();
  if (time === null) return void (await scheduleFoodNudge(null));
  const now = new Date();
  const entries = await listDay(foodDayFor(now, prefs, shifts)).catch(() => []);
  const logged = entries.some((e) => e.status !== "planned");
  await scheduleFoodNudge(nextNudgeAt(now, prefs, shifts, logged, time));
}

/** Keeps the food nudge in step with the diary. Mount once (Home). */
export function useFoodNudge(): void {
  const { prefs, loading } = useNutritionPrefs();
  const shifts = useWorkShifts();
  useEffect(() => {
    if (loading || !isNative()) return;
    const run = () => void refreshFoodNudge(prefs, shifts);
    run();
    window.addEventListener(NUTRITION_EVENT, run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener(NUTRITION_EVENT, run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [prefs, shifts, loading]);
}
