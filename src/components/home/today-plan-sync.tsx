"use client";

import { useEffect } from "react";
import { buildTodayPlan } from "@/lib/today-plan";
import { getRoutineTargets, listExercises, type ProgramProgress } from "@/lib/workout-api";
import { IronLogEcosystemSync } from "@/services/ironlogEcosystemSync";

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Renders nothing. Tells Bujo Tasks what today's workout is whenever Home opens or the program moves on. */
export function TodayPlanSync({ program }: { program: ProgramProgress | null | undefined }) {
  const routineId = program?.next_routine_id ?? null;
  useEffect(() => {
    if (program === undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const [targets, list] = await Promise.all([
          routineId ? getRoutineTargets(routineId) : Promise.resolve([]),
          listExercises(),
        ]);
        if (cancelled) return;
        const plan = buildTodayPlan(localToday(), program, targets, new Map(list.map((e) => [e.id, e])));
        await IronLogEcosystemSync.syncTodayPlan(plan);
      } catch {
        // Offline or no data: leave the last published plan as it is.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program === undefined, routineId, program?.next_week, program?.next_day]);
  return null;
}
