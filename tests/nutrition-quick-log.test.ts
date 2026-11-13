import test from "node:test";
import assert from "node:assert/strict";
import { copiedText, copyMealEntries, copyMealLabel, pushRecentScan, relogEntry } from "../src/lib/nutrition/quick-log.ts";
import { makeEntry, makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";

// Made-up foods and numbers.
function food(over: Partial<Food> = {}): Food {
  const n = emptyNutrients();
  n.energy = complete(400);
  n.protein = complete(10);
  return {
    id: "oats", name: "Test oats", brand: null, barcode: null, liquid: false, servingAmount: 40, packageAmount: null,
    nutrients: n, source: "user", sourceId: null, sourceUrl: null, note: null, archived: false, ...over,
  };
}
const [breakfast, lunch] = DEFAULT_MEALS;
const Y = "2026-11-12";
const T = "2026-11-13";

test("copyMealEntries copies only that meal, in time order, with new ids, day and time", () => {
  const yesterday = [
    makeEntry({ food: food(), quantity: 2, unit: "serving", foodDay: Y, meal: breakfast, now: new Date("2026-11-12T08:30:00Z"), id: "b2" }),
    makeEntry({ food: food(), quantity: 50, unit: "g", foodDay: Y, meal: lunch, now: new Date("2026-11-12T12:00:00Z"), id: "l1" }),
    makeQuickEntry({ name: "Coffee", values: { energy: 5 }, foodDay: Y, meal: breakfast, now: new Date("2026-11-12T07:00:00Z"), id: "b1" }),
  ];
  let n = 0;
  const now = new Date("2026-11-13T09:00:00Z");
  const copies = copyMealEntries(yesterday, breakfast.id, T, breakfast, now, () => `new-${++n}`);
  assert.deepEqual(copies.map((c) => c.name), ["Coffee", "Test oats"]);
  assert.deepEqual(copies.map((c) => c.id), ["new-1", "new-2"]);
  assert.ok(copies.every((c) => c.foodDay === T && c.mealId === breakfast.id && c.mealName === breakfast.name));
  assert.equal(copies[0].eatenAt, "2026-11-13T09:00:00.000Z");
  assert.equal(copies[1].eatenAt, "2026-11-13T09:00:00.001Z");
  assert.equal(copies[1].quantity, 2);
  assert.equal(copies[1].unit, "serving");
  assert.equal(copies[1].nutrients.energy.value, 320);
  // Copies don't share objects with the originals.
  assert.notEqual(copies[1].nutrients, yesterday[0].nutrients);
  assert.notEqual(copies[1].food, yesterday[0].food);
  assert.equal(yesterday[0].id, "b2");
  assert.deepEqual(copyMealEntries(yesterday, "nope", T, lunch, now, () => "x"), []);
});

test("copy labels", () => {
  assert.equal(copyMealLabel("Breakfast"), "Copy yesterday's Breakfast");
  assert.equal(copiedText(0, "Lunch"), "Nothing in Lunch yesterday");
  assert.equal(copiedText(1, "Lunch"), "Copied 1 food to Lunch");
  assert.equal(copiedText(3, "Lunch"), "Copied 3 foods to Lunch");
});

test("relogEntry logs the last amount, or null when it no longer fits the food", () => {
  const now = new Date("2026-11-13T09:00:00Z");
  const e = relogEntry(food(), { quantity: 1.5, unit: "serving" }, T, lunch, now, "r1");
  assert.ok(e);
  assert.equal(e.id, "r1");
  assert.equal(e.grams, 60);
  assert.equal(e.mealId, lunch.id);
  assert.equal(e.foodDay, T);
  assert.equal(relogEntry(food({ servingAmount: null }), { quantity: 1, unit: "serving" }, T, lunch, now, "r2"), null);
  assert.equal(relogEntry(food(), { quantity: 100, unit: "ml" }, T, lunch, now, "r3"), null);
  assert.equal(relogEntry(food(), { quantity: 0, unit: "g" }, T, lunch, now, "r4"), null);
});

test("pushRecentScan keeps five, newest first, one per product", () => {
  let list = pushRecentScan([], { code: "3017620422003", name: "Nutella" });
  for (let i = 1; i <= 5; i++) list = pushRecentScan(list, { code: `400000000000${i}`, name: `P${i}` });
  assert.deepEqual(list.map((s) => s.name), ["P5", "P4", "P3", "P2", "P1"]);
  list = pushRecentScan(list, { code: "4000000000003", name: "P3 again" });
  assert.deepEqual(list.map((s) => s.name), ["P3 again", "P5", "P4", "P2", "P1"]);
  // UPC-A and its EAN-13 form are the same product.
  const upc = pushRecentScan([{ code: "0038000138416", name: "Crisps" }], { code: "038000138416", name: "Crisps" });
  assert.equal(upc.length, 1);
});
