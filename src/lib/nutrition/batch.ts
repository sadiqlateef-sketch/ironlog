// Batch cooking: a recipe cooked once and eaten as portions over a few days.
// Logging a portion takes one off what's left. Pure, no app imports.

import type { DiaryEntry, Food, MealSlot } from "./diary-types.ts";
import { makeEntry } from "./entry-math.ts";
import type { Recipe, Rollup } from "./recipe.ts";

/**
 * How many days after cooking a batch's "use by" defaults to. A user-editable
 * default (a setting, not advice); USDA FSIS leftovers guidance,
 * https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety
 */
export const LEFTOVER_DAYS = 3;

export interface Batch {
  id: string;
  recipeId: string | null;
  /** The recipe's food, which portions are logged as. */
  foodId: string;
  name: string;
  /** "YYYY-MM-DD" */
  madeOn: string;
  portions: number;
  portionsLeft: number;
  /** One portion, in g (ml when liquid). */
  portionAmount: number;
  useBy: string | null;
  finished: boolean;
  note: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "YYYY-MM-DD" plus `days`, in calendar days. */
export function addDaysTo(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function defaultUseBy(madeOn: string, days = LEFTOVER_DAYS): string {
  return addDaysTo(madeOn, days);
}

export function makeBatch(recipe: Recipe, r: Rollup, portions: number, madeOn: string, useBy: string | null, id: string): Batch {
  if (!(portions > 0)) throw new Error("portions must be more than 0");
  if (!recipe.foodId) throw new Error("save the recipe first");
  return {
    id,
    recipeId: recipe.id,
    foodId: recipe.foodId,
    name: recipe.name,
    madeOn,
    portions,
    portionsLeft: portions,
    portionAmount: round2(r.totalWeight / portions),
    useBy,
    finished: false,
    note: null,
  };
}

/** The diary entry for `count` portions, using the recipe's food. */
export function portionEntry(
  batch: Batch,
  food: Food,
  count: number,
  at: { foodDay: string; meal: Pick<MealSlot, "id" | "name">; now: Date; id: string },
): DiaryEntry {
  const quantity = round2(count * batch.portionAmount);
  return makeEntry({ food, quantity, unit: food.liquid ? "ml" : "g", foodDay: at.foodDay, meal: at.meal, now: at.now, id: at.id });
}

/** The batch after eating `count` portions: never below 0, finished at 0. */
export function afterPortion(batch: Batch, count: number): Batch {
  const left = Math.max(0, round2(batch.portionsLeft - Math.max(0, count)));
  return { ...batch, portionsLeft: left, finished: left === 0 };
}

/** "2 of 4 portions left" */
export function portionsLeftText(b: Pick<Batch, "portions" | "portionsLeft">): string {
  const n = Number(b.portionsLeft.toFixed(2));
  return `${n} of ${Number(b.portions.toFixed(2))} ${b.portions === 1 ? "portion" : "portions"} left`;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function batchToRow(b: Batch): Row {
  return {
    id: b.id,
    recipe_id: b.recipeId,
    food_id: b.foodId,
    name: b.name,
    made_on: b.madeOn,
    portions: b.portions,
    portions_left: b.portionsLeft,
    portion_amount: b.portionAmount,
    use_by: b.useBy,
    finished: b.finished,
    note: b.note,
  };
}

export function rowToBatch(row: Row): Batch {
  return {
    id: String(row.id),
    recipeId: typeof row.recipe_id === "string" ? row.recipe_id : null,
    foodId: String(row.food_id),
    name: String(row.name ?? ""),
    madeOn: String(row.made_on),
    portions: num(row.portions) ?? 1,
    portionsLeft: num(row.portions_left) ?? 0,
    portionAmount: num(row.portion_amount) ?? 1,
    useBy: typeof row.use_by === "string" ? row.use_by : null,
    finished: row.finished === true,
    note: typeof row.note === "string" ? row.note : null,
  };
}
