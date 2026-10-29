// Muscle Soreness (DOMS) Check-in & Autoregulation Engine.
// Evaluates subjective muscle soreness (1-5 scale) and modulates training readiness,
// warmup set volume, and exercise substitution alerts.

import type { MuscleGroup } from "../types/database.ts";

export type DomsLevel = 1 | 2 | 3 | 4 | 5;

export interface DomsCheckIn {
  muscle: MuscleGroup;
  level: DomsLevel;
  loggedAt: string;
}

export interface DomsReadinessImpact {
  muscle: MuscleGroup;
  rawRecoveryPercent: number;
  domsLevel: DomsLevel;
  adjustedReadinessPercent: number;
  recommendation: string;
  recommendedAction: "proceed" | "extra_warmup" | "reduce_load" | "substitute";
}

export const DOMS_LABELS: Record<DomsLevel, { label: string; description: string; color: string }> = {
  1: { label: "Fresh", description: "No soreness or tenderness", color: "text-emerald-400" },
  2: { label: "Mild", description: "Felt only on deep stretch", color: "text-green-400" },
  3: { label: "Moderate", description: "Noticeable stiffness and tenderness", color: "text-yellow-400" },
  4: { label: "High", description: "Compromised active range of motion", color: "text-amber-400" },
  5: { label: "Severe", description: "Acute tenderness, painful contraction", color: "text-red-400" },
};

/**
 * Modulates raw mathematical recovery percentage by subjective DOMS rating.
 */
export function calculateDomsAdjustedReadiness(
  rawRecoveryPercent: number,
  domsLevel: DomsLevel,
): number {
  const penalties: Record<DomsLevel, number> = {
    1: 0,
    2: 5,
    3: 15,
    4: 35,
    5: 60,
  };

  const penalty = penalties[domsLevel] ?? 0;
  return Math.max(0, Math.min(100, Math.round(rawRecoveryPercent - penalty)));
}

/**
 * Generates actionable training advice for a muscle based on its DOMS check-in.
 */
export function evaluateDomsImpact(
  muscle: MuscleGroup,
  rawRecoveryPercent: number,
  domsLevel: DomsLevel,
): DomsReadinessImpact {
  const adjusted = calculateDomsAdjustedReadiness(rawRecoveryPercent, domsLevel);

  let recommendation = "Muscle is recovered and primed for progressive loading.";
  let recommendedAction: DomsReadinessImpact["recommendedAction"] = "proceed";

  if (domsLevel === 5 || adjusted < 40) {
    recommendation = `Severe DOMS (Level ${domsLevel}). Heavy eccentric loading poses high strain risk. Substitute with low-stress machine isolation or active flush.`;
    recommendedAction = "substitute";
  } else if (domsLevel === 4 || adjusted < 60) {
    recommendation = `High soreness (Level ${domsLevel}). Reduce working loads by 10-15% or cap sets at RPE 7.5.`;
    recommendedAction = "reduce_load";
  } else if (domsLevel === 3) {
    recommendation = `Moderate stiffness. Add 1-2 extra low-intensity warmup sets to elevate localized synovial fluid and muscle temperature.`;
    recommendedAction = "extra_warmup";
  }

  return {
    muscle,
    rawRecoveryPercent,
    domsLevel,
    adjustedReadinessPercent: adjusted,
    recommendation,
    recommendedAction,
  };
}
