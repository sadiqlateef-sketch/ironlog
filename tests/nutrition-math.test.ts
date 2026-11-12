import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISPLAY_NUTRIENTS, G_PER_OZ, ML_PER_FLOZ, allowedUnits, dayTotals, entryNutrients, formatTotal,
  makeEntry, makeQuickEntry, mealTotals, recomputeEntry, sumNutrients, toBase, zeroNutrients,
} from "../src/lib/nutrition/entry-math.ts";
import { entryToRow, foodToRow, rowToEntry, rowToFood } from "../src/lib/nutrition/diary-types.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";
import { NUTRIENT_KEYS, complete, derived, emptyNutrients, incomplete } from "../src/lib/nutrition/nutrients.ts";

// Clearly fake food: per 100 g.
function fakeFood(over: Partial<Food> = {}): Food {
  const n = emptyNutrients();
  n.energy = complete(200);
  n.protein = complete(10);
  n.carbohydrates = complete(30);
  n.fat = complete(5);
  n.fiber = complete(4);
  n.sugars = complete(2);
  n.sodium = complete(0.5);
  n.caffeine = complete(0);
  return {
    id: "food-1", name: "Fake Oats", brand: "Fake Co", barcode: null, liquid: false,
    servingAmount: 40, packageAmount: 500, nutrients: n, source: "user", sourceId: null,
    sourceUrl: null, note: null, archived: false, ...over,
  };
}

const meal = { id: "meal-lunch", name: "Lunch" };
const now = new Date(2026, 10, 12, 12, 30);
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("constants", () => {
  near(G_PER_OZ, 28.3495, 1e-3);
  near(ML_PER_FLOZ, 29.5735, 1e-3);
});

test("grams scale per 100", () => {
  const e = makeEntry({ food: fakeFood(), quantity: 150, unit: "g", foodDay: "2026-11-12", meal, now, id: "e1" });
  near(e.nutrients.energy.value, 300);
  near(e.nutrients.protein.value, 15);
  near(e.nutrients.carbohydrates.value, 45);
  near(e.nutrients.fat.value, 7.5);
  near(e.nutrients.fiber.value, 6);
  near(e.nutrients.sugars.value, 3);
  near(e.nutrients.sodium.value, 0.75);
  assert.equal(e.grams, 150);
  assert.equal(e.eatenAt, now.toISOString());
});

test("ounces use G_PER_OZ", () => {
  const e = makeEntry({ food: fakeFood(), quantity: 100, unit: "oz", foodDay: "2026-11-12", meal, now, id: "e1" });
  const base = 100 * G_PER_OZ;
  near(e.nutrients.energy.value, (200 * base) / 100);
  assert.equal(e.grams, Math.round(base * 100) / 100);
  near(e.grams!, 2834.95, 0.1);
});

test("liquids use ml and fl oz", () => {
  const milk = fakeFood({ liquid: true });
  const ml = makeEntry({ food: milk, quantity: 250, unit: "ml", foodDay: "d", meal, now, id: "a" });
  near(ml.nutrients.energy.value, 500);
  const fl = makeEntry({ food: milk, quantity: 8, unit: "fl_oz", foodDay: "d", meal, now, id: "b" });
  near(fl.nutrients.energy.value, (200 * (8 * ML_PER_FLOZ)) / 100);
  near(fl.grams!, 236.59, 0.01);
});

test("serving and package", () => {
  const f = fakeFood();
  const s = makeEntry({ food: f, quantity: 2, unit: "serving", foodDay: "d", meal, now, id: "a" });
  assert.equal(s.grams, 80);
  near(s.nutrients.energy.value, 160);
  const p = makeEntry({ food: f, quantity: 0.5, unit: "package", foodDay: "d", meal, now, id: "b" });
  assert.equal(p.grams, 250);
  near(p.nutrients.energy.value, 500);
});

test("unit rules", () => {
  const f = fakeFood();
  const liquid = fakeFood({ liquid: true });
  assert.deepEqual(allowedUnits(f), ["g", "oz", "serving", "package"]);
  assert.deepEqual(allowedUnits(liquid), ["ml", "fl_oz", "serving", "package"]);
  assert.deepEqual(allowedUnits(fakeFood({ servingAmount: null, packageAmount: null })), ["g", "oz"]);
  assert.deepEqual(toBase(liquid, 1, "g"), { ok: false, reason: "unit-not-allowed" });
  assert.deepEqual(toBase(liquid, 1, "oz"), { ok: false, reason: "unit-not-allowed" });
  assert.deepEqual(toBase(f, 1, "ml"), { ok: false, reason: "unit-not-allowed" });
  assert.deepEqual(toBase(f, 1, "fl_oz"), { ok: false, reason: "unit-not-allowed" });
  assert.deepEqual(toBase(f, 1, "quick"), { ok: false, reason: "unit-not-allowed" });
  const bare = fakeFood({ servingAmount: null, packageAmount: null });
  assert.deepEqual(toBase(bare, 1, "serving"), { ok: false, reason: "no-serving" });
  assert.deepEqual(toBase(bare, 1, "package"), { ok: false, reason: "no-package" });
});

test("bad quantities are rejected", () => {
  for (const q of [0, -1, NaN, Infinity, -Infinity]) {
    assert.deepEqual(toBase(fakeFood(), q, "g"), { ok: false, reason: "bad-quantity" });
  }
  assert.throws(() => makeEntry({ food: fakeFood(), quantity: 0, unit: "g", foodDay: "d", meal, now, id: "x" }));
  assert.throws(() => makeEntry({ food: fakeFood({ liquid: true }), quantity: 5, unit: "g", foodDay: "d", meal, now, id: "x" }));
});

test("entryNutrients keeps states", () => {
  const n = emptyNutrients();
  n.energy = complete(100);
  n.fiber = { value: 3, state: "incomplete" };
  n.sodium = derived(0.2, "sodium=salt/2.5");
  const out = entryNutrients(n, 50);
  assert.deepEqual(out.energy, complete(50));
  assert.deepEqual(out.fiber, { value: 1.5, state: "incomplete" });
  assert.equal(out.sodium.state, "derived");
  assert.equal(out.sodium.rule, "sodium=salt/2.5");
  near(out.sodium.value, 0.1);
  assert.deepEqual(out.protein, incomplete());
});

test("zeroNutrients is complete, all 43 keys", () => {
  const z = zeroNutrients();
  assert.equal(NUTRIENT_KEYS.length, 43);
  for (const k of NUTRIENT_KEYS) assert.deepEqual(z[k], complete(0));
});

test("sums: complete stays complete, incomplete propagates with the known part", () => {
  const full = (kcal: number, fiber: number) => {
    const n = zeroNutrients();
    n.energy = complete(kcal);
    n.fiber = complete(fiber);
    return n;
  };
  const a = full(100, 2);
  const b = full(50, 1);
  const t = sumNutrients([a, b]);
  assert.deepEqual(t.energy, complete(150));
  assert.deepEqual(t.fiber, complete(3));

  const c = full(10, 0);
  c.fiber = { value: 0, state: "incomplete" };
  const t2 = sumNutrients([a, b, c]);
  assert.deepEqual(t2.fiber, { value: 3, state: "incomplete" });
  assert.equal(t2.energy.state, "complete");

  const d = full(10, 1);
  d.energy = derived(10, "r");
  assert.equal(sumNutrients([a, d]).energy.state, "derived");
  assert.deepEqual(sumNutrients([]), zeroNutrients());
});

test("dayTotals and mealTotals add entries", () => {
  const f = fakeFood();
  const e1 = makeEntry({ food: f, quantity: 100, unit: "g", foodDay: "d", meal, now, id: "1" });
  const e2 = makeEntry({ food: f, quantity: 50, unit: "g", foodDay: "d", meal, now, id: "2" });
  near(dayTotals([e1, e2]).energy.value, 300);
  near(mealTotals([e1]).protein.value, 10);
  assert.equal(DISPLAY_NUTRIENTS.length, 8);
  assert.ok(DISPLAY_NUTRIENTS.includes("energy"));
});

test("a quick entry makes unknown keys incomplete and gives day totals a floor", () => {
  const q = makeQuickEntry({ name: "Fake snack", values: { energy: 200, protein: 5 }, foodDay: "d", meal, now, id: "q" });
  assert.equal(q.unit, "quick");
  assert.equal(q.quantity, 1);
  assert.equal(q.grams, null);
  assert.equal(q.food, null);
  assert.deepEqual(q.nutrients.energy, complete(200));
  assert.deepEqual(q.nutrients.fiber, incomplete());
  const withFood = makeEntry({ food: fakeFood(), quantity: 100, unit: "g", foodDay: "d", meal, now, id: "e" });
  const total = dayTotals([q, withFood]);
  assert.deepEqual(total.fiber, { value: 4, state: "incomplete" });
  assert.deepEqual(total.energy, complete(400));
});

test("snapshot: editing or deleting the food later changes nothing", () => {
  const f = fakeFood();
  const e = makeEntry({ food: f, quantity: 100, unit: "g", foodDay: "d", meal, now, id: "e" });
  const before = JSON.stringify(e);
  f.nutrients.energy.value = 9999;
  f.servingAmount = 1;
  f.name = "Renamed";
  assert.equal(JSON.stringify(e), before);
  const r = recomputeEntry(e, 200, "g");
  near(r.nutrients.energy.value, 400);
  // recompute reads the snapshot (serving 40 g), not the changed live food (serving 1 g)
  const s = recomputeEntry(e, 1, "serving");
  assert.equal(s.grams, 40);
  near(s.nutrients.energy.value, 80);
  assert.equal(e.quantity, 100);
});

test("recomputeEntry rejects quick entries and bad units", () => {
  const q = makeQuickEntry({ name: "x", values: { energy: 1 }, foodDay: "d", meal, now, id: "q" });
  assert.throws(() => recomputeEntry(q, 2, "g"));
  const e = makeEntry({ food: fakeFood(), quantity: 1, unit: "g", foodDay: "d", meal, now, id: "e" });
  assert.throws(() => recomputeEntry(e, 1, "ml"));
});

test("formatTotal", () => {
  assert.equal(formatTotal(complete(123.4), 0), "123");
  assert.equal(formatTotal(complete(1.26), 1), "1.3");
  assert.equal(formatTotal(derived(12.6, "r"), 0), "~13");
  assert.equal(formatTotal({ value: 123.4, state: "incomplete" }, 0), "≥ 123");
  assert.equal(formatTotal(incomplete(), 0), "–");
  assert.equal(formatTotal(complete(0), 0), "0");
});

test("row converters round-trip", () => {
  const f = fakeFood({ source: "off", sourceId: "123", sourceUrl: "https://example.test/x" });
  const entry = makeEntry({ food: f, quantity: 2, unit: "serving", foodDay: "2026-11-12", meal, now, id: "e1" });
  const row = entryToRow(entry);
  assert.ok(!("user_id" in row) && !("created_at" in row));
  assert.equal(row.food_day, "2026-11-12");
  assert.equal(row.unit, "serving");
  const back = rowToEntry({ ...row, user_id: "u", created_at: "t", updated_at: "t" });
  assert.deepEqual(back, entry);

  const quick = makeQuickEntry({ name: "q", values: { energy: 5 }, foodDay: "d", meal, now, id: "q" });
  const qrow = entryToRow(quick);
  assert.equal(qrow.food, null);
  assert.deepEqual(rowToEntry({ ...qrow, user_id: "u", created_at: "t", updated_at: "t" }), quick);

  const frow = foodToRow(f);
  assert.ok(!("user_id" in frow));
  assert.deepEqual(rowToFood({ ...frow, user_id: "u", created_at: "t", updated_at: "t" }), f);
});

test("numeric strings from the server are accepted", () => {
  const entry = makeEntry({ food: fakeFood(), quantity: 150, unit: "g", foodDay: "d", meal, now, id: "e" });
  const row = {
    ...entryToRow(entry),
    quantity: "150.000" as unknown as number,
    grams: "150.00" as unknown as number,
    user_id: "u", created_at: "t", updated_at: "t",
  };
  const back = rowToEntry(row);
  assert.equal(back.quantity, 150);
  assert.equal(back.grams, 150);
});
