// Recipes: a list of ingredients rolled up into one food (per 100 g of the
// finished dish), so a recipe is logged, searched and re-logged like any food.
// Ingredients keep their own nutrient snapshot, so later edits or deletions of
// a food never change a saved recipe. Pure, no app imports.

import type { DiaryEntry, EntryUnit, Food, FoodSnapshot } from "./diary-types.ts";
import { copyNutrients, entryNutrients, sumNutrients, toBase } from "./entry-math.ts";
import { emptyNutrients, scaleNutrients } from "./nutrients.ts";
import type { NutrientKey, Nutrients } from "./nutrients.ts";

export interface RecipeItem {
  /** The food it came from; null once that food is gone or for a typed-in item. */
  foodId: string | null;
  name: string;
  quantity: number;
  unit: Exclude<EntryUnit, "quick">;
  /** Base amount: grams, or ml for a liquid (1 ml counts as 1 g in the dish's weight). */
  grams: number;
  per100: Nutrients;
  liquid: boolean;
  servingAmount?: number | null;
  packageAmount?: number | null;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  /** Weight of the finished dish; null = the raw ingredients' weight. */
  cookedWeight: number | null;
  liquid: boolean;
  note: string | null;
  items: RecipeItem[];
  /** The food this recipe is logged as (source "recipe", sourceId = recipe id). */
  foodId: string | null;
  archived: boolean;
}

export interface Rollup {
  /** Weight the per-100 values are based on: cooked weight, else raw total. */
  totalWeight: number;
  rawWeight: number;
  servingWeight: number;
  per100: Nutrients;
  /** At least one main nutrient is missing for some ingredient: totals are a lower bound. */
  incomplete: boolean;
}

const MAIN: readonly NutrientKey[] = ["energy", "protein", "carbohydrates", "fat"];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Why a recipe can't be saved, in plain words; null when it can. */
export function recipeProblem(r: Pick<Recipe, "name" | "servings" | "cookedWeight" | "items">): string | null {
  if (r.name.trim() === "") return "Give the recipe a name.";
  if (!(Number.isFinite(r.servings) && r.servings > 0)) return "Servings must be more than 0.";
  if (r.cookedWeight !== null && !(Number.isFinite(r.cookedWeight) && r.cookedWeight > 0))
    return "Cooked weight must be more than 0, or left empty.";
  if (r.items.length === 0) return "Add at least one ingredient.";
  return null;
}

/** Add the ingredients up. Throws when servings or the weight is not above 0. */
export function rollup(
  items: readonly RecipeItem[],
  opts: { servings: number; cookedWeight: number | null; liquid?: boolean },
): Rollup {
  if (!(opts.servings > 0)) throw new Error("servings must be more than 0");
  const rawWeight = items.reduce((s, i) => s + i.grams, 0);
  const totalWeight = opts.cookedWeight ?? rawWeight;
  if (!(totalWeight > 0)) throw new Error("the recipe weighs nothing");
  const sum = sumNutrients(items.map((i) => entryNutrients(i.per100, i.grams)));
  const per100 = items.length ? scaleNutrients(sum, 100 / totalWeight) : emptyNutrients();
  return {
    totalWeight: round2(totalWeight),
    rawWeight: round2(rawWeight),
    servingWeight: round2(totalWeight / opts.servings),
    per100,
    incomplete: MAIN.some((k) => per100[k].state === "incomplete"),
  };
}

/** One ingredient from a food at an amount; null when the amount doesn't fit the food. */
export function itemFromFood(food: Food, quantity: number, unit: Exclude<EntryUnit, "quick">): RecipeItem | null {
  const base = toBase(food, quantity, unit);
  if (!base.ok) return null;
  return {
    foodId: food.id,
    name: food.name,
    quantity,
    unit,
    grams: round2(base.base),
    per100: copyNutrients(food.nutrients),
    liquid: food.liquid,
    servingAmount: food.servingAmount,
    packageAmount: food.packageAmount,
  };
}

/** The food a recipe is logged as. One serving = one portion of the dish; one package = the whole dish. */
export function recipeFood(recipe: Recipe, r: Rollup, foodId: string): Food {
  return {
    id: foodId,
    name: recipe.name.trim(),
    brand: null,
    barcode: null,
    liquid: recipe.liquid,
    servingAmount: r.servingWeight > 0 ? r.servingWeight : null,
    packageAmount: r.totalWeight > 0 ? r.totalWeight : null,
    nutrients: r.per100,
    source: "recipe",
    sourceId: recipe.id,
    sourceUrl: null,
    note: recipe.note,
    archived: recipe.archived,
  };
}

/**
 * Would adding `candidateFoodId` as an ingredient make the recipe contain itself?
 * True for the recipe's own food and for any recipe that (at any depth) uses it.
 */
export function wouldCycle(recipeFoodId: string | null, candidateFoodId: string, recipes: readonly Recipe[]): boolean {
  if (recipeFoodId === null) return false;
  const byFood = new Map(recipes.filter((r) => r.foodId).map((r) => [r.foodId as string, r]));
  const seen = new Set<string>();
  const contains = (foodId: string): boolean => {
    if (foodId === recipeFoodId) return true;
    if (seen.has(foodId)) return false;
    seen.add(foodId);
    const r = byFood.get(foodId);
    return !!r && r.items.some((i) => i.foodId !== null && contains(i.foodId));
  };
  return contains(candidateFoodId);
}

/**
 * Split a logged recipe back into its ingredients, scaled to the share eaten
 * (entry grams / dish weight). The new entries keep the entry's day, meal,
 * time and status, and get fresh ids.
 */
export function unpackEntry(entry: DiaryEntry, recipe: Recipe, mkId: () => string): DiaryEntry[] {
  if (entry.grams === null || !(entry.grams > 0) || recipe.items.length === 0) return [];
  const r = rollup(recipe.items, { servings: recipe.servings, cookedWeight: recipe.cookedWeight });
  const fraction = entry.grams / r.totalWeight;
  return recipe.items.map((item) => {
    const snapshot: FoodSnapshot = {
      liquid: item.liquid,
      servingAmount: item.servingAmount ?? null,
      packageAmount: item.packageAmount ?? null,
      source: "user",
      sourceUrl: null,
      per100: copyNutrients(item.per100),
    };
    const grams = item.grams * fraction;
    return {
      id: mkId(),
      foodDay: entry.foodDay,
      mealId: entry.mealId,
      mealName: entry.mealName,
      eatenAt: entry.eatenAt,
      foodId: item.foodId,
      name: item.name,
      brand: null,
      quantity: round2(item.quantity * fraction) || round2(grams),
      unit: item.unit,
      grams: round2(grams),
      food: snapshot,
      nutrients: entryNutrients(snapshot.per100, grams),
      note: null,
      status: entry.status ?? "logged",
    };
  });
}

// ---------- Rows ----------

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function recipeToRow(r: Recipe): Row {
  return {
    id: r.id,
    name: r.name,
    servings: r.servings,
    cooked_weight: r.cookedWeight,
    liquid: r.liquid,
    note: r.note,
    items: r.items,
    food_id: r.foodId,
    archived: r.archived,
  };
}

export function rowToRecipe(row: Row): Recipe {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    servings: num(row.servings) ?? 1,
    cookedWeight: num(row.cooked_weight),
    liquid: row.liquid === true,
    note: typeof row.note === "string" ? row.note : null,
    items: Array.isArray(row.items) ? (row.items as RecipeItem[]) : [],
    foodId: typeof row.food_id === "string" ? row.food_id : null,
    archived: row.archived === true,
  };
}
