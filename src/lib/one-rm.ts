// One-rep-max estimates. The database stores Epley (workout_sets.estimated_1rm),
// so Epley is the headline number everywhere for consistency.

/** Epley: weight × (1 + reps / 30). The usual default; slightly generous at high reps. */
export function epley(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Brzycki: weight × 36 / (37 − reps). Slightly more conservative; breaks down past ~12 reps. */
export function brzycki(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0 || reps >= 37) return 0;
  return (weight * 36) / (37 - reps);
}

/** Roughly how many reps you can do at a % of your 1RM (inverse Epley, rounded down). */
export function repsAtPercent(percent: number): number {
  if (percent >= 100) return 1;
  return Math.max(1, Math.floor(30 * (100 / percent - 1)));
}

/** Round to the nearest loadable jump: 5 lb or 2.5 kg. */
export function roundToPlates(value: number, unit: "metric" | "imperial"): number {
  const step = unit === "imperial" ? 5 : 2.5;
  return Math.round(value / step) * step;
}

export const PERCENT_TABLE = [100, 95, 90, 85, 80, 75, 70, 65, 60] as const;

/** Estimates are reliable up to ~10-12 reps; beyond that they mostly measure endurance. */
export const MAX_RELIABLE_REPS = 12;
