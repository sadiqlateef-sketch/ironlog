// Automated Drop Sets & Rest-Pause Countdown Engine.
// Computes optimal load reduction, plate increments, and rest-pause cluster pacing.

import { roundToPlates } from "./one-rm.ts";

export interface DropSetRecommendation {
  originalWeight: number;
  recommendedWeight: number;
  dropPercent: number;
  expectedReps: number;
  restSeconds: number;
  rationale: string;
}

export interface RestPauseCluster {
  clusterIndex: number;
  targetReps: number;
  intraSetRestSeconds: number;
  isTerminal: boolean;
}

/**
 * Calculates the next drop load (default: -20%) rounded to available gym plates.
 */
export function calculateDropLoad(
  currentWeight: number,
  dropPercent = 20,
  unit: "imperial" | "metric" = "imperial",
): number {
  if (currentWeight <= 0) return 0;
  const factor = 1 - Math.max(5, Math.min(50, dropPercent)) / 100;
  const rawTarget = currentWeight * factor;
  return roundToPlates(rawTarget, unit);
}

/**
 * Generates a full drop-set cascade (e.g., Triple Drop Set).
 */
export function generateDropSequence(
  topWeight: number,
  steps = 2,
  dropPercent = 20,
  unit: "imperial" | "metric" = "imperial",
): DropSetRecommendation[] {
  const sequence: DropSetRecommendation[] = [];
  let current = topWeight;

  for (let i = 0; i < steps; i++) {
    const nextWeight = calculateDropLoad(current, dropPercent, unit);
    // Don't drop lower than empty bar (45 lb or 20 kg)
    const minThreshold = unit === "imperial" ? 45 : 20;
    const finalWeight = Math.max(minThreshold, nextWeight);

    sequence.push({
      originalWeight: current,
      recommendedWeight: finalWeight,
      dropPercent,
      expectedReps: 8 + i * 2, // Lighter weights yield higher reps
      restSeconds: 15, // Immediate strip and go
      rationale: `Drop #${i + 1}: -${dropPercent}% load to recruit high-threshold motor units under severe metabolic fatigue.`,
    });

    current = finalWeight;
  }

  return sequence;
}

/**
 * Generates a scientific Rest-Pause cluster plan (e.g. Doggcrapp style).
 * Takes a heavy working load and breaks it into 3 clusters separated by 15-20s rest pauses.
 */
export function generateRestPausePlan(
  targetTotalReps = 15,
  initialTarget = 8,
  intraSetRestSeconds = 15,
): RestPauseCluster[] {
  const clusters: RestPauseCluster[] = [];
  const remainingReps = Math.max(0, targetTotalReps - initialTarget);
  const cluster2Reps = Math.ceil(remainingReps * 0.6);
  const cluster3Reps = Math.max(1, remainingReps - cluster2Reps);

  clusters.push({
    clusterIndex: 1,
    targetReps: initialTarget,
    intraSetRestSeconds,
    isTerminal: false,
  });

  clusters.push({
    clusterIndex: 2,
    targetReps: cluster2Reps,
    intraSetRestSeconds,
    isTerminal: false,
  });

  clusters.push({
    clusterIndex: 3,
    targetReps: cluster3Reps,
    intraSetRestSeconds: 0,
    isTerminal: true,
  });

  return clusters;
}
