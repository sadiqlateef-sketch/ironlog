// Muscle recovery estimate for the heatmap.
//
// This is a simple, transparent heuristic, not physiology:
//  * Each hard set (warm-ups excluded) adds 1 unit of fatigue to the main muscle
//    and 0.5 to each helper muscle. Sets taken to failure count 1.25×.
//  * Fatigue fades with a half-life: 24 h for big muscles, 16 h for small ones.
//  * 10 units still "on" a muscle = 0% recovered. 0 units = 100%.
// So 10 hard chest sets right now shows chest at 0%; a day later ~50%; two days ~75%.

import type { MuscleGroup, SetType } from "../types/database";

export interface MuscleSet {
  completed_at: string;
  set_type: SetType;
  primary_muscle: MuscleGroup;
  secondary_muscles: MuscleGroup[];
}

export interface MuscleRecovery {
  muscle: MuscleGroup;
  /** 0-100 */
  recovery: number;
  /** Fatigue units still present. */
  fatigue: number;
  /** Hard sets (primary) in the window. */
  sets: number;
  /** Hours until ~90% recovered (0 if already there). */
  hoursToReady: number;
}

export const ALL_MUSCLES: MuscleGroup[] = [
  "chest", "upper_back", "lats", "lower_back", "traps",
  "front_delts", "side_delts", "rear_delts",
  "biceps", "triceps", "forearms",
  "abs", "obliques",
  "quads", "hamstrings", "glutes", "adductors", "abductors", "calves",
  "neck",
];

const BIG: MuscleGroup[] = ["chest", "upper_back", "lats", "lower_back", "quads", "hamstrings", "glutes", "adductors"];

export const CAPACITY = 10;
export const READY_THRESHOLD = 90;
/** How far back fatigue can still matter (5 big-muscle half-lives ≈ 3%). */
export const LOOKBACK_HOURS = 120;

export function halfLifeHours(muscle: MuscleGroup): number {
  return BIG.includes(muscle) ? 24 : 16;
}

export function computeRecovery(sets: MuscleSet[], now: Date = new Date()): MuscleRecovery[] {
  const fatigue = new Map<MuscleGroup, number>();
  const counts = new Map<MuscleGroup, number>();
  const add = (m: MuscleGroup, amount: number, ageH: number) => {
    const remaining = amount * Math.pow(0.5, ageH / halfLifeHours(m));
    fatigue.set(m, (fatigue.get(m) ?? 0) + remaining);
  };

  for (const s of sets) {
    if (s.set_type === "warmup") continue;
    const ageH = Math.max(0, (now.getTime() - new Date(s.completed_at).getTime()) / 3_600_000);
    const weight = s.set_type === "failure" ? 1.25 : 1;
    add(s.primary_muscle, weight, ageH);
    counts.set(s.primary_muscle, (counts.get(s.primary_muscle) ?? 0) + 1);
    for (const m of s.secondary_muscles) add(m, weight * 0.5, ageH);
  }

  return ALL_MUSCLES.map((muscle) => {
    const f = fatigue.get(muscle) ?? 0;
    const recovery = Math.round(100 * Math.max(0, 1 - f / CAPACITY));
    // Solve f × 0.5^(t/h) = CAPACITY × (1 − 0.9) for t.
    const target = (CAPACITY * (100 - READY_THRESHOLD)) / 100;
    const hoursToReady = f > target ? Math.ceil(halfLifeHours(muscle) * Math.log2(f / target)) : 0;
    return { muscle, recovery, fatigue: f, sets: counts.get(muscle) ?? 0, hoursToReady };
  });
}

export function recoveryLabel(recovery: number): "Recovered" | "Recovering" | "Fatigued" {
  if (recovery >= READY_THRESHOLD) return "Recovered";
  if (recovery >= 60) return "Recovering";
  return "Fatigued";
}
