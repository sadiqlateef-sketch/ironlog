// Diary arithmetic: turn "150 g" or "2 servings" into nutrient totals, and add
// entries up without hiding what we don't know. Pure, no app imports.
//
// Base amount = grams, or millilitres for liquids (1 ml counts as 1 base unit).
// Per-100 values are per 100 base units.

import type { DiaryEntry, EntryUnit, Food, FoodSnapshot, MealSlot } from "./diary-types.ts";
import {
  NUTRIENT_KEYS,
  addNutrients,
  complete,
  incomplete,
  scaleNutrients,
} from "./nutrients.ts";
import type { NutrientKey, NutrientValue, Nutrients } from "./nutrients.ts";

export const G_PER_OZ = 1 / 0.03527396;
export const ML_PER_FLOZ = 1 / 0.0338140227;

/** The nutrients shown on totals and previews (all 43 are stored). */
export const DISPLAY_NUTRIENTS: readonly NutrientKey[] = [
  "energy", "protein", "carbohydrates", "fat", "fiber", "sugars", "sodium", "caffeine",
];

type UnitSource = Pick<Food, "liquid" | "servingAmount" | "packageAmount">;

export function allowedUnits(food: UnitSource): EntryUnit[] {
  const units: EntryUnit[] = food.liquid ? ["ml", "fl_oz"] : ["g", "oz"];
  if (food.servingAmount !== null && food.servingAmount > 0) units.push("serving");
  if (food.packageAmount !== null && food.packageAmount > 0) units.push("package");
  return units;
}

export type BaseResult =
  | { ok: true; base: number }
  | { ok: false; reason: "bad-quantity" | "unit-not-allowed" | "no-serving" | "no-package" };

export function toBase(food: UnitSource, quantity: number, unit: EntryUnit): BaseResult {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: "bad-quantity" };
  switch (unit) {
    case "g":
      return food.liquid ? { ok: false, reason: "unit-not-allowed" } : { ok: true, base: quantity };
    case "oz":
      return food.liquid ? { ok: false, reason: "unit-not-allowed" } : { ok: true, base: quantity * G_PER_OZ };
    case "ml":
      return food.liquid ? { ok: true, base: quantity } : { ok: false, reason: "unit-not-allowed" };
    case "fl_oz":
      return food.liquid ? { ok: true, base: quantity * ML_PER_FLOZ } : { ok: false, reason: "unit-not-allowed" };
    case "serving":
      if (food.servingAmount === null || !(food.servingAmount > 0)) return { ok: false, reason: "no-serving" };
      return { ok: true, base: quantity * food.servingAmount };
    case "package":
      if (food.packageAmount === null || !(food.packageAmount > 0)) return { ok: false, reason: "no-package" };
      return { ok: true, base: quantity * food.packageAmount };
    default:
      return { ok: false, reason: "unit-not-allowed" };
  }
}

/** Totals for `base` units of a food with these per-100 values. Completeness states are kept. */
export function entryNutrients(per100: Nutrients, base: number): Nutrients {
  return scaleNutrients(per100, base / 100);
}

export function copyNutrients(n: Nutrients): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) out[key] = { ...n[key] };
  return out;
}

/** All 43 keys complete at 0: the seed for sums. (emptyNutrients is all unknown.) */
export function zeroNutrients(): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) out[key] = complete(0);
  return out;
}

/** Given keys complete, every other key unknown. */
export function nutrientsFromPartial(values: Partial<Record<NutrientKey, number>>): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) {
    const v = values[key];
    out[key] = v === undefined ? incomplete() : complete(v);
  }
  return out;
}

export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  return list.reduce((acc, n) => addNutrients(acc, n), zeroNutrients());
}

export function dayTotals(entries: readonly DiaryEntry[]): Nutrients {
  return sumNutrients(entries.map((e) => e.nutrients));
}

export function mealTotals(entries: readonly DiaryEntry[]): Nutrients {
  return sumNutrients(entries.map((e) => e.nutrients));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function snapshotOf(food: Food): FoodSnapshot {
  return {
    liquid: food.liquid,
    servingAmount: food.servingAmount,
    packageAmount: food.packageAmount,
    source: food.source,
    sourceUrl: food.sourceUrl,
    per100: copyNutrients(food.nutrients),
  };
}

export interface MakeEntryInput {
  food: Food;
  quantity: number;
  unit: EntryUnit;
  foodDay: string;
  meal: Pick<MealSlot, "id" | "name">;
  now: Date;
  id: string;
  note?: string | null;
}

export function makeEntry(input: MakeEntryInput): DiaryEntry {
  const { food, quantity, unit } = input;
  if (unit === "quick") throw new Error("quick entries are made with makeQuickEntry");
  const base = toBase(food, quantity, unit);
  if (!base.ok) throw new Error(`cannot log this amount: ${base.reason}`);
  const snapshot = snapshotOf(food);
  return {
    id: input.id,
    foodDay: input.foodDay,
    mealId: input.meal.id,
    mealName: input.meal.name,
    eatenAt: input.now.toISOString(),
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    quantity,
    unit,
    grams: round2(base.base),
    food: snapshot,
    nutrients: entryNutrients(snapshot.per100, base.base),
    note: input.note ?? null,
  };
}

/** Change an entry's amount using the food as it was when logged, never the live food. */
export function recomputeEntry(entry: DiaryEntry, quantity: number, unit: EntryUnit): DiaryEntry {
  const snap = entry.food;
  if (snap === null || unit === "quick") throw new Error("quick entries have no amount to change");
  const base = toBase(snap, quantity, unit);
  if (!base.ok) throw new Error(`cannot log this amount: ${base.reason}`);
  return {
    ...entry,
    quantity,
    unit,
    grams: round2(base.base),
    nutrients: entryNutrients(snap.per100, base.base),
  };
}

export interface MakeQuickEntryInput {
  name: string;
  values: Partial<Record<NutrientKey, number>>;
  foodDay: string;
  meal: Pick<MealSlot, "id" | "name">;
  now: Date;
  id: string;
  note?: string | null;
}

export function makeQuickEntry(input: MakeQuickEntryInput): DiaryEntry {
  return {
    id: input.id,
    foodDay: input.foodDay,
    mealId: input.meal.id,
    mealName: input.meal.name,
    eatenAt: input.now.toISOString(),
    foodId: null,
    name: input.name,
    brand: null,
    quantity: 1,
    unit: "quick",
    grams: null,
    food: null,
    nutrients: nutrientsFromPartial(input.values),
    note: input.note ?? null,
  };
}

/** "123", "~123" (derived), "≥ 123" (known part of an incomplete total), "–" (unknown). */
export function formatTotal(v: NutrientValue, decimals: number): string {
  const text = v.value.toFixed(decimals);
  if (v.state === "incomplete") return v.value > 0 ? `≥ ${text}` : "–";
  if (v.state === "derived") return `~${text}`;
  return text;
}
