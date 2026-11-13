import test from "node:test";
import assert from "node:assert/strict";
import { itemFromFood, recipeFood, recipeProblem, rollup, unpackEntry, wouldCycle, type Recipe, type RecipeItem } from "../src/lib/nutrition/recipe.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { dayTotals, makeEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";
import { createNutritionStore, type ReadQuery } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

// Made-up foods with made-up numbers.
function food(id: string, energy: number, protein: number, over: Partial<Food> = {}): Food {
  const n = emptyNutrients();
  n.energy = complete(energy);
  n.protein = complete(protein);
  n.carbohydrates = complete(0);
  n.fat = complete(0);
  return {
    id,
    name: `Food ${id}`,
    brand: null,
    barcode: null,
    liquid: false,
    servingAmount: 50,
    packageAmount: null,
    nutrients: n,
    source: "user",
    sourceId: null,
    sourceUrl: null,
    note: null,
    archived: false,
    ...over,
  };
}
const A = food("a", 100, 10);
const B = food("b", 300, 0);
const item = (f: Food, g: number) => itemFromFood(f, g, "g") as RecipeItem;

function recipe(over: Partial<Recipe> = {}): Recipe {
  return { id: "r1", name: "Test stew", servings: 2, cookedWeight: null, liquid: false, note: null, items: [item(A, 200), item(B, 100)], foodId: "rf1", archived: false, ...over };
}

test("a two-ingredient rollup is exact", () => {
  const r = rollup([item(A, 200), item(B, 100)], { servings: 2, cookedWeight: null });
  assert.equal(r.totalWeight, 300);
  assert.equal(r.servingWeight, 150);
  // 200 kcal + 300 kcal over 300 g = 166.67 per 100 g.
  assert.ok(Math.abs(r.per100.energy.value - 500 / 3) < 1e-9);
  assert.ok(Math.abs(r.per100.protein.value - 20 / 3) < 1e-9);
  assert.equal(r.incomplete, false);
});

test("a cooked weight below the raw weight raises the per-100 values", () => {
  const raw = rollup([item(A, 200), item(B, 100)], { servings: 2, cookedWeight: null });
  const cooked = rollup([item(A, 200), item(B, 100)], { servings: 2, cookedWeight: 250 });
  assert.equal(cooked.totalWeight, 250);
  assert.equal(cooked.per100.energy.value, 200);
  assert.ok(cooked.per100.energy.value > raw.per100.energy.value);
});

test("an ingredient with a missing value makes the recipe incomplete, never zero", () => {
  const n = emptyNutrients();
  n.energy = complete(50);
  const partial = food("p", 0, 0, { nutrients: n });
  const r = rollup([item(A, 100), item(partial, 100)], { servings: 1, cookedWeight: null });
  assert.equal(r.per100.protein.state, "incomplete");
  assert.equal(r.per100.protein.value, 5);
  assert.equal(r.incomplete, true);
});

test("a recipe used inside another recipe rolls up through its food", () => {
  const inner = recipe();
  const innerFood = recipeFood(inner, rollup(inner.items, inner), "rf1");
  const outer = rollup([item(innerFood, 150), item(A, 50)], { servings: 1, cookedWeight: null });
  // 150 g of the stew is half of it (250 kcal) + 50 kcal of A, over 200 g.
  assert.ok(Math.abs(outer.per100.energy.value - 150) < 1e-9);
});

test("the linked food points back at the recipe", () => {
  const r = recipe();
  const f = recipeFood(r, rollup(r.items, r), "rf1");
  assert.equal(f.source, "recipe");
  assert.equal(f.sourceId, "r1");
  assert.equal(f.servingAmount, 150);
  assert.equal(f.packageAmount, 300);
});

test("servings of 0 are rejected", () => {
  assert.throws(() => rollup([item(A, 100)], { servings: 0, cookedWeight: null }));
  assert.equal(recipeProblem(recipe({ servings: 0 })), "Servings must be more than 0.");
  assert.equal(recipeProblem(recipe()), null);
  assert.ok(recipeProblem(recipe({ items: [] })));
});

test("direct and indirect cycles are rejected", () => {
  const r1 = recipe({ id: "r1", foodId: "f1", items: [item(A, 100)] });
  const r2 = recipe({ id: "r2", foodId: "f2", items: [{ ...item(A, 100), foodId: "f1" }] });
  const r3 = recipe({ id: "r3", foodId: "f3", items: [{ ...item(A, 100), foodId: "f2" }] });
  const all = [r1, r2, r3];
  assert.equal(wouldCycle("f1", "f1", all), true, "itself");
  assert.equal(wouldCycle("f1", "f2", all), true, "r2 uses r1");
  assert.equal(wouldCycle("f1", "f3", all), true, "r3 uses r2 which uses r1");
  assert.equal(wouldCycle("f3", "f1", all), false);
  assert.equal(wouldCycle("f1", "a", all), false);
});

test("splitting half a recipe gives ingredients that sum to half", () => {
  const r = recipe();
  const f = recipeFood(r, rollup(r.items, r), "rf1");
  const meal = DEFAULT_MEALS[0];
  const entry = makeEntry({ food: f, quantity: 1, unit: "serving", foodDay: "2026-11-12", meal, now: new Date("2026-11-12T08:00:00Z"), id: "e1" });
  let n = 0;
  const parts = unpackEntry(entry, r, () => `p${++n}`);
  assert.equal(parts.length, 2);
  assert.ok(Math.abs(dayTotals(parts).energy.value - 250) < 1e-9);
  assert.ok(Math.abs(dayTotals(parts).energy.value - entry.nutrients.energy.value) < 1e-9);
  assert.deepEqual(parts.map((p) => [p.foodDay, p.mealId, p.eatenAt, p.grams]), [
    ["2026-11-12", meal.id, entry.eatenAt, 100],
    ["2026-11-12", meal.id, entry.eatenAt, 50],
  ]);
  assert.deepEqual(parts.map((p) => p.id), ["p1", "p2"]);
});

// ---------- Store ----------

function rig(ready = true) {
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
  let isReady = ready;
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async (q: ReadQuery) => (void q, { data: null, error: { message: "Failed to fetch" } }) },
    userId: async () => "u",
    newId: () => "new-food",
    schema: { probeTable: async () => isReady, probeColumn: async () => isReady },
  });
  const ops = () => ((box.value as { op: NOp }[]) ?? []).map((e) => e.op);
  return { kv, store, ops, setReady: (v: boolean) => (isReady = v) };
}

test("saving a recipe queues its food then the recipe, in one go", async () => {
  const r = rig();
  const { food: f } = await r.store.saveRecipe(recipe({ foodId: null }));
  assert.equal(f.id, "new-food");
  assert.deepEqual(r.ops().map((o) => [o.kind, o.table]), [["insert", "foods"], ["insert", "recipes"]]);
  // Saving again updates both.
  await r.store.saveRecipe(recipe({ foodId: "new-food", name: "Renamed" }));
  assert.deepEqual(r.ops().slice(2).map((o) => [o.kind, o.table]), [["update", "foods"], ["update", "recipes"]]);
});

test("before the server has recipes, the recipe and its food stay on the phone and entries drop the link", async () => {
  const r = rig(false);
  const { food: f, recipe: saved } = await r.store.saveRecipe(recipe());
  assert.equal(saved.localOnly, true);
  assert.deepEqual(r.ops(), []);
  const e = makeEntry({ food: f, quantity: 1, unit: "serving", foodDay: "2026-11-12", meal: DEFAULT_MEALS[0], now: new Date(), id: "e1" });
  await r.store.addEntry(e);
  const sent = r.ops()[0] as Extract<NOp, { kind: "insert" }>;
  assert.equal(sent.rows[0].food_id, null);
  // Once the server is ready the food goes first, then the recipe.
  r.setReady(true);
  await r.store.listRecipes();
  assert.deepEqual(r.ops().slice(1).map((o) => [o.kind, o.table]), [["insert", "foods"], ["insert", "recipes"]]);
});

test("splitting an entry replaces it with its parts as one change", async () => {
  const r = rig();
  const rec = recipe();
  const f = recipeFood(rec, rollup(rec.items, rec), "rf1");
  const e = makeEntry({ food: f, quantity: 1, unit: "serving", foodDay: "2026-11-12", meal: DEFAULT_MEALS[0], now: new Date(), id: "e1" });
  await r.store.addEntry(e);
  let n = 0;
  await r.store.replaceEntry(e, unpackEntry(e, rec, () => `p${++n}`));
  assert.deepEqual((await r.store.listDay("2026-11-12")).map((x) => x.id).sort(), ["p1", "p2"]);
  assert.deepEqual(r.ops().slice(1).map((o) => o.kind), ["delete", "insert"]);
});
