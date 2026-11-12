// Staples pack: a list of common foods seeded into the user's library once.
// This file is the MECHANISM only. The list is empty on purpose: the values come
// from the owner later, and nothing here may invent a nutrient value.

import type { Food } from "./diary-types.ts";
import { NUTRIENT_KEYS } from "./nutrients.ts";
import type { NutrientKey } from "./nutrients.ts";
import { nutrientsFromPartial } from "./entry-math.ts";

export type StapleSeed = {
  key: string;
  name: string;
  brand?: string;
  liquid: boolean;
  servingAmount?: number;
  per100: Partial<Record<NutrientKey, number>>;
  sourceNote: string;
};

export const STAPLES_VERSION = 1;

// Content comes later from the owner. Never invent values here.
export const STAPLES: StapleSeed[] = [];

/** A message when the seed can't be used, else null. `otherKeys` are keys already taken. */
export function validateSeed(seed: StapleSeed, otherKeys: ReadonlySet<string> = new Set()): string | null {
  if (typeof seed.key !== "string" || seed.key.trim() === "") return "key is empty";
  if (otherKeys.has(seed.key)) return `key "${seed.key}" is used twice`;
  if (typeof seed.name !== "string" || seed.name.trim() === "") return "name is empty";
  if (typeof seed.sourceNote !== "string" || seed.sourceNote.trim() === "") return "sourceNote is empty";
  if (seed.servingAmount !== undefined && !(Number.isFinite(seed.servingAmount) && seed.servingAmount > 0)) {
    return "servingAmount must be above 0";
  }
  const known = new Set<string>(NUTRIENT_KEYS);
  for (const [k, v] of Object.entries(seed.per100)) {
    if (!known.has(k)) return `unknown nutrient "${k}"`;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return `${k} must be a number of 0 or more`;
  }
  if (seed.per100.energy === undefined) return "energy is missing";
  return null;
}

/** The foods still to insert: skips seeds already present as staples and invalid ones. */
export function stapleFoodsToSeed(
  seeds: readonly StapleSeed[],
  existingFoods: readonly Food[],
  newId: () => string,
): Food[] {
  const taken = new Set<string>();
  for (const f of existingFoods) {
    if (f.source === "staple" && f.sourceId !== null) taken.add(f.sourceId);
  }
  const out: Food[] = [];
  for (const seed of seeds) {
    if (validateSeed(seed, taken) !== null) continue;
    taken.add(seed.key);
    out.push({
      id: newId(),
      name: seed.name,
      brand: seed.brand ?? null,
      barcode: null,
      liquid: seed.liquid,
      servingAmount: seed.servingAmount ?? null,
      packageAmount: null,
      nutrients: nutrientsFromPartial(seed.per100),
      source: "staple",
      sourceId: seed.key,
      sourceUrl: null,
      note: seed.sourceNote,
      archived: false,
    });
  }
  return out;
}
