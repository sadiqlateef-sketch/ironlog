// Which eating phase (bulk / cut / maintain) applies now, from the user's
// choice per training program and whether this is a deload week.
// Pure, no app imports.

import type { NutritionGoals, PhaseMode } from "./goals.ts";

/** The parts of the program progress this needs (workout-api ProgramProgress). */
export interface ProgressLike {
  program_id: string;
  next_is_deload?: boolean;
}

export interface PhaseNow {
  mode: PhaseMode | null;
  deload: boolean;
  programId: string | null;
}

export function phaseFor(goals: NutritionGoals, progress: ProgressLike | null | undefined): PhaseNow {
  if (!progress) return { mode: null, deload: false, programId: null };
  const mode = goals.phase.byProgram[progress.program_id] ?? null;
  return { mode, deload: progress.next_is_deload === true, programId: progress.program_id };
}
