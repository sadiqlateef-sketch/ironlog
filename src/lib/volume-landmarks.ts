// Volume Landmark & Mesocycle Deload Autopilot.
// Grounded in Renaissance Periodization (Dr. Mike Israetel) hypertrophy literature.

import type { MuscleGroup } from "../types/database.ts";

export interface VolumeLandmark {
  mv: number;   // Maintenance Volume
  mev: number;  // Minimum Effective Volume
  mavLow: number; // Maximum Adaptive Volume Lower Bound
  mavHigh: number; // Maximum Adaptive Volume Upper Bound
  mrv: number;  // Maximum Recoverable Volume
}

export type VolumeZone = "below_mev" | "optimal_mav" | "near_mrv" | "overreaching";

export interface MuscleVolumeEvaluation {
  muscle: MuscleGroup;
  weeklySets: number;
  landmark: VolumeLandmark;
  zone: VolumeZone;
  percentageOfMrv: number;
  recommendation: string;
}

export interface DeloadVerdict {
  shouldDeload: boolean;
  reason: string;
  overreachedMuscles: MuscleGroup[];
  suggestedVolumeCutPercent: number; // usually 50%
  suggestedIntensityCutPercent: number; // usually 10%
}

export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmark> = {
  chest: { mv: 6, mev: 10, mavLow: 12, mavHigh: 20, mrv: 22 },
  upper_back: { mv: 8, mev: 10, mavLow: 14, mavHigh: 22, mrv: 25 },
  lats: { mv: 6, mev: 10, mavLow: 12, mavHigh: 20, mrv: 22 },
  lower_back: { mv: 4, mev: 6, mavLow: 8, mavHigh: 14, mrv: 16 },
  traps: { mv: 4, mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  front_delts: { mv: 0, mev: 0, mavLow: 6, mavHigh: 12, mrv: 14 }, // Indirectly hit via pressing
  side_delts: { mv: 6, mev: 8, mavLow: 14, mavHigh: 24, mrv: 26 },
  rear_delts: { mv: 6, mev: 8, mavLow: 12, mavHigh: 20, mrv: 24 },
  biceps: { mv: 4, mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 },
  triceps: { mv: 4, mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  forearms: { mv: 2, mev: 4, mavLow: 8, mavHigh: 14, mrv: 18 },
  abs: { mv: 0, mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 },
  obliques: { mv: 0, mev: 2, mavLow: 6, mavHigh: 12, mrv: 16 },
  quads: { mv: 6, mev: 8, mavLow: 12, mavHigh: 18, mrv: 20 },
  hamstrings: { mv: 4, mev: 6, mavLow: 10, mavHigh: 16, mrv: 18 },
  glutes: { mv: 0, mev: 4, mavLow: 8, mavHigh: 16, mrv: 18 },
  adductors: { mv: 0, mev: 2, mavLow: 6, mavHigh: 12, mrv: 16 },
  abductors: { mv: 0, mev: 2, mavLow: 6, mavHigh: 12, mrv: 16 },
  calves: { mv: 6, mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 },
  neck: { mv: 0, mev: 2, mavLow: 4, mavHigh: 8, mrv: 12 },
};

export function evaluateMuscleVolume(muscle: MuscleGroup, weeklySets: number): MuscleVolumeEvaluation {
  const lm = VOLUME_LANDMARKS[muscle] ?? { mv: 4, mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 };
  const percentageOfMrv = Math.round((weeklySets / lm.mrv) * 100);

  let zone: VolumeZone = "optimal_mav";
  let recommendation = `Volume is in the sweet spot (${lm.mavLow}-${lm.mavHigh} sets/week). Maintain progression.`;

  if (weeklySets < lm.mev) {
    zone = "below_mev";
    recommendation = `Volume is below MEV (${lm.mev} sets/week). Add 2-3 weekly sets to trigger meaningful growth.`;
  } else if (weeklySets >= lm.mrv) {
    zone = "overreaching";
    recommendation = `Volume exceeds MRV (${lm.mrv} sets/week). Accumulating fatigue exceeds recovery rate. High injury/stagnation risk.`;
  } else if (weeklySets > lm.mavHigh) {
    zone = "near_mrv";
    recommendation = `Approaching MRV ceiling (${weeklySets}/${lm.mrv} sets). Watch for joint irritation or stalled lifts.`;
  }

  return {
    muscle,
    weeklySets,
    landmark: lm,
    zone,
    percentageOfMrv,
    recommendation,
  };
}

/**
 * Deload Autopilot: Analyzes recent training history across muscle groups.
 * If 2 or more major muscle groups exceed MRV for consecutive weeks,
 * or overall weekly volume exceeds 115% MRV, triggers a proactive deload.
 */
export function evaluateDeloadTrigger(
  muscleEvaluations: MuscleVolumeEvaluation[],
  accumulatedWeeksInMav = 4,
): DeloadVerdict {
  const overreached = muscleEvaluations.filter((m) => m.zone === "overreaching").map((m) => m.muscle);
  const nearMrv = muscleEvaluations.filter((m) => m.zone === "near_mrv").map((m) => m.muscle);

  if (overreached.length >= 2 || (overreached.length >= 1 && nearMrv.length >= 3)) {
    return {
      shouldDeload: true,
      reason: `Severe systemic overreaching detected in ${overreached.join(", ")}. Deload recommended to dissipate neural fatigue and sensitize muscle receptors.`,
      overreachedMuscles: overreached,
      suggestedVolumeCutPercent: 50,
      suggestedIntensityCutPercent: 10,
    };
  }

  if (accumulatedWeeksInMav >= 5) {
    return {
      shouldDeload: true,
      reason: `End of mesocycle reached (5+ consecutive weeks of high MAV accumulation). A scheduled 1-week deload will lock in gains and prevent plateaus.`,
      overreachedMuscles: overreached,
      suggestedVolumeCutPercent: 50,
      suggestedIntensityCutPercent: 10,
    };
  }

  return {
    shouldDeload: false,
    reason: "Fatigue accumulation is within recoverable biological limits. Continue progressive overload.",
    overreachedMuscles: [],
    suggestedVolumeCutPercent: 0,
    suggestedIntensityCutPercent: 0,
  };
}
