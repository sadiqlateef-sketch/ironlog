import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeness, energyMismatch } from "../src/lib/nutrition/quality.ts";
import { complete, derived, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { mapOffProduct } from "../src/lib/nutrition/sources/off.ts";
import { mapUsdaDetailFood, mapUsdaSearchFood } from "../src/lib/nutrition/sources/usda.ts";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`./fixtures/nutrition/${name}`, import.meta.url), "utf8"));
}

test("completeness of an empty nutrient set is 0 of 43", () => {
  assert.deepEqual(completeness(emptyNutrients()), { known: 0, total: 43, ratio: 0 });
});

test("completeness counts complete and derived, not incomplete", () => {
  const n = emptyNutrients();
  n.energy = complete(100);
  n.sodium = derived(0.1, "sodium=salt/2.5");
  const c = completeness(n);
  assert.equal(c.known, 2);
  assert.equal(c.total, 43);
  assert.equal(c.ratio, 2 / 43);
});

test("completeness on the recorded Pringles OFF record", () => {
  const food = mapOffProduct(fixture("off-full.json").product);
  assert.ok(food);
  // 14 mapped keys have real values in the fixture; count is derived from the mapper output.
  const known = Object.values(food.nutrients).filter((v) => v.state !== "incomplete").length;
  const c = completeness(food.nutrients);
  assert.equal(c.known, known);
  assert.ok(c.known >= 10 && c.known < 43);
  assert.equal(c.ratio, c.known / 43);
});

test("completeness of the sparse Coca-Cola OFF record is 4 of 43 (energy, sugars, salt, derived sodium)", () => {
  const food = mapOffProduct(fixture("off-string-qty-salt-only.json").product);
  assert.ok(food);
  const c = completeness(food.nutrients);
  assert.equal(c.known, 4);
  assert.equal(c.ratio, 4 / 43);
});

test("energyMismatch: real Pringles record is not flagged", () => {
  const food = mapOffProduct(fixture("off-full.json").product);
  assert.ok(food);
  const r = energyMismatch(food.nutrients);
  assert.ok(r);
  assert.equal(r.flagged, false);
  assert.equal(r.stated, 536);
  assert.equal(r.computed, 4 * 3.5 + 4 * 57 + 9 * 32);
  assert.ok(r.diff < 0.05);
});

test("energyMismatch: real USDA Branded cheddar record is not flagged", () => {
  const search = fixture("usda-branded-search.json") as { foods: unknown[] };
  const food = mapUsdaSearchFood(search.foods[0]);
  assert.ok(food);
  const r = energyMismatch(food.nutrients);
  assert.ok(r);
  assert.equal(r.flagged, false);
  assert.equal(r.stated, 432);
});

test("energyMismatch: crafted record with wildly wrong energy is flagged", () => {
  const n = emptyNutrients();
  n.energy = complete(100);
  n.protein = complete(10);
  n.carbohydrates = complete(50);
  n.fat = complete(30);
  const r = energyMismatch(n);
  assert.ok(r);
  assert.equal(r.computed, 510);
  assert.equal(r.stated, 100);
  assert.equal(r.flagged, true);
  assert.equal(r.diff, 410 / 510);
  // Flag only: the values are untouched.
  assert.deepEqual(n.energy, complete(100));
});

test("energyMismatch: tolerance is configurable", () => {
  const n = emptyNutrients();
  n.energy = complete(100);
  n.protein = complete(5);
  n.carbohydrates = complete(15);
  n.fat = complete(2.5); // computed 102.5
  assert.equal(energyMismatch(n)?.flagged, false);
  assert.equal(energyMismatch(n, 0.01)?.flagged, true);
});

test("energyMismatch: derived energy (USDA 4P+4C+9F fallback) returns null", () => {
  const food = mapUsdaDetailFood(fixture("usda-energy-449.json"));
  assert.ok(food);
  assert.equal(food.nutrients.energy.state, "derived");
  assert.equal(energyMismatch(food.nutrients), null);
});

test("energyMismatch: null when any macro is unknown", () => {
  const n = emptyNutrients();
  n.energy = complete(100);
  n.protein = complete(10);
  n.carbohydrates = complete(10);
  assert.equal(energyMismatch(n), null);
  const food = mapOffProduct(fixture("off-string-qty-salt-only.json").product);
  assert.ok(food);
  assert.equal(energyMismatch(food.nutrients), null);
});
