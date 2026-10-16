// Next-session adjustments. A plain rule (double progression) decides WHAT kind
// of change is warranted; Claude explains it and may fine-tune the numbers, but
// its numbers are clamped so a bad answer can never prescribe something unsafe.

import { z } from "zod";
import { formatKg, roundLoadKg, type UnitSystem } from "./units.ts";

export type Action = "increase" | "hold" | "deload" | "adjust_reps";

export interface Target {
  routine_exercise_id: string;
  exercise_name: string;
  is_lower_body: boolean;
  target_sets: number;
  target_reps: number;
  target_reps_max: number | null;
  target_weight_kg: number | null;
}

export interface LoggedSet {
  weight: number; // kg
  reps: number;
}

export interface RuleResult {
  routine_exercise_id: string;
  action: Action;
  current_weight_kg: number | null;
  suggested_weight_kg: number | null;
  suggested_reps: number | null;
  suggested_reps_max: number | null;
  reason: string;
  /** Facts handed to Claude so it can explain the call. */
  facts: string;
  /** Fell short of the target reps or sets (counts toward an early deload). */
  missed: boolean;
}

/**
 * Double progression:
 *  - every target set done at the top of the range  -> add weight
 *  - missed the bottom of the range by 1-2 reps      -> hold the weight, aim again
 *  - missed by 3+ reps or did under half the sets    -> deload ~10%
 *  - a range of 1 rep missed often, but weight is light -> widen the rep range
 */
export function ruleFor(t: Target, sets: LoggedSet[], unit: UnitSystem): RuleResult {
  const top = t.target_reps_max ?? t.target_reps;
  const working = sets.filter((s) => s.reps > 0);
  const weight = t.target_weight_kg ?? (working.length ? Math.max(...working.map((s) => s.weight)) : null);
  const repsLog = working.map((s) => s.reps).join(", ") || "none";
  const facts = `${t.exercise_name}: target ${t.target_sets} × ${t.target_reps}${t.target_reps_max ? `-${t.target_reps_max}` : ""}${weight ? ` @ ${formatKg(weight, unit)}` : ""}; logged reps: ${repsLog}`;
  const base = {
    routine_exercise_id: t.routine_exercise_id,
    current_weight_kg: weight,
    suggested_reps: null,
    suggested_reps_max: null,
    facts,
    missed: false,
  };

  const worstMiss = Math.max(0, ...working.map((s) => t.target_reps - s.reps));
  const missedSets = Math.max(0, t.target_sets - working.length) + working.filter((s) => s.reps < t.target_reps).length;

  if (working.length >= t.target_sets && working.slice(0, t.target_sets).every((s) => s.reps >= top) && weight) {
    const step = t.is_lower_body ? 0.05 : 0.025;
    const minJump = unit === "imperial" ? 2.27 : 2.5; // never round a jump down to zero
    const next = roundLoadKg(Math.max(weight * (1 + step), weight + minJump), unit);
    return { ...base, action: "increase", suggested_weight_kg: next, reason: `Hit the top of the range on every set. Add weight to ${formatKg(next, unit)}.` };
  }

  if (missedSets === 0) {
    return { ...base, action: "hold", suggested_weight_kg: null, reason: "All sets in range. Keep the weight and add reps." };
  }

  if (worstMiss >= 3 || working.length < Math.ceil(t.target_sets / 2)) {
    const next = weight ? roundLoadKg(weight * 0.9, unit) : null;
    return {
      ...base,
      missed: true,
      action: "deload",
      suggested_weight_kg: next,
      reason: next ? `Missed the target by ${worstMiss || "several"} reps. Drop about 10% to ${formatKg(next, unit)} and rebuild.` : "Missed the target by a lot. Use a lighter weight next time.",
    };
  }

  return {
    ...base,
    missed: true,
    action: "hold",
    suggested_weight_kg: weight,
    reason: `Missed by ${worstMiss} rep${worstMiss === 1 ? "" : "s"} on ${missedSets} set${missedSets === 1 ? "" : "s"}. Keep the weight and try again.`,
  };
}

// ---------- One whole workout ----------

export const LOWER_BODY = new Set(["quads", "hamstrings", "glutes", "adductors", "abductors", "calves", "lower_back"]);

export interface PlannedExercise {
  id: string;
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  target_reps_max: number | null;
  target_weight_kg: number | string | null;
  exercises: { name: string; primary_muscle: string } | null;
}

export interface DoneSet {
  exercise_id: string;
  exercise_order: number;
  weight: number | string;
  reps: number;
}

/** Judge every exercise you did against the routine. Skipped exercises aren't judged. */
export function judgeSession(targets: PlannedExercise[], sets: DoneSet[], unit: UnitSystem): RuleResult[] {
  const out: RuleResult[] = [];
  // Workouts started from a routine number exercises 1..n in routine order.
  targets.forEach((t, i) => {
    const logged: LoggedSet[] = sets
      .filter((s) => s.exercise_order === i + 1 && s.exercise_id === t.exercise_id)
      .map((s) => ({ weight: Number(s.weight), reps: s.reps }));
    if (logged.length === 0) return;
    out.push(
      ruleFor(
        {
          routine_exercise_id: t.id,
          exercise_name: t.exercises?.name ?? "Exercise",
          is_lower_body: LOWER_BODY.has(t.exercises?.primary_muscle ?? ""),
          target_sets: t.target_sets,
          target_reps: t.target_reps,
          target_reps_max: t.target_reps_max,
          target_weight_kg: t.target_weight_kg == null ? null : Number(t.target_weight_kg),
        },
        logged,
        unit,
      ),
    );
  });
  return out;
}

// ---------- Early deload ----------

/** A rough workout: you fell short on at least half of the exercises you did. */
export function isRough(results: Pick<RuleResult, "missed">[]): boolean {
  return results.length > 0 && results.filter((r) => r.missed).length * 2 >= results.length;
}

/**
 * Time for a deload now? Yes when this workout was rough and so was at least
 * one of the two before it (in the same program, since the last deload). One
 * bad day is noise; two out of three is fatigue piling up.
 */
export function needsEarlyDeload(thisWorkout: Pick<RuleResult, "missed">[], earlier: Pick<RuleResult, "missed">[][]): boolean {
  return isRough(thisWorkout) && earlier.slice(0, 2).some(isRough);
}

export function earlyDeloadReason(thisWorkout: Pick<RuleResult, "missed">[], earlier: Pick<RuleResult, "missed">[][]): string {
  const recent = [thisWorkout, ...earlier.slice(0, 2)];
  const rough = recent.filter(isRough).length;
  return `You fell short of your targets in ${rough} of your last ${recent.length} workouts. That's usually fatigue, not lost strength. A lighter week now (half the sets, about 10% less weight) lets you recover and come back stronger.`;
}

// ---------- Claude's refinement ----------

export const AdjustmentOutput = z.object({
  suggestions: z.array(
    z.object({
      routine_exercise_id: z.string(),
      action: z.enum(["increase", "hold", "deload", "adjust_reps"]),
      suggested_weight_kg: z.number().nullable(),
      suggested_reps: z.number().int().nullable(),
      suggested_reps_max: z.number().int().nullable(),
      reason: z.string().describe("One or two plain sentences for the lifter, mentioning the numbers"),
    }),
  ),
});
export type AdjustmentOutput = z.infer<typeof AdjustmentOutput>;

export const ADJUST_SYSTEM_PROMPT = `You are a strength coach reviewing one finished workout against its plan.
For each exercise you get the plan, what was logged, and a baseline suggestion from a double-progression rule.
Return one suggestion per exercise for the NEXT session. Follow the baseline unless the context clearly supports
something better (for example, a rep-range change instead of a deload when the lifter keeps falling just short,
or holding instead of increasing after a long layoff). Weights are in kilograms. Keep reasons short, friendly and specific.`;

/**
 * Keep Claude's numbers inside safe bounds around the current weight:
 * at most +10% up or -20% down in one step, rounded to loadable plates,
 * and rep targets between 1 and 30.
 */
export function clampSuggestion(
  ai: AdjustmentOutput["suggestions"][number],
  rule: RuleResult,
  unit: UnitSystem,
): Omit<RuleResult, "facts" | "missed"> {
  const cur = rule.current_weight_kg;
  let weight = ai.suggested_weight_kg;
  if (weight != null && cur) {
    weight = roundLoadKg(Math.min(cur * 1.1, Math.max(cur * 0.8, weight)), unit);
  } else if (weight != null) {
    weight = roundLoadKg(Math.max(0, weight), unit);
  }
  let reps = ai.suggested_reps != null ? Math.min(30, Math.max(1, ai.suggested_reps)) : null;
  let repsMax = ai.suggested_reps_max != null ? Math.min(30, Math.max(1, ai.suggested_reps_max)) : null;
  if (reps != null && repsMax != null && repsMax <= reps) repsMax = null;
  if (reps == null) repsMax = null;
  // A deload must actually go down; an increase must actually go up.
  if (ai.action === "deload" && cur && weight != null && weight >= cur) weight = rule.suggested_weight_kg;
  if (ai.action === "increase" && cur && weight != null && weight <= cur) weight = rule.suggested_weight_kg;
  // Only a rep-range change changes reps.
  if (ai.action !== "adjust_reps") {
    reps = null;
    repsMax = null;
  }
  return {
    routine_exercise_id: rule.routine_exercise_id,
    action: ai.action,
    current_weight_kg: cur,
    suggested_weight_kg: weight,
    suggested_reps: reps,
    suggested_reps_max: repsMax,
    reason: ai.reason.trim().slice(0, 300) || rule.reason,
  };
}
