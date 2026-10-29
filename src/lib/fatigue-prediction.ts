// Fatigue-Adjusted 1RM Prediction Curves.
// Predicts intra-session strength degradation across sequential working sets
// based on previous set RPE, rest intervals, and compound vs isolation status.

import { roundToPlates } from "./one-rm.ts";

export interface SetDecayPrediction {
  setNumber: number;
  prescribedWeight: number;
  expectedRepsWithSameWeight: number;
  recommendedWeightToMatchReps: number;
  expectedRpe: number;
  fatiguePercent: number; // 0 - 25% drop
}

export interface DecayParams {
  initialWeight: number;
  targetReps: number;
  totalSets?: number;
  restSeconds?: number;
  initialRpe?: number;
  isCompound?: boolean;
  unit?: "imperial" | "metric";
}

/**
 * Predicts strength drop-off curve for upcoming sets.
 * Compound lifts and short rest periods amplify fatigue accumulation.
 */
export function predictSetDecay(params: DecayParams): SetDecayPrediction[] {
  const {
    initialWeight,
    targetReps,
    totalSets = 4,
    restSeconds = 120,
    initialRpe = 8.0,
    isCompound = true,
    unit = "imperial",
  } = params;

  if (initialWeight <= 0 || targetReps <= 0) return [];

  const predictions: SetDecayPrediction[] = [];

  // Rest recovery factor: 180s+ = 95% ATP replenishment, 60s = 80%
  const restFactor = Math.min(1.0, 0.75 + (restSeconds / 300) * 0.25);
  // Compound factor: compound exercises generate 1.4x more systemic neural fatigue
  const systemicFatigueRate = (isCompound ? 0.045 : 0.025) / restFactor;

  for (let s = 1; s <= totalSets; s++) {
    if (s === 1) {
      predictions.push({
        setNumber: 1,
        prescribedWeight: initialWeight,
        expectedRepsWithSameWeight: targetReps,
        recommendedWeightToMatchReps: initialWeight,
        expectedRpe: initialRpe,
        fatiguePercent: 0,
      });
      continue;
    }

    // Cumulative fatigue growth per set
    const cumulativeDrop = Math.min(0.25, (s - 1) * systemicFatigueRate);
    const fatiguePercent = Math.round(cumulativeDrop * 100);

    // If keeping identical weight, reps degrade by ~1 rep per 5% fatigue
    const repDrop = Math.floor(fatiguePercent / 5);
    const expectedReps = Math.max(1, targetReps - repDrop);

    // To preserve target reps, reduce weight by the fatigue percentage
    const idealWeight = initialWeight * (1 - cumulativeDrop);
    const recommendedWeight = roundToPlates(idealWeight, unit);

    const projectedRpe = Math.min(10, Math.round((initialRpe + (s - 1) * 0.5) * 10) / 10);

    predictions.push({
      setNumber: s,
      prescribedWeight: initialWeight,
      expectedRepsWithSameWeight: expectedReps,
      recommendedWeightToMatchReps: recommendedWeight,
      expectedRpe: projectedRpe,
      fatiguePercent,
    });
  }

  return predictions;
}
