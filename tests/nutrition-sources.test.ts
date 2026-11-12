import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUTRIENT_KEYS,
  addNutrients,
  addValues,
  complete,
  derived,
  emptyNutrients,
  incomplete,
  scaleNutrients,
  toGrams,
} from "../src/lib/nutrition/nutrients.ts";

test("NUTRIENT_KEYS has exactly 43 unique keys in spec order", () => {
  assert.equal(NUTRIENT_KEYS.length, 43);
  assert.equal(new Set(NUTRIENT_KEYS).size, 43);
  assert.equal(NUTRIENT_KEYS[0], "energy");
  assert.equal(NUTRIENT_KEYS[17], "caffeine");
  assert.equal(NUTRIENT_KEYS[42], "chromium");
});

test("toGrams converts mass units case-insensitively", () => {
  assert.equal(toGrams(5, "g"), 5);
  assert.equal(toGrams(5, "G"), 5);
  assert.equal(toGrams(500, "mg"), 0.5);
  assert.equal(toGrams(500, "MG"), 0.5);
  assert.equal(toGrams(2000000, "ug"), 2);
  assert.equal(toGrams(2000000, "µg"), 2);
  assert.equal(toGrams(2000000, "μg"), 2);
  assert.equal(toGrams(2000000, "mcg"), 2);
  assert.equal(toGrams(2000000, "MCG"), 2);
});

test("toGrams returns null for unusable units", () => {
  assert.equal(toGrams(100, "IU"), null);
  assert.equal(toGrams(100, "kcal"), null);
  assert.equal(toGrams(100, ""), null);
});

test("addValues state rules", () => {
  assert.deepEqual(addValues(complete(1), complete(2)), { value: 3, state: "complete" });
  assert.deepEqual(addValues(complete(1), derived(2, "x")), { value: 3, state: "derived" });
  assert.deepEqual(addValues(derived(1, "x"), derived(2, "y")), { value: 3, state: "derived" });
  assert.deepEqual(addValues(complete(1), incomplete()), { value: 1, state: "incomplete" });
  assert.deepEqual(addValues(derived(1, "x"), incomplete()), { value: 1, state: "incomplete" });
  assert.deepEqual(addValues(incomplete(), incomplete()), { value: 0, state: "incomplete" });
});

test("addValues drops the rule on sums", () => {
  assert.equal(addValues(derived(1, "x"), complete(1)).rule, undefined);
});

test("emptyNutrients is all incomplete zeros", () => {
  const n = emptyNutrients();
  assert.equal(Object.keys(n).length, 43);
  for (const key of NUTRIENT_KEYS) assert.deepEqual(n[key], { value: 0, state: "incomplete" });
});

test("addNutrients adds per key", () => {
  const a = emptyNutrients();
  const b = emptyNutrients();
  a.protein = complete(10);
  b.protein = complete(5);
  a.fat = complete(2);
  const sum = addNutrients(a, b);
  assert.deepEqual(sum.protein, { value: 15, state: "complete" });
  assert.deepEqual(sum.fat, { value: 2, state: "incomplete" });
});

test("scaleNutrients scales values and keeps states and rules", () => {
  const n = emptyNutrients();
  n.energy = complete(200);
  n.sodium = derived(0.4, "sodium=salt/2.5");
  const s = scaleNutrients(n, 0.5);
  assert.deepEqual(s.energy, { value: 100, state: "complete" });
  assert.deepEqual(s.sodium, { value: 0.2, state: "derived", rule: "sodium=salt/2.5" });
  assert.deepEqual(s.protein, { value: 0, state: "incomplete" });
  assert.equal(n.energy.value, 200);
});

import { NutritionError, createRateLimiter, nutritionUserAgent } from "../src/lib/nutrition/http.ts";

test("createRateLimiter enforces a sliding window with an injected clock", () => {
  let t = 1000;
  const limiter = createRateLimiter(2, 100, () => t);
  assert.equal(limiter.take(), true);
  t = 1050;
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
  t = 1099;
  assert.equal(limiter.take(), false);
  t = 1100; // first stamp (1000) has aged out
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
  t = 1150; // 1050 aged out
  assert.equal(limiter.take(), true);
});

test("refused takes do not consume window capacity", () => {
  let t = 0;
  const limiter = createRateLimiter(1, 10, () => t);
  assert.equal(limiter.take(), true);
  t = 5;
  assert.equal(limiter.take(), false);
  t = 10;
  assert.equal(limiter.take(), true);
});

test("NutritionError carries code and reason", () => {
  const e = new NutritionError("unauthorized", "API_KEY_MISSING");
  assert.ok(e instanceof Error);
  assert.equal(e.name, "NutritionError");
  assert.equal(e.code, "unauthorized");
  assert.equal(e.reason, "API_KEY_MISSING");
  const bare = new NutritionError("rate-limited");
  assert.equal(bare.code, "rate-limited");
  assert.equal(bare.reason, undefined);
});

test("nutritionUserAgent has the IronLog format", () => {
  assert.match(nutritionUserAgent(), /^IronLog\/\S+ \(personal strength-training app\)$/);
});
