// Sleep & Readiness composite scoring engine.
//
// Combines target muscle recovery (from computeRecovery), sleep duration/quality,
// and autonomic cardiovascular metrics into a unified 0-100 Readiness Score
// to guide daily training intensity and volume.

import type { MuscleRecovery } from "./recovery.ts";
import { MUSCLE_LABELS } from "./labels.ts";

export type ReadinessLevel = "optimal" | "ready" | "moderate" | "fatigued";

export interface ReadinessFactors {
  muscleScore: number;
  sleepScore: number;
  cardioScore: number;
}

export interface ReadinessMetrics {
  sleepHours?: number | null;
  sleepQuality?: number | null; // 0-100
  restingHr?: number | null;
  baselineRestingHr?: number | null;
  hrvRmssd?: number | null;
  manualRecoveryFeel?: number | null; // 1-5
}

export interface ReadinessReport {
  score: number;
  level: ReadinessLevel;
  label: string;
  summary: string;
  recommendation: string;
  targetVolumeScale: number;
  factors: ReadinessFactors;
  mostFatiguedMuscle?: { name: string; recovery: number };
}

const READINESS_PREF = "ironlog:readiness-metrics";

export function loadSavedReadinessMetrics(): ReadinessMetrics {
  if (typeof window === "undefined") return { sleepHours: 7.5, sleepQuality: 85, restingHr: 58, baselineRestingHr: 60 };
  try {
    const raw = localStorage.getItem(READINESS_PREF);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sleepHours: 7.5, sleepQuality: 85, restingHr: 58, baselineRestingHr: 60 };
}

export function saveReadinessMetrics(metrics: ReadinessMetrics): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(READINESS_PREF, JSON.stringify(metrics));
  } catch {}
}

/**
 * Calculates a 0-100 sleep score based on duration and optional quality rating.
 */
export function calculateSleepScore(hours?: number | null, quality?: number | null): number {
  if (hours == null || isNaN(hours)) {
    return quality != null && !isNaN(quality) ? Math.min(100, Math.max(0, quality)) : 80;
  }

  // Optimal range: 7.5 to 9.0 hours
  let durationScore: number;
  if (hours >= 7.5 && hours <= 9.0) {
    durationScore = 100;
  } else if (hours >= 7.0 && hours < 7.5) {
    durationScore = 90;
  } else if (hours > 9.0 && hours <= 10.0) {
    durationScore = 92;
  } else if (hours >= 6.0 && hours < 7.0) {
    durationScore = 75;
  } else if (hours >= 5.0 && hours < 6.0) {
    durationScore = 55;
  } else if (hours < 5.0) {
    durationScore = Math.max(20, Math.round(hours * 10));
  } else {
    // > 10 hours
    durationScore = 80;
  }

  if (quality != null && !isNaN(quality)) {
    const qClamped = Math.min(100, Math.max(0, quality));
    return Math.round(durationScore * 0.7 + qClamped * 0.3);
  }

  return durationScore;
}

/**
 * Calculates a 0-100 cardiovascular / autonomic recovery score based on resting HR vs baseline.
 */
export function calculateCardioScore(restingHr?: number | null, baselineHr?: number | null): number {
  if (restingHr == null || isNaN(restingHr)) return 85;

  const baseline = baselineHr != null && !isNaN(baselineHr) ? baselineHr : 60;
  const delta = restingHr - baseline;

  if (delta <= 0) return 100;
  if (delta <= 2) return 92;
  if (delta <= 5) return 80;
  if (delta <= 8) return 65;
  if (delta <= 12) return 45;
  return 30;
}

/**
 * Calculates a composite muscle recovery score (0-100) from an array of MuscleRecovery.
 */
export function calculateMuscleScore(
  recovery: MuscleRecovery[] | number
): { score: number; mostFatigued?: { name: string; recovery: number } } {
  if (typeof recovery === "number") {
    const score = Math.min(100, Math.max(0, Math.round(recovery)));
    return { score };
  }

  const worked = recovery.filter((m) => m.sets > 0);
  if (!worked.length) {
    return { score: 100 };
  }

  let minRecovery = 100;
  let mostFatiguedMuscle = worked[0].muscle;
  let sum = 0;

  for (const m of worked) {
    sum += m.recovery;
    if (m.recovery < minRecovery) {
      minRecovery = m.recovery;
      mostFatiguedMuscle = m.muscle;
    }
  }

  const avgRecovery = sum / worked.length;
  // Weight the most fatigued muscle 40% and overall average 60%
  const score = Math.min(100, Math.max(0, Math.round(avgRecovery * 0.6 + minRecovery * 0.4)));

  return {
    score,
    mostFatigued: {
      name: MUSCLE_LABELS[mostFatiguedMuscle] ?? mostFatiguedMuscle,
      recovery: minRecovery,
    },
  };
}

/**
 * Computes the unified ReadinessReport combining muscle, sleep, and cardio metrics.
 */
export function computeReadinessReport(
  recoveryData: MuscleRecovery[] | number,
  metrics: ReadinessMetrics = {}
): ReadinessReport {
  const { score: muscleScore, mostFatigued } = calculateMuscleScore(recoveryData);
  const sleepScore = calculateSleepScore(metrics.sleepHours, metrics.sleepQuality);
  const cardioScore = calculateCardioScore(metrics.restingHr, metrics.baselineRestingHr);

  // Weighted composite: Muscle 45%, Sleep 35%, Cardio 20%
  const compositeScore = Math.min(
    100,
    Math.max(0, Math.round(muscleScore * 0.45 + sleepScore * 0.35 + cardioScore * 0.20))
  );

  let level: ReadinessLevel;
  let label: string;
  let summary: string;
  let recommendation: string;
  let targetVolumeScale: number;

  if (compositeScore >= 85) {
    level = "optimal";
    label = "Peak Readiness";
    summary = "Muscles, nervous system, and sleep metrics are fully primed.";
    recommendation = "Ideal session for heavy compounds, progressive overload, and PR attempts.";
    targetVolumeScale = 1.05;
  } else if (compositeScore >= 70) {
    level = "ready";
    label = "Good to Go";
    summary = "Solid systemic recovery with good neuromuscular freshness.";
    recommendation = "Proceed with scheduled working sets and standard rep progression.";
    targetVolumeScale = 1.0;
  } else if (compositeScore >= 50) {
    level = "moderate";
    label = "Moderate Fatigue";
    summary = "Moderate fatigue detected. Recovery reserves are partially depleted.";
    recommendation = "Consider keeping 1-2 reps in reserve (RPE 7-8) or trimming 1 accessory set.";
    targetVolumeScale = 0.85;
  } else {
    level = "fatigued";
    label = "Recovery Needed";
    summary = "Elevated muscular fatigue or accumulated sleep debt.";
    recommendation = "High systemic fatigue. Light active recovery, mobility, or a deload is advised.";
    targetVolumeScale = 0.65;
  }

  return {
    score: compositeScore,
    level,
    label,
    summary,
    recommendation,
    targetVolumeScale,
    factors: {
      muscleScore,
      sleepScore,
      cardioScore,
    },
    mostFatiguedMuscle: mostFatigued,
  };
}
