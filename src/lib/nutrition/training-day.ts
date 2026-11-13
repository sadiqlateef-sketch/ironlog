// Is a food day a training day (for the training-day goal)?
// The user's own choice for the day wins; then a logged workout; then a
// workout the program plans for that day. Pure, no app imports.

export type DayTypeOverride = "training" | "rest" | null;

export interface TrainingDayInput {
  /** Workouts logged on the day. */
  sessionsOnDay: number;
  /** What the user set for this day, if anything. */
  override?: DayTypeOverride;
  /** The program plans a workout today. */
  plannedSlot?: boolean;
}

export type TrainingDayReason = "override" | "logged" | "planned" | "none";

export function trainingDay(input: TrainingDayInput): { training: boolean; reason: TrainingDayReason } {
  if (input.override === "training") return { training: true, reason: "override" };
  if (input.override === "rest") return { training: false, reason: "override" };
  if (input.sessionsOnDay > 0) return { training: true, reason: "logged" };
  if (input.plannedSlot) return { training: true, reason: "planned" };
  return { training: false, reason: "none" };
}

export function isTrainingDay(input: TrainingDayInput): boolean {
  return trainingDay(input).training;
}

export function normalizeOverride(raw: unknown): DayTypeOverride {
  return raw === "training" || raw === "rest" ? raw : null;
}
