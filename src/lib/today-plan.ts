import { workoutTitle } from "./labels.ts";
import type { TodayPlan } from "../services/ironlogEcosystemSync.ts";
import type { Exercise, ProgramProgress, RoutineExercise } from "./workout-api.ts";

const KG_TO_LB = 2.2046226218;

function repsLabel(t: RoutineExercise): string {
  return t.target_reps_max && t.target_reps_max > t.target_reps
    ? `${t.target_reps}-${t.target_reps_max}`
    : String(t.target_reps);
}

/** What Bujo Tasks sees for `date`: the next program day, or an empty list when there is none. */
export function buildTodayPlan(
  date: string,
  program: ProgramProgress | null,
  targets: RoutineExercise[],
  exercises: Map<string, Exercise>,
): TodayPlan {
  if (!program?.next_routine_id) {
    return { date, routineName: "", programName: program?.program_name ?? "", week: 0, day: 0, exercises: [] };
  }
  return {
    date,
    routineName: workoutTitle(program.next_routine_name ?? ""),
    programName: program.program_name,
    week: program.next_week ?? 0,
    day: program.next_day ?? 0,
    exercises: targets.map((t) => ({
      name: exercises.get(t.exercise_id)?.name ?? "Exercise",
      sets: t.target_sets,
      reps: repsLabel(t),
      weightLb: t.target_weight_kg ? Math.round(t.target_weight_kg * KG_TO_LB * 2) / 2 : null,
    })),
  };
}
