"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listDay, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { useNutritionSync } from "@/hooks/use-nutrition-sync";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";

/** One food day's entries, from the phone first. Refreshes after any food change or sync. */
export function useNutritionDay(day: string | null): { entries: DiaryEntry[]; loading: boolean; refresh: () => void } {
  const [state, setState] = useState<{ day: string | null; entries: DiaryEntry[] }>({ day: null, entries: [] });
  const request = useRef(0);
  const sync = useNutritionSync();

  const refresh = useCallback(() => {
    if (!day) return;
    const mine = ++request.current;
    listDay(day)
      .then((entries) => {
        if (request.current === mine) setState({ day, entries });
      })
      .catch(() => {
        if (request.current === mine) setState((s) => (s.day === day ? s : { day, entries: [] }));
      });
  }, [day]);

  useEffect(() => {
    refresh();
    window.addEventListener(NUTRITION_EVENT, refresh);
    return () => window.removeEventListener(NUTRITION_EVENT, refresh);
  }, [refresh]);

  // Pull again when the queue empties, so server rows replace the phone's copy.
  const waiting = sync.pending;
  useEffect(() => {
    if (waiting === 0) refresh();
  }, [waiting, refresh]);

  return { entries: state.day === day ? state.entries : [], loading: !day || state.day !== day, refresh };
}

/** The current time, refreshed each minute, so "today" and the current meal roll over by themselves. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    const onVisible = () => setNow(new Date());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}
