import { NUTRIENT_KEYS } from "./nutrients.ts";
import type { NutrientValue, Nutrients } from "./nutrients.ts";

function isKnown(v: NutrientValue): boolean {
  return v.state === "complete" || v.state === "derived";
}

/** How many of the 43 nutrients carry a known (complete or derived) value. */
export function completeness(n: Nutrients): { known: number; total: 43; ratio: number } {
  let known = 0;
  for (const key of NUTRIENT_KEYS) {
    if (isKnown(n[key])) known += 1;
  }
  return { known, total: 43, ratio: known / 43 };
}

export type EnergyCheck = { flagged: boolean; stated: number; computed: number; diff: number };

/**
 * Compare stated energy with 4P + 4C + 9F. Returns null when the check does
 * not apply: energy, protein, carbohydrates and fat must all be known, and
 * energy must not itself be derived from those macros. Flag only; never edits.
 */
export function energyMismatch(n: Nutrients, tolerance = 0.2): EnergyCheck | null {
  const { energy, protein, carbohydrates, fat } = n;
  if (!isKnown(energy) || !isKnown(protein) || !isKnown(carbohydrates) || !isKnown(fat)) return null;
  if (energy.state === "derived") return null;
  const stated = energy.value;
  const computed = 4 * protein.value + 4 * carbohydrates.value + 9 * fat.value;
  const diff = Math.abs(stated - computed) / Math.max(stated, computed, 1);
  return { flagged: diff > tolerance, stated, computed, diff };
}
