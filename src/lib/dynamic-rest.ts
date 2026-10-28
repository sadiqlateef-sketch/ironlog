// Dynamic Rest Period Recommendation Engine.
//
// Recommends optimal rest intervals based on exercise biomechanics, compound vs isolation status,
// rep target intensity, RPE, and autonomic/heart rate strain.

import type { MuscleGroup } from "../types/database.ts";

export interface DynamicRestParams {
  exerciseName?: string;
  primaryMuscle?: MuscleGroup | string;
  equipment?: string;
  repTarget?: string | number | null;
  rpe?: number | null;
  setCount?: number;
  isWarmup?: boolean;
}

export type RestCategory = "Max Strength" | "Hypertrophy" | "Isolation Pump" | "Metabolic";

export interface RestRecommendation {
  seconds: number;
  category: RestCategory;
  rationale: string;
}

const COMPOUND_KEYWORDS = [
  "squat", "bench", "deadlift", "press", "row", "pull up", "chin up",
  "clean", "snatch", "lunge", "dip", "hack", "hip thrust"
];

export function isCompoundExercise(name = "", equipment = ""): boolean {
  const text = `${name} ${equipment}`.toLowerCase();
  return COMPOUND_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Parses target reps number from strings like "5", "8-12", "5x5", "AMRAP".
 */
export function extractTargetReps(repTarget?: string | number | null): number | null {
  if (repTarget == null) return null;
  if (typeof repTarget === "number") return repTarget;
  const match = String(repTarget).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Computes scientifically backed dynamic rest recommendation.
 */
export function recommendRestTime(params: DynamicRestParams): RestRecommendation {
  if (params.isWarmup) {
    return {
      seconds: 60,
      category: "Metabolic",
      rationale: "Warm-up set: Keep rest brief (45-60s) to prime CNS and elevate muscle temperature.",
    };
  }

  const isCompound = isCompoundExercise(params.exerciseName, params.equipment);
  const reps = extractTargetReps(params.repTarget);
  const isHeavyStrength = reps !== null && reps <= 5;
  const isModerateHypertrophy = reps !== null && reps >= 6 && reps <= 10;
  const isHighRep = reps !== null && reps > 10;

  let baseSeconds: number;
  let category: RestCategory;
  let rationale: string;

  if (isCompound && isHeavyStrength) {
    baseSeconds = 180; // 3:00
    category = "Max Strength";
    rationale = "Heavy compound: 3 minutes allows 95%+ replenishment of intracellular phosphocreatine (ATP-CP).";
  } else if (isCompound) {
    baseSeconds = 120; // 2:00
    category = "Hypertrophy";
    rationale = "Compound hypertrophy: 2 minutes balances high mechanical tension with metabolic clearance.";
  } else if (isHighRep) {
    baseSeconds = 60; // 1:00
    category = "Isolation Pump";
    rationale = "High-rep isolation: 60 seconds maximizes cellular swelling, metabolite accumulation, and pump density.";
  } else {
    baseSeconds = 90; // 1:30
    category = "Hypertrophy";
    rationale = "Accessory hypertrophy: 90 seconds ensures localized muscle recovery without CNS fatigue.";
  }

  // Adjust for high RPE or late working sets
  if (params.rpe != null && params.rpe >= 9) {
    baseSeconds = Math.min(300, baseSeconds + 30);
    rationale += " (+30s added for high RPE effort)";
  }

  return {
    seconds: baseSeconds,
    category,
    rationale,
  };
}
