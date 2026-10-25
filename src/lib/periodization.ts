// Scientific Periodization & Double-Progression Engine for IronLog
// Implements mesocycle wave progression (Accumulation -> Intensification -> Peak -> Deload)
// and strict double-progression overload for compounds and isolations with full customization.

import { roundLoadKg, type UnitSystem } from "./units.ts";
import type { OverloadSettings } from "./overload-settings.ts";

export type PeriodizationPhase = "accumulation" | "intensification" | "peak" | "deload";

export interface PhaseInfo {
  phase: PeriodizationPhase;
  label: string;
  description: string;
  repAdjustment: number; // offset to baseline rep target
  loadMultiplier: number; // % multiplier on baseline working weight
  volumeMultiplier: number; // set count multiplier (e.g. 0.5 on deload)
  targetRpe: string;
  rirTarget: string;
  badgeColor: string;
}

export const PHASES: Record<PeriodizationPhase, PhaseInfo> = {
  accumulation: {
    phase: "accumulation",
    label: "Accumulation",
    description: "Volume & work capacity focus. Higher reps to drive hypertrophy stimulus.",
    repAdjustment: +2,
    loadMultiplier: 0.95, // ~70-75% 1RM
    volumeMultiplier: 1.0,
    targetRpe: "RPE 7-8",
    rirTarget: "2-3 RIR",
    badgeColor: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  },
  intensification: {
    phase: "intensification",
    label: "Intensification",
    description: "Mechanical tension focus. Load steps up, reps taper down.",
    repAdjustment: 0,
    loadMultiplier: 1.025, // ~80-82% 1RM (+2.5-5%)
    volumeMultiplier: 1.0,
    targetRpe: "RPE 8-9",
    rirTarget: "1-2 RIR",
    badgeColor: "bg-violet-500/15 text-violet-400 border border-violet-500/30",
  },
  peak: {
    phase: "peak",
    label: "Peak Stimulus",
    description: "Max adaptive stimulus & PR attempt week. Peak loads near technical failure.",
    repAdjustment: -2,
    loadMultiplier: 1.05, // ~85-90% 1RM
    volumeMultiplier: 1.0,
    targetRpe: "RPE 9-10",
    rirTarget: "0-1 RIR",
    badgeColor: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  },
  deload: {
    phase: "deload",
    label: "Deload & Recovery",
    description: "Fatigue dissipation & muscle resensitization. 50% volume cut.",
    repAdjustment: 0,
    loadMultiplier: 0.9, // -10% load
    volumeMultiplier: 0.5, // 50% set volume
    targetRpe: "RPE 5-6",
    rirTarget: "4-5 RIR",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  },
};

/**
 * Classifies any exercise (custom user exercise or standard database) into
 * compound vs isolation and lower body vs upper body.
 */
export function classifyExerciseBiomechanics(ex: {
  name: string;
  slug?: string;
  primary_muscle?: string;
  category?: string;
}): { isCompound: boolean; isLowerBody: boolean } {
  const name = (ex.name || "").toLowerCase();
  const muscle = (ex.primary_muscle || "").toLowerCase();

  const isLowerBody =
    muscle === "quads" ||
    muscle === "hamstrings" ||
    muscle === "glutes" ||
    muscle === "calves" ||
    name.includes("squat") ||
    name.includes("leg") ||
    name.includes("deadlift") ||
    name.includes("rdl") ||
    name.includes("lunge") ||
    name.includes("hip thrust") ||
    name.includes("hack") ||
    name.includes("calf");

  // Isolation keywords
  const isExplicitIsolation =
    name.includes("curl") ||
    name.includes("extension") ||
    name.includes("raise") ||
    name.includes("fly") ||
    name.includes("flye") ||
    name.includes("shrug") ||
    name.includes("pullover") ||
    name.includes("crossover") ||
    name.includes("kickback") ||
    name.includes("pushdown") ||
    name.includes("crunch") ||
    muscle === "biceps" ||
    muscle === "triceps" ||
    muscle === "calves" ||
    muscle === "abs" ||
    muscle === "forearms";

  const isCompound = !isExplicitIsolation;

  return { isCompound, isLowerBody };
}

/**
 * Maps a given week number in a mesocycle (default 6-week block) to its periodization phase:
 * Week 1-2: Accumulation
 * Week 3-4: Intensification
 * Week 5: Peak Stimulus
 * Week 6: Deload
 */
export function getPhaseForWeek(week: number, totalWeeks = 6): PhaseInfo {
  const normWeek = ((week - 1) % totalWeeks) + 1;
  if (totalWeeks <= 4) {
    if (normWeek === 1) return PHASES.accumulation;
    if (normWeek === 2) return PHASES.intensification;
    if (normWeek === 3) return PHASES.peak;
    return PHASES.deload;
  }
  if (totalWeeks === 6) {
    if (normWeek <= 2) return PHASES.accumulation;
    if (normWeek <= 4) return PHASES.intensification;
    if (normWeek === 5) return PHASES.peak;
    return PHASES.deload;
  }
  // Generic N-week mesocycle
  if (normWeek <= Math.round(totalWeeks * 0.4)) return PHASES.accumulation;
  if (normWeek < totalWeeks - 1) return PHASES.intensification;
  if (normWeek === totalWeeks) return PHASES.deload;
  return PHASES.peak;
}

export interface PeriodizedTarget {
  exerciseId: string;
  exerciseName: string;
  isCompound: boolean;
  isLowerBody: boolean;
  baseWeightKg: number | null;
  baseSets: number;
  baseReps: number;
  baseRepsMax: number | null;
  periodizedWeightKg: number | null;
  periodizedSets: number;
  periodizedReps: number;
  periodizedRepsMax: number | null;
  phase: PhaseInfo;
  progressionNote: string;
}

/**
 * Applies scientific periodization to any target exercise based on current week and phase.
 * Supports custom user exercises seamlessly.
 */
export function calculatePeriodizedTarget(
  target: {
    exerciseId: string;
    exerciseName: string;
    isCompound?: boolean;
    isLowerBody?: boolean;
    primary_muscle?: string;
    target_sets: number;
    target_reps: number;
    target_reps_max: number | null;
    target_weight_kg: number | null;
  },
  week: number,
  totalWeeks = 6,
  unit: UnitSystem = "imperial",
): PeriodizedTarget {
  // Infer biomechanics if not already specified
  const biomechanics =
    target.isCompound !== undefined && target.isLowerBody !== undefined
      ? { isCompound: target.isCompound, isLowerBody: target.isLowerBody }
      : classifyExerciseBiomechanics({
          name: target.exerciseName,
          primary_muscle: target.primary_muscle,
        });

  const isCompound = biomechanics.isCompound;
  const isLowerBody = biomechanics.isLowerBody;

  const phase = getPhaseForWeek(week, totalWeeks);

  // Periodize sets (deload cuts volume in half, minimum 2 sets)
  const periodizedSets = Math.max(2, Math.round(target.target_sets * phase.volumeMultiplier));

  // Periodize reps (clamps reps between 4 and 25)
  const minReps = Math.max(isCompound ? 4 : 8, target.target_reps + phase.repAdjustment);
  const maxReps = target.target_reps_max
    ? Math.max(minReps, target.target_reps_max + phase.repAdjustment)
    : null;

  // Periodize load
  let periodizedWeightKg: number | null = null;
  if (target.target_weight_kg) {
    const rawWeight = target.target_weight_kg * phase.loadMultiplier;
    periodizedWeightKg = roundLoadKg(rawWeight, unit);
  }

  const note = `${phase.label} Phase: ${phase.targetRpe} (${phase.rirTarget})`;

  return {
    exerciseId: target.exerciseId,
    exerciseName: target.exerciseName,
    isCompound,
    isLowerBody,
    baseWeightKg: target.target_weight_kg,
    baseSets: target.target_sets,
    baseReps: target.target_reps,
    baseRepsMax: target.target_reps_max,
    periodizedWeightKg,
    periodizedSets,
    periodizedReps: minReps,
    periodizedRepsMax: maxReps,
    phase,
    progressionNote: note,
  };
}

/**
 * Double-Progression Overload Recommendation:
 * When target sets achieve the top rep target with clean form,
 * auto-increment load based on user overload rules (compounds vs isolations) and reset reps to floor.
 */
export function calculateDoubleProgression(
  target: {
    isCompound?: boolean;
    isLowerBody?: boolean;
    primary_muscle?: string;
    exerciseName?: string;
    target_sets: number;
    target_reps: number;
    target_reps_max: number | null;
    target_weight_kg: number | null;
  },
  completedSets: { weight: number; reps: number; rpe?: number | null }[],
  unit: UnitSystem = "imperial",
  customSettings?: Partial<OverloadSettings>,
): {
  action: "increase_weight" | "add_reps" | "hold" | "deload";
  recommendedWeightKg: number | null;
  recommendedReps: number;
  recommendedRepsMax: number | null;
  reason: string;
} {
  const biomechanics =
    target.isCompound !== undefined && target.isLowerBody !== undefined
      ? { isCompound: target.isCompound, isLowerBody: target.isLowerBody }
      : classifyExerciseBiomechanics({
          name: target.exerciseName || "",
          primary_muscle: target.primary_muscle,
        });

  const isCompound = biomechanics.isCompound;
  const isLowerBody = biomechanics.isLowerBody;

  const topTarget = target.target_reps_max ?? target.target_reps;
  const bottomTarget = target.target_reps;
  const currentWeight =
    target.target_weight_kg ??
    (completedSets.length ? Math.max(...completedSets.map((s) => s.weight)) : null);

  const working = completedSets.filter((s) => s.reps > 0);
  if (working.length === 0) {
    return {
      action: "hold",
      recommendedWeightKg: currentWeight,
      recommendedReps: bottomTarget,
      recommendedRepsMax: target.target_reps_max,
      reason: "No completed working sets to evaluate.",
    };
  }

  // Check progression trigger condition
  const trigger = customSettings?.progressionTrigger ?? "all_sets_top";
  let metTrigger = false;

  if (trigger === "all_sets_top") {
    metTrigger =
      working.length >= target.target_sets &&
      working.slice(0, target.target_sets).every((s) => s.reps >= topTarget);
  } else if (trigger === "first_set_top") {
    metTrigger = working.length > 0 && working[0].reps >= topTarget;
  } else if (trigger === "two_thirds_top") {
    const hits = working.filter((s) => s.reps >= topTarget).length;
    metTrigger = hits >= Math.ceil((target.target_sets * 2) / 3);
  }

  if (metTrigger && currentWeight) {
    // Determine increment step
    let stepKg: number;
    if (unit === "imperial") {
      const stepLb = !isCompound
        ? (customSettings?.isolationIncLb ?? 2.5)
        : isLowerBody
        ? (customSettings?.lowerCompoundIncLb ?? 10)
        : (customSettings?.upperCompoundIncLb ?? 5);
      stepKg = stepLb * 0.45359237;
    } else {
      stepKg = !isCompound
        ? (customSettings?.isolationIncKg ?? 1.25)
        : isLowerBody
        ? (customSettings?.lowerCompoundIncKg ?? 5)
        : (customSettings?.upperCompoundIncKg ?? 2.5);
    }

    const nextWeight = roundLoadKg(currentWeight + stepKg, unit);
    return {
      action: "increase_weight",
      recommendedWeightKg: nextWeight,
      recommendedReps: bottomTarget,
      recommendedRepsMax: target.target_reps_max,
      reason: `Hit top of bracket (${topTarget} reps)! Progressive overload increment applied, reps reset to ${bottomTarget}.`,
    };
  }

  // Check for severe miss -> deload
  const autoDeload = customSettings?.autoDeloadOnMiss ?? true;
  const missThreshold = customSettings?.missRepThreshold ?? 3;
  const deloadPct = (customSettings?.deloadPercent ?? 10) / 100;

  const worstMiss = Math.max(0, ...working.map((s) => bottomTarget - s.reps));
  if (autoDeload && (worstMiss >= missThreshold || working.length < Math.ceil(target.target_sets / 2))) {
    const deloadWeight = currentWeight ? roundLoadKg(currentWeight * (1 - deloadPct), unit) : null;
    return {
      action: "deload",
      recommendedWeightKg: deloadWeight,
      recommendedReps: bottomTarget,
      recommendedRepsMax: target.target_reps_max,
      reason: `Fell short of target by ${worstMiss} reps. Deload ~${Math.round(
        deloadPct * 100,
      )}% to facilitate recovery and resensitize.`,
    };
  }

  // Still progressing through rep bracket
  return {
    action: "add_reps",
    recommendedWeightKg: currentWeight,
    recommendedReps: bottomTarget,
    recommendedRepsMax: target.target_reps_max,
    reason: `In bracket. Keep load steady and strive for +1-2 reps toward ${topTarget}.`,
  };
}
