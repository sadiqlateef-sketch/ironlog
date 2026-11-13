import test from "node:test";
import assert from "node:assert/strict";
import { addDaysTo, afterPortion, defaultUseBy, LEFTOVER_DAYS, makeBatch, portionEntry, portionsLeftText } from "../src/lib/nutrition/batch.ts";
import { itemFromFood, recipeFood, rollup, type Recipe, type RecipeItem } from "../src/lib/nutrition/recipe.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";
import { createNutritionStore } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

// Made-up food with made-up numbers.
const n = emptyNutrients();
n.energy = complete(200);
n.protein = complete(20);
const RICE: Food = { id: "a", name: "Test base", brand: null, barcode: null, liquid: false, servingAmount: null, packageAmount: null, nutrients: n, source: "user", sourceId: null, sourceUrl: null, note: null, archived: false };
const recipe: Recipe = { id: "r1", name: "Test stew", servings: 4, cookedWeight: 800, liquid: false, note: null, items: [itemFromFood(RICE, 1000, "g") as RecipeItem], foodId: "rf", archived: false };
const roll = rollup(recipe.items, recipe);
const food = recipeFood(recipe, roll, "rf");
const meal = DEFAULT_MEALS[0];

test("a batch splits the dish into equal portions", () => {
  const b = makeBatch(recipe, roll, 4, "2026-11-12", null, "b1");
  assert.equal(b.portionAmount, 200);
  assert.equal(b.portionsLeft, 4);
  assert.equal(b.foodId, "rf");
  assert.throws(() => makeBatch(recipe, roll, 0, "2026-11-12", null, "b2"));
});

test("portions decrement and the batch finishes at 0", () => {
  let b = makeBatch(recipe, roll, 2, "2026-11-12", null, "b1");
  b = afterPortion(b, 1);
  assert.equal(b.portionsLeft, 1);
  assert.equal(b.finished, false);
  b = afterPortion(b, 1);
  assert.equal(b.portionsLeft, 0);
  assert.equal(b.finished, true);
  assert.equal(portionsLeftText(b), "0 of 2 portions left");
});

test("logging more than is left clamps at 0", () => {
  const b = afterPortion(makeBatch(recipe, roll, 2, "2026-11-12", null, "b1"), 5);
  assert.equal(b.portionsLeft, 0);
  assert.equal(b.finished, true);
});

test("a portion's nutrients are portion size times the dish per 100", () => {
  const b = makeBatch(recipe, roll, 4, "2026-11-12", null, "b1");
  const e = portionEntry(b, food, 1.5, { foodDay: "2026-11-12", meal, now: new Date("2026-11-12T12:00:00Z"), id: "e1" });
  // Dish: 2000 kcal over 800 g = 250 per 100 g; 1.5 portions = 300 g = 750 kcal.
  assert.equal(e.grams, 300);
  assert.ok(Math.abs(e.nutrients.energy.value - 750) < 1e-9);
  assert.equal(e.unit, "g");
});

test("use-by defaults to a few days after cooking, as a setting", () => {
  assert.equal(LEFTOVER_DAYS, 3);
  assert.equal(defaultUseBy("2026-11-30"), "2026-12-03");
  assert.equal(defaultUseBy("2026-11-30", 1), "2026-12-01");
  assert.equal(addDaysTo("2026-12-31", 1), "2027-01-01");
});

test("logging a portion queues the entry and the smaller batch together", async () => {
  const kv = new Map<string, unknown>();
  const box = { value: undefined as unknown };
  const db: DbLike = {
    from: () => ({
      upsert: async () => ({ error: null }),
      update: () => ({ in: async () => ({ error: null }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  const outbox = createNutritionOutbox({
    store: { get: async () => box.value, set: async (v) => ((box.value = v), true) },
    getDb: () => db,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => false,
  });
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async () => ({ data: null, error: { message: "Failed to fetch" } }) },
    userId: async () => "u",
  });
  const b = makeBatch(recipe, roll, 2, "2026-11-12", null, "b1");
  await store.saveBatch(b);
  const e = portionEntry(b, food, 1, { foodDay: "2026-11-12", meal, now: new Date(), id: "e1" });
  const next = await store.logBatchPortion("b1", e, 1);
  assert.equal(next?.portionsLeft, 1);
  const ops = ((box.value as { op: NOp }[]) ?? []).map((x) => x.op);
  assert.deepEqual(ops.map((o) => [o.kind, o.table]), [["insert", "batches"], ["insert", "food_entries"], ["update", "batches"]]);
  assert.equal(await outbox.pendingCount(), 3);
});
