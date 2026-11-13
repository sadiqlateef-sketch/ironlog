"use client";

import { useEffect, useState } from "react";
import { NUTRITION_EVENT, phoneDay } from "@/lib/offline/nutrition-store";
import { hasLogged, loggingStreak, type LoggingStreak } from "@/lib/nutrition/streak";
import { addDays } from "@/lib/shifts";

const MAX_DAYS = 366;

/** The food-logging streak up to `today`, from the phone's copy (works offline, no server calls). */
export function useLoggingStreak(today: string | null): LoggingStreak | null {
  const [streak, setStreak] = useState<LoggingStreak | null>(null);
  useEffect(() => {
    if (!today) return;
    let live = true;
    const load = async () => {
      const logged = new Set<string>();
      if (hasLogged(await phoneDay(today))) logged.add(today);
      for (let d = addDays(today, -1), i = 0; i < MAX_DAYS; d = addDays(d, -1), i++) {
        if (!hasLogged(await phoneDay(d))) break;
        logged.add(d);
      }
      if (live) setStreak(loggingStreak((d) => logged.has(d), today, MAX_DAYS));
    };
    void load().catch(() => {});
    const onChange = () => void load().catch(() => {});
    window.addEventListener(NUTRITION_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, onChange);
    };
  }, [today]);
  return streak;
}
