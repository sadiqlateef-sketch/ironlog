// Gym Equipment Routing & Station Proximity Superset Engine.
//
// Categorizes exercises into physical gym equipment zones and calculates
// antagonistic, non-competing superset pairings to minimize transit time and maximize density.

import type { EquipmentType, MuscleGroup } from "../types/database.ts";

export type EquipmentZone = "free_weights" | "cables" | "machines" | "bodyweight" | "cardio" | "other";

export interface ExerciseLike {
  id: string;
  name: string;
  equipment: EquipmentType | string;
  primary_muscle: MuscleGroup | string;
  secondary_muscles?: (MuscleGroup | string)[];
}

export interface SupersetCandidate {
  exercise: ExerciseLike;
  score: number;
  proximity: "Same Station" | "Adjacent Zone" | "Cross-Gym";
  pairingType: "Antagonist" | "Non-Competing" | "Synergistic";
  rationale: string;
}

const ZONE_MAP: Record<string, EquipmentZone> = {
  barbell: "free_weights",
  dumbbell: "free_weights",
  kettlebell: "free_weights",
  plate: "free_weights",
  cable: "cables",
  machine: "machines",
  smith: "machines",
  bodyweight: "bodyweight",
  band: "bodyweight",
  treadmill: "cardio",
  bike: "cardio",
  rower: "cardio",
  elliptical: "cardio",
};

export function getEquipmentZone(equipment?: string | null): EquipmentZone {
  if (!equipment) return "other";
  const eq = equipment.toLowerCase();
  for (const [key, zone] of Object.entries(ZONE_MAP)) {
    if (eq.includes(key)) return zone;
  }
  return "other";
}

const ANTAGONIST_PAIRS: Record<string, string[]> = {
  chest: ["upper_back", "lats", "rear_delts"],
  upper_back: ["chest", "front_delts"],
  lats: ["chest", "front_delts"],
  biceps: ["triceps"],
  triceps: ["biceps"],
  quads: ["hamstrings", "calves"],
  hamstrings: ["quads"],
  abs: ["lower_back"],
  lower_back: ["abs"],
  front_delts: ["rear_delts", "lats"],
  rear_delts: ["front_delts", "chest"],
};

export function isAntagonist(muscleA: string, muscleB: string): boolean {
  const antagonists = ANTAGONIST_PAIRS[muscleA] ?? [];
  return antagonists.includes(muscleB);
}

/**
 * Ranks candidate exercises for an optimal superset with the target exercise.
 */
export function findOptimalSupersets(
  target: ExerciseLike,
  candidates: ExerciseLike[]
): SupersetCandidate[] {
  const targetZone = getEquipmentZone(target.equipment);

  return candidates
    .filter((c) => c.id !== target.id)
    .map((candidate) => {
      let score = 50;
      let proximity: "Same Station" | "Adjacent Zone" | "Cross-Gym" = "Adjacent Zone";
      let pairingType: "Antagonist" | "Non-Competing" | "Synergistic" = "Non-Competing";
      let rationale = "";

      const candidateZone = getEquipmentZone(candidate.equipment);

      // Station proximity scoring
      if (candidateZone === targetZone) {
        score += 35;
        proximity = "Same Station";
      } else if (
        (targetZone === "free_weights" && candidateZone === "bodyweight") ||
        (targetZone === "bodyweight" && candidateZone === "free_weights")
      ) {
        score += 20;
        proximity = "Adjacent Zone";
      } else {
        score -= 15;
        proximity = "Cross-Gym";
      }

      // Muscle biomechanics scoring
      if (candidate.primary_muscle === target.primary_muscle) {
        // Severe penalty: same primary muscle exhausts capacity prematurely
        score -= 40;
        pairingType = "Synergistic";
        rationale = "High fatigue overlap (same primary muscle).";
      } else if (isAntagonist(String(target.primary_muscle), String(candidate.primary_muscle))) {
        score += 35;
        pairingType = "Antagonist";
        rationale = `Antagonistic push-pull pair (${proximity}). Active recovery for ${target.primary_muscle}.`;
      } else {
        score += 15;
        pairingType = "Non-Competing";
        rationale = `Non-competing muscle groups (${proximity}). High workout density.`;
      }

      return {
        exercise: candidate,
        score: Math.max(0, Math.min(100, score)),
        proximity,
        pairingType,
        rationale,
      };
    })
    .sort((a, b) => b.score - a.score);
}
