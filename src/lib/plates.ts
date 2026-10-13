// Plate calculator: which plates go on EACH side of the bar to hit a target.
// Works in whatever unit you pass in (all numbers must be the same unit).

export interface PlateResult {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** What the bar will actually weigh with those plates. */
  achieved: number;
  /** target - achieved. 0 means exact; > 0 means you can't make it with these plates. */
  remainder: number;
}

const EPS = 1e-6;

export function calculatePlates(target: number, barWeight: number, plates: number[]): PlateResult {
  if (!(target > barWeight)) {
    return { perSide: [], achieved: barWeight, remainder: Math.max(0, round(target - barWeight)) };
  }

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

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const STANDARD_PLATES = {
  imperial: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
  metric: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
} as const;

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
