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
import { readFileSync } from "node:fs";
import type { HttpGet } from "../src/lib/nutrition/http.ts";
import { createOffClient, mapOffProduct } from "../src/lib/nutrition/sources/off.ts";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`./fixtures/nutrition/${name}`, import.meta.url), "utf8"));
}

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

// ---------- Open Food Facts ----------

const f1 = fixture("off-full.json");
const f2 = fixture("off-no-nutriments.json");
const f3 = fixture("off-string-qty-salt-only.json");

test("OFF F1 maps identity, serving, and every nutrient value", () => {
  const food = mapOffProduct(f1.product);
  assert.ok(food);
  assert.equal(food.source, "off");
  assert.equal(food.sourceId, "0038000138416");
  assert.equal(food.barcode, "0038000138416");
  assert.equal(food.name, "Original Potato Crisps");
  assert.equal(food.brand, "Pringles");
  assert.equal(food.sourceUrl, "https://world.openfoodfacts.org/product/0038000138416");
  assert.equal(food.liquid, false);
  assert.deepEqual(food.serving, { amount: 28.349, unit: "g" });
  assert.equal(food.packageAmount, null);
  assert.deepEqual(food.droppedUnits, []);
  const n = food.nutrients;
  assert.deepEqual(n.energy, complete(536));
  assert.deepEqual(n.protein, complete(3.5));
  assert.deepEqual(n.carbohydrates, complete(57));
  assert.deepEqual(n.fat, complete(32));
  assert.deepEqual(n.saturatedFat, complete(9));
  assert.deepEqual(n.transFat, complete(0.5));
  assert.deepEqual(n.sugars, complete(1));
  assert.deepEqual(n.addedSugars, complete(0));
  assert.deepEqual(n.salt, complete(1.34));
  assert.deepEqual(n.sodium, complete(0.536));
  assert.deepEqual(n.fiber, complete(4));
  assert.deepEqual(n.cholesterol, complete(0));
  assert.deepEqual(n.calcium, complete(0));
  assert.deepEqual(n.iron, complete(0.000352746128611238));
  assert.deepEqual(n.potassium, complete(0.388020741472362));
  assert.deepEqual(n.vitaminD, complete(0));
  // keys absent from the response stay unknown
  assert.deepEqual(n.omega3, incomplete());
  assert.deepEqual(n.vitaminC, incomplete());
  assert.deepEqual(n.caffeine, incomplete());
});

test("OFF F2 without a nutriments object maps to null", () => {
  assert.equal(mapOffProduct(f2.product), null);
});

test("OFF F3 tolerates string quantities and derives sodium from salt", () => {
  const food = mapOffProduct(f3.product);
  assert.ok(food);
  assert.deepEqual(food.serving, { amount: 330, unit: "ml" });
  assert.deepEqual(food.packageAmount, { amount: 1500, unit: "ml" });
  assert.equal(food.liquid, true);
  assert.equal(food.nutrients.salt.state, "complete");
  assert.equal(food.nutrients.salt.value, 0.25);
  assert.equal(food.nutrients.sodium.state, "derived");
  assert.equal(food.nutrients.sodium.value, 0.25 / 2.5);
  assert.equal(food.nutrients.sodium.rule, "sodium=salt/2.5");
});

test("OFF a delivered sodium value wins over deriving from salt", () => {
  const food = mapOffProduct({
    product_name: "x", code: "1", nutriments: { "salt_100g": 2.5, "sodium_100g": 0.9 },
  });
  assert.ok(food);
  assert.deepEqual(food.nutrients.sodium, complete(0.9));
});

test("OFF missing keys are incomplete, with neither salt nor sodium nothing is derived", () => {
  const food = mapOffProduct({ product_name: "x", code: "1", nutriments: { "proteins_100g": 5 } });
  assert.ok(food);
  assert.deepEqual(food.nutrients.protein, complete(5));
  assert.deepEqual(food.nutrients.energy, incomplete());
  assert.deepEqual(food.nutrients.sodium, incomplete());
  assert.deepEqual(food.nutrients.salt, incomplete());
});

test("OFF zero and negative quantities are discarded", () => {
  const food = mapOffProduct({
    product_name: "x", code: "1", nutriments: {},
    serving_quantity: 0, serving_quantity_unit: "g",
    product_quantity: "-5", product_quantity_unit: "g",
  });
  assert.ok(food);
  assert.equal(food.serving, null);
  assert.equal(food.packageAmount, null);
});

test("OFF ml unit on either quantity marks the food liquid", () => {
  const byServing = mapOffProduct({
    product_name: "x", code: "1", nutriments: {}, serving_quantity: 250, serving_quantity_unit: "ML",
  });
  assert.equal(byServing?.liquid, true);
  assert.deepEqual(byServing?.serving, { amount: 250, unit: "ml" });
  const byPackage = mapOffProduct({
    product_name: "x", code: "1", nutriments: {}, product_quantity: 1000, product_quantity_unit: "ml",
  });
  assert.equal(byPackage?.liquid, true);
  const solid = mapOffProduct({ product_name: "x", code: "1", nutriments: {}, product_quantity: 100, product_quantity_unit: "g" });
  assert.equal(solid?.liquid, false);
});

test("OFF blank or missing name maps to null", () => {
  assert.equal(mapOffProduct({ product_name: "   ", code: "1", nutriments: {} }), null);
  assert.equal(mapOffProduct({ code: "1", nutriments: {} }), null);
  assert.equal(mapOffProduct(null), null);
  assert.equal(mapOffProduct("nope"), null);
});

test("OFF uses the response url when present and trims names and brands", () => {
  const food = mapOffProduct({
    product_name: "  Bar  ", code: "42", brands: "  ", url: "https://example.test/p/42", nutriments: {},
  });
  assert.ok(food);
  assert.equal(food.name, "Bar");
  assert.equal(food.brand, null);
  assert.equal(food.sourceUrl, "https://example.test/p/42");
});

type Call = { url: string; params: Record<string, string> };

function fakeGet(status: number, data: unknown): { get: HttpGet; calls: Call[] } {
  const calls: Call[] = [];
  const get: HttpGet = async (url, params) => {
    calls.push({ url, params });
    return { status, data };
  };
  return { get, calls };
}

const OFF_FIELDS_PARAM =
  "product_name,code,nutriments,brands,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,url";

test("OFF getProduct requests the product URL with only the fields param", async () => {
  const { get, calls } = fakeGet(200, f1);
  const food = await createOffClient({ get }).getProduct("0038000138416");
  assert.equal(food?.name, "Original Potato Crisps");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://world.openfoodfacts.org/api/v2/product/0038000138416");
  assert.deepEqual(calls[0].params, { fields: OFF_FIELDS_PARAM });
});

test("OFF getProduct maps 404 to null and a no-nutriments product to null", async () => {
  assert.equal(await createOffClient({ get: fakeGet(404, {}).get }).getProduct("1"), null);
  assert.equal(await createOffClient({ get: fakeGet(200, f2).get }).getProduct("0016000275683"), null);
  assert.equal(await createOffClient({ get: fakeGet(200, { status: 0 }).get }).getProduct("1"), null);
});

test("OFF error statuses map to NutritionError codes", async () => {
  await assert.rejects(createOffClient({ get: fakeGet(503, {}).get }).getProduct("1"), { code: "unavailable" });
  await assert.rejects(createOffClient({ get: fakeGet(429, {}).get }).getProduct("1"), { code: "rate-limited" });
  await assert.rejects(createOffClient({ get: fakeGet(500, {}).get }).getProduct("1"), { code: "bad-response" });
  await assert.rejects(createOffClient({ get: fakeGet(503, {}).get }).search("x"), { code: "unavailable" });
  await assert.rejects(createOffClient({ get: fakeGet(200, "html").get }).getProduct("1"), { code: "bad-response" });
  await assert.rejects(createOffClient({ get: fakeGet(200, {}).get }).search("x"), { code: "bad-response" });
});

test("OFF search sends the exact params and maps usable products", async () => {
  const body = { count: "2", page: 1, products: [f1.product, f2.product, f3.product] };
  const { get, calls } = fakeGet(200, body);
  const res = await createOffClient({ get }).search("crisps", 3);
  assert.equal(calls[0].url, "https://world.openfoodfacts.org/cgi/search.pl");
  assert.deepEqual(calls[0].params, {
    search_simple: "1",
    json: "1",
    search_terms: "crisps",
    page: "3",
    page_size: "50",
    sort_by: "product_name",
    fields: OFF_FIELDS_PARAM,
  });
  assert.ok(!("countries" in calls[0].params));
  assert.equal(res.count, 2);
  assert.deepEqual(res.foods.map((f) => f.sourceId), ["0038000138416", "5449000000996"]);
});

test("OFF search defaults to page 1", async () => {
  const { get, calls } = fakeGet(200, { count: 0, products: [] });
  await createOffClient({ get }).search("x");
  assert.equal(calls[0].params.page, "1");
});

test("OFF product limiter refuses the 101st call in a minute without calling get", async () => {
  const { get, calls } = fakeGet(200, f1);
  let t = 0;
  const client = createOffClient({ get, now: () => t });
  for (let i = 0; i < 100; i++) await client.getProduct("0038000138416");
  assert.equal(calls.length, 100);
  await assert.rejects(client.getProduct("0038000138416"), { code: "rate-limited" });
  assert.equal(calls.length, 100);
  t = 60_001;
  await client.getProduct("0038000138416");
  assert.equal(calls.length, 101);
});

test("OFF search limiter refuses the 11th call in a minute without calling get", async () => {
  const { get, calls } = fakeGet(200, { count: 0, products: [] });
  const client = createOffClient({ get, now: () => 0 });
  for (let i = 0; i < 10; i++) await client.search("x");
  await assert.rejects(client.search("x"), { code: "rate-limited" });
  assert.equal(calls.length, 10);
});
