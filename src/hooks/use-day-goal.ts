"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNutritionGoals } from "@/hooks/use-nutrition-goals";
import { useActiveProgram } from "@/components/up-next";
import { kvGet, kvSet } from "@/lib/offline/kv";
import { listDay, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { listSessionsSince } from "@/lib/workout-api";
import { foodDay } from "@/lib/nutrition/day";
import { dayTotals } from "@/lib/nutrition/entry-math";
import { resolveDayGoal, type DayGoal, type NutritionGoals } from "@/lib/nutrition/goals";
import { phaseFor, type PhaseNow } from "@/lib/nutrition/phase-goal";
import { normalizeOverride, trainingDay, type DayTypeOverride, type TrainingDayReason } from "@/lib/nutrition/training-day";
import { todayAllowance, weekDays, type Allowance, type DayEaten } from "@/lib/nutrition/banking";

const overrideKey = (day: string) => `nutrition-daytype:${day}`;

export interface DayGoalState {
  goals: NutritionGoals;
  goal: DayGoal | null;
  training: boolean;
  reason: TrainingDayReason;
  override: DayTypeOverride;
  setOverride: (v: DayTypeOverride) => Promise<void>;
  /** Banking on: today's goal with the week's balance applied. */
  allowance: Allowance | null;
  phase: PhaseNow;
  loading: boolean;
}

/**
 * The goal for one food day: the user's goals, whether it's a training day
 * (their choice for the day, else a logged workout), the active program's
 * phase, and with banking on, the week so far.
 */
export function useDayGoal(day: string | null, dayStart: string): DayGoalState {
  const { goals, loading } = useNutritionGoals();
  const progress = useActiveProgram();
  const [overrides, setOverrides] = useState<Record<string, DayTypeOverride>>({});
  const [sessions, setSessions] = useState<Record<string, number>>({});
  const [eaten, setEaten] = useState<Record<string, DayEaten | undefined>>({});
  const week = useMemo(() => (day ? weekDays(day) : []), [day]);
  const bankingOn = goals.banking.on;

  useEffect(() => {
    if (!week.length) return;
    let live = true;
    void Promise.all(week.map(async (d) => [d, normalizeOverride(await kvGet<unknown>(overrideKey(d)))] as const)).then((list) => {
      if (live) setOverrides(Object.fromEntries(list));
    });
    const [y, m, d] = week[0].split("-").map(Number);
    // A day early, so a workout just after midnight on a late day start still counts.
    listSessionsSince(new Date(y, m - 1, d - 1))
      .then((list) => {
        if (!live) return;
        const count: Record<string, number> = {};
        for (const s of list) {
          const fd = foodDay(new Date(s.start_time), dayStart);
          count[fd] = (count[fd] ?? 0) + 1;
        }
        setSessions(count);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [week, dayStart]);

  useEffect(() => {
    if (!bankingOn || !day || !week.length) return;
    let live = true;
    const load = () => {
      const before = week.filter((d) => d < day);
      void Promise.all(
        before.map(async (d) => {
          const entries = (await listDay(d).catch(() => [])).filter((e) => e.status !== "planned");
          if (!entries.length) return [d, undefined] as const;
          const t = dayTotals(entries).energy;
          return [d, { energy: t.value, complete: t.state !== "incomplete" }] as const;
        }),
      ).then((list) => {
        if (live) setEaten(Object.fromEntries(list));
      });
    };
    load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, load);
    };
  }, [bankingOn, day, week]);

  const phase = phaseFor(goals, progress ?? null);
  const typeOf = useCallback(
    (d: string) => trainingDay({ sessionsOnDay: sessions[d] ?? 0, override: overrides[d] ?? null }),
    [sessions, overrides],
  );
  const goalFor = (d: string) => resolveDayGoal(goals, d, { training: typeOf(d).training, phaseMode: phase.mode, deload: phase.deload });

  const today = day ? typeOf(day) : { training: false, reason: "none" as const };
  const goal = day ? goalFor(day) : null;
  let allowance: Allowance | null = null;
  if (day && goal && bankingOn) {
    const byDay = Object.fromEntries(week.map((d) => [d, goalFor(d)?.energy ?? null]));
    allowance = todayAllowance(byDay, eaten, day, goals.banking);
  }

  const setOverride = useCallback(
    async (v: DayTypeOverride) => {
      if (!day) return;
      await kvSet(overrideKey(day), v);
      setOverrides((o) => ({ ...o, [day]: v }));
    },
    [day],
  );

  return {
    goals,
    goal,
    training: today.training,
    reason: today.reason,
    override: day ? (overrides[day] ?? null) : null,
    setOverride,
    allowance,
    phase,
    loading,
  };
}
