// Plate calculator: which plates go on EACH side of the bar to hit a target.
// Works in whatever unit you pass in (all numbers must be the same unit).

import type { Kit } from "./kit.ts";

export interface PlateResult {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** What the bar will actually weigh with those plates. */
  achieved: number;
  /** target - achieved. 0 means exact; > 0 means you can't make it with these plates. */
  remainder: number;
}

const EPS = 1e-6;

/**
 * `pairs` (optional, same order as `plates`): how many of each plate you can
 * put on each side, for a home set with a few of each. Leave it out for a gym.
 */
export function calculatePlates(target: number, barWeight: number, plates: number[], pairs?: number[]): PlateResult {
  if (!(target > barWeight)) {
    return { perSide: [], achieved: barWeight, remainder: Math.max(0, round(target - barWeight)) };
  }
  if (pairs) return limited(target, barWeight, plates, pairs);

  const sorted = [...plates].filter((p) => p > 0).sort((a, b) => b - a);
  let perSideRemaining = (target - barWeight) / 2;
  const perSide: number[] = [];

  // Greedy works for standard plate sets (each plate is >= 2x the next one down,
  // or the set is "canonical" like 45/35/25/10/5/2.5 and 25/20/15/10/5/2.5/1.25).
  for (const plate of sorted) {
    while (perSideRemaining + EPS >= plate) {
      perSide.push(plate);
      perSideRemaining -= plate;
    }
  }

  const achieved = round(barWeight + 2 * perSide.reduce((a, b) => a + b, 0));
  return { perSide, achieved, remainder: round(target - achieved) };
}

/** With only a few of each plate, greedy can miss: try every mix and keep the closest (fewest plates on a tie). */
function limited(target: number, barWeight: number, plates: number[], pairs: number[]): PlateResult {
  const sizes = plates
    .map((p, i) => ({ p, n: Math.max(0, Math.floor(pairs[i] ?? 0)) }))
    .filter((x) => x.p > 0 && x.n > 0)
    .sort((a, b) => b.p - a.p);
  const goal = (target - barWeight) / 2;
  let best: number[] = [];
  let bestSum = 0;
  const pick: number[] = [];
  const walk = (i: number, sum: number) => {
    if (sum > goal + EPS) return;
    if (sum > bestSum + EPS || (Math.abs(sum - bestSum) < EPS && pick.length < best.length)) {
      bestSum = sum;
      best = [...pick];
    }
    if (i >= sizes.length || bestSum > goal - EPS) return;
    const { p, n } = sizes[i];
    for (let k = Math.min(n, Math.floor((goal - sum + EPS) / p)); k >= 0; k--) {
      for (let j = 0; j < k; j++) pick.push(p);
      walk(i + 1, sum + k * p);
      pick.length -= k;
    }
  };
  walk(0, 0);
  const achieved = round(barWeight + 2 * bestSum);
  return { perSide: best, achieved, remainder: round(target - achieved) };
}

/** The bar, plates and (for a home set) how many pairs of each, from a kit, in your unit. */
export function kitPlates(kit: Kit, unit: "metric" | "imperial"): { bar: number; plates: number[]; pairs?: number[] } {
  const conv = (kg: number) => nominal(unit === "imperial" ? kg * KG_TO_LB : kg);
  const bar = kit.bar_kg != null ? conv(kit.bar_kg) : STANDARD_PLATES[unit].bar;
  if (!kit.plates.length) return { bar, plates: [...STANDARD_PLATES[unit].plates] };
  const sorted = [...kit.plates].sort((a, b) => b.kg - a.kg);
  const plates = sorted.map((p) => conv(p.kg));
  if (sorted.every((p) => p.count == null)) return { bar, plates: [...new Set(plates)] };
  return { bar, plates, pairs: sorted.map((p) => (p.count == null ? 99 : Math.floor(p.count / 2))) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const STANDARD_PLATES = {
  imperial: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
  metric: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
} as const;

/** Every plate size you can tick in "Edit available weights", in each unit. */
export const ALL_PLATES = {
  imperial: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25],
  metric: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
} as const;

const KG_TO_LB = 2.2046226218;

/** Round a converted plate to its nominal size (20.41 kg -> 45 lb). */
function nominal(value: number): number {
  return Math.round(value * 4) / 4;
}

/**
 * The bar and plates you own (stored in kg on your profile), in your unit.
 * Falls back to the standard set when nothing is saved.
 */
export function ownedPlates(
  profile: { bar_weight_kg: number; available_plates_kg: number[] } | null,
  unit: "metric" | "imperial",
): { bar: number; plates: number[] } {
  if (!profile || profile.available_plates_kg.length === 0) {
    return { bar: STANDARD_PLATES[unit].bar, plates: [...STANDARD_PLATES[unit].plates] };
  }
  const conv = (kg: number) => nominal(unit === "imperial" ? Number(kg) * KG_TO_LB : Number(kg));
  return {
    bar: conv(profile.bar_weight_kg),
    plates: [...new Set(profile.available_plates_kg.map(conv))].sort((a, b) => b - a),
  };
}

/** Colour per plate, following the IWF/competition convention. */
export function plateColor(plate: number, unit: "metric" | "imperial"): string {
  const kg = unit === "imperial" ? plate / 2.2046226218 : plate;
  if (kg >= 24) return "bg-red-600";
  if (kg >= 19) return "bg-blue-600";
  if (kg >= 14) return "bg-yellow-400";
  if (kg >= 9) return "bg-green-600";
  if (kg >= 4) return "bg-neutral-100";
  return "bg-neutral-400";
}
