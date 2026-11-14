import test from "node:test";
import assert from "node:assert/strict";
import { parsePriceCents, proteinPerDollar, rankByValue } from "../src/lib/nutrition/value.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";

// Made-up prices and values.
const f = (protein: number | null, priceCents: number | null, priceAmount: number | null, name = "x") => {
  const n = emptyNutrients();
  if (protein !== null) n.protein = complete(protein);
  return { name, nutrients: n, priceCents, priceAmount };
};

test("protein per dollar: null without a price or a complete protein", () => {
  assert.equal(proteinPerDollar(f(null, 300, 500)), null);
  assert.equal(proteinPerDollar(f(20, null, 500)), null);
  assert.equal(proteinPerDollar(f(20, 300, null)), null);
  assert.equal(proteinPerDollar(f(20, 0, 500)), null);
  assert.equal(proteinPerDollar({ nutrients: emptyNutrients() }), null);
  // 20 g per 100 g, 500 g for 4.00 -> 100 g protein / 4 = 25 per 1.00
  assert.equal(proteinPerDollar(f(20, 400, 500)), 25);
});

test("rankByValue: best first, unpriced left out, ties keep order", () => {
  const list = [f(10, 400, 500, "a"), f(20, 400, 500, "b"), f(20, null, null, "c"), f(10, 400, 500, "d")];
  assert.deepEqual(rankByValue(list).map((x) => x.food.name), ["b", "a", "d"]);
});

test("parsePriceCents", () => {
  assert.equal(parsePriceCents(""), null);
  assert.equal(parsePriceCents("3,49"), 349);
  assert.ok(Number.isNaN(parsePriceCents("free")));
  assert.ok(Number.isNaN(parsePriceCents("0")));
});
