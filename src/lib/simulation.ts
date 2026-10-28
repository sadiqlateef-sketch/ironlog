// Workout Simulation ("What If") Engine
// Runs the biomechanical recovery, muscular load, and strain models *forward*
// on a hypothetical workout before you step onto the gym floor.

import {
  computeRecovery,
  recoveryLabel,
  type MuscleRecovery,
  type MuscleSet,
} from "./recovery.ts";
import { muscularLoad, strainScore } from "./insights.ts";
import type { MuscleGroup, SetType } from "../types/database";

export interface SimulatedExercise {
  name: string;
  primary_muscle: MuscleGroup;
  secondary_muscles: MuscleGroup[];
  sets: number;
  set_type?: SetType;
}

export interface MuscleImpactDelta {
  muscle: MuscleGroup;
  currentRecovery: number;
  projectedRecovery: number;
  recoveryDrop: number;
  fatigueAdded: number;
  hoursToReady: number;
}

export interface WorkoutSimulationResult {
  currentMuscleRecovery: MuscleRecovery[];
  projectedMuscleRecovery: MuscleRecovery[];
  impactedMuscles: MuscleImpactDelta[];
  projectedStrain: number;
  totalWorkingSets: number;
  readinessVerdict: "optimal" | "moderate" | "caution";
  verdictTitle: string;
  verdictMessage: string;
}

/**
 * Projects the physiological impact of performing a hypothetical workout.
 * Uses exact half-life decay curves and strain saturation from the IronLog engine.
 */
export function simulateWorkout(
  plannedExercises: SimulatedExercise[],
  historySets: MuscleSet[],
  now: Date = new Date(),
): WorkoutSimulationResult {
  // 1. Current recovery baseline
  const currentMuscleRecovery = computeRecovery(historySets, now);
  const currentMap = new Map(currentMuscleRecovery.map((m) => [m.muscle, m]));

  // 2. Synthesize new sets representing the planned workout completed now
  const simulatedSets: MuscleSet[] = [];
  const strainSets: { set_type: string; reps: number; rpe: number | null }[] = [];

  for (const ex of plannedExercises) {
    for (let i = 0; i < ex.sets; i++) {
      const type = ex.set_type ?? "normal";
      simulatedSets.push({
        completed_at: now.toISOString(),
        set_type: type,
        primary_muscle: ex.primary_muscle,
        secondary_muscles: ex.secondary_muscles,
      });
      strainSets.push({
        set_type: type,
        reps: 8,
        rpe: type === "failure" ? 10 : 8,
      });
    }
  }

  // 3. Projected recovery with the new sets combined
  const projectedMuscleRecovery = computeRecovery([...historySets, ...simulatedSets], now);
  const projectedMap = new Map(projectedMuscleRecovery.map((m) => [m.muscle, m]));

  // 4. Calculate per-muscle delta
  const impactedMuscles: MuscleImpactDelta[] = [];
  for (const p of projectedMuscleRecovery) {
    const cur = currentMap.get(p.muscle);
    const curRec = cur?.recovery ?? 100;
    const diff = curRec - p.recovery;
    if (diff > 0 || p.fatigue > 0) {
      impactedMuscles.push({
        muscle: p.muscle,
        currentRecovery: curRec,
        projectedRecovery: p.recovery,
        recoveryDrop: diff,
        fatigueAdded: (p.fatigue - (cur?.fatigue ?? 0)),
        hoursToReady: p.hoursToReady,
      });
    }
  }

  // Sort by highest recovery drop
  impactedMuscles.sort((a, b) => b.recoveryDrop - a.recoveryDrop);

  // 5. Calculate projected strain
  // Assume a typical ~45 min workout with moderate zone cardio load
  const mLoad = muscularLoad(strainSets);
  const projectedStrain = strainScore(15, mLoad.load);

  // 6. Readiness & safety assessment
  const targetMuscles = new Set(plannedExercises.map((e) => e.primary_muscle));
  const compromisedTargets = [...targetMuscles].filter((m) => (currentMap.get(m)?.recovery ?? 100) < 65);

  let readinessVerdict: "optimal" | "moderate" | "caution";
  let verdictTitle: string;
  let verdictMessage: string;

  if (compromisedTargets.length > 0) {
    readinessVerdict = "caution";
    verdictTitle = "High Fatigue Overlap Detected";
    verdictMessage = `Your ${compromisedTargets.join(" and ")} ${
      compromisedTargets.length === 1 ? "is" : "are"
    } under 65% recovered. Consider swapping heavy compounds or using higher reps.`;
  } else if ([...targetMuscles].every((m) => (currentMap.get(m)?.recovery ?? 100) >= 88)) {
    readinessVerdict = "optimal";
    verdictTitle = "Prime Training Window";
    verdictMessage = "Target muscles are fully restored and primed for maximum mechanical overload.";
  } else {
    readinessVerdict = "moderate";
    verdictTitle = "Good Stimulus Window";
    verdictMessage = "Muscles are adequately recovered to generate progressive stimulus.";
  }

  return {
    currentMuscleRecovery,
    projectedMuscleRecovery,
    impactedMuscles,
    projectedStrain,
    totalWorkingSets: plannedExercises.reduce((a, b) => a + b.sets, 0),
    readinessVerdict,
    verdictTitle,
    verdictMessage,
  };
}
