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
import { createUsdaClient, mapUsdaDetailFood, mapUsdaSearchFood } from "../src/lib/nutrition/sources/usda.ts";
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
  "product_name,code,nutriments,brands,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,serving_size,quantity,url";

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
    sort_by: "unique_scans_n",
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

// ---------- USDA FoodData Central ----------

const f4 = fixture("usda-branded-search.json") as { foods: unknown[] };
const f5a = fixture("usda-energy-957.json");
const f5b = fixture("usda-energy-449.json");
const f6 = fixture("usda-iu.json") as { foods: unknown[] };

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} !~ ${expected}`);
}

test("USDA F4 Branded search hit maps identity, serving, and nutrients by number", () => {
  const food = mapUsdaSearchFood(f4.foods[0]);
  assert.ok(food);
  assert.equal(food.source, "usda");
  assert.equal(food.sourceId, "2095236");
  assert.equal(food.name, "CHEDDAR CHEESE");
  assert.equal(food.brand, "MDS Foods Inc.");
  assert.equal(food.barcode, "828653282457");
  assert.equal(food.sourceUrl, "https://fdc.nal.usda.gov/food-details/2095236/nutrients");
  assert.equal(food.liquid, false);
  assert.deepEqual(food.serving, { amount: 28, unit: "g" });
  assert.equal(food.packageAmount, null);
  assert.deepEqual(food.droppedUnits, []);
  const n = food.nutrients;
  assert.deepEqual(n.energy, complete(432));
  assert.deepEqual(n.protein, complete(25));
  assert.deepEqual(n.fat, complete(35.7));
  assert.deepEqual(n.carbohydrates, complete(0));
  assert.deepEqual(n.saturatedFat, complete(21.4));
  assert.deepEqual(n.transFat, complete(0));
  assert.deepEqual(n.sugars, complete(0));
  assert.deepEqual(n.fiber, complete(0));
  assert.equal(n.sodium.state, "complete");
  close(n.sodium.value, 0.686);
  close(n.cholesterol.value, 0.107);
  assert.deepEqual(n.calcium, incomplete());
});

test("USDA ignores the FDC id and keys on the nutrient number", () => {
  // In the fixture, protein's real nutrientId is 1003 and energy's is 1008.
  const rows = (f4.foods[0] as { foodNutrients: { nutrientId: number; nutrientNumber: string }[] }).foodNutrients;
  assert.equal(rows.find((r) => r.nutrientNumber === "203")?.nutrientId, 1003);
  const food = mapUsdaSearchFood({
    fdcId: 1,
    description: "x",
    foodNutrients: [
      { nutrientId: 203, nutrientNumber: "999", value: 50, unitName: "G" }, // id looks like protein
      { nutrientId: 1003, nutrientNumber: "203", value: 7, unitName: "G" },
      { nutrientId: 1008, nutrientNumber: "208", value: 120, unitName: "KCAL" },
      { id: 204, number: "999", nutrientNumber: "204", value: 3, unitName: "G" },
    ],
  });
  assert.ok(food);
  assert.deepEqual(food.nutrients.protein, complete(7));
  assert.deepEqual(food.nutrients.fat, complete(3));
  assert.deepEqual(food.nutrients.energy, complete(120));
  assert.deepEqual(food.nutrients.carbohydrates, incomplete());
});

test("USDA number may arrive as an int in detail rows", () => {
  const food = mapUsdaDetailFood({
    fdcId: 5, description: "y",
    foodNutrients: [{ number: 203, amount: 4, unitName: "G" }, { number: "205", amount: 6, unitName: "G" }],
  });
  assert.ok(food);
  assert.deepEqual(food.nutrients.protein, complete(4));
  assert.deepEqual(food.nutrients.carbohydrates, complete(6));
});

test("USDA converts mg and ug to grams", () => {
  const food = mapUsdaSearchFood({
    fdcId: 2, description: "z",
    foodNutrients: [
      { nutrientNumber: "301", value: 500, unitName: "MG" },
      { nutrientNumber: "418", value: 2, unitName: "UG" },
      { nutrientNumber: "417", value: 3, unitName: "µg" },
      { nutrientNumber: "203", value: 1.5, unitName: "g" },
    ],
  });
  assert.ok(food);
  close(food.nutrients.calcium.value, 0.5);
  close(food.nutrients.vitaminB12.value, 0.000002);
  close(food.nutrients.vitaminB9.value, 0.000003);
  assert.deepEqual(food.nutrients.protein, complete(1.5));
  assert.equal(food.nutrients.calcium.state, "complete");
});

test("USDA serving comes from servingSize only for g/GRM/ml/MLT, liquid for ml/MLT", () => {
  const make = (size: unknown, unit: unknown) =>
    mapUsdaSearchFood({ fdcId: 3, description: "s", servingSize: size, servingSizeUnit: unit, foodNutrients: [] });
  assert.deepEqual(make(28, "GRM")?.serving, { amount: 28, unit: "g" });
  assert.equal(make(28, "GRM")?.liquid, false);
  assert.deepEqual(make(30, "g")?.serving, { amount: 30, unit: "g" });
  assert.deepEqual(make(240, "ml")?.serving, { amount: 240, unit: "ml" });
  assert.equal(make(240, "ml")?.liquid, true);
  assert.deepEqual(make(355, "MLT")?.serving, { amount: 355, unit: "ml" });
  assert.equal(make(355, "MLT")?.liquid, true);
  assert.equal(make(2, "oz")?.serving, null);
  assert.equal(make(2, "oz")?.liquid, false);
  assert.equal(make(0, "g")?.serving, null);
  assert.equal(make(undefined, undefined)?.serving, null);
  const grm = mapUsdaSearchFood(f4.foods[1]);
  assert.deepEqual(grm?.serving, { amount: 28, unit: "g" });
  assert.equal(grm?.barcode, "0041711093004");
  assert.equal(grm?.brand, null);
});

test("USDA F5 energy falls back to 957 when 208 is absent", () => {
  const food = mapUsdaDetailFood(f5a);
  assert.ok(food);
  assert.equal(food.sourceId, "2003591");
  assert.equal(food.sourceUrl, "https://fdc.nal.usda.gov/food-details/2003591/nutrients");
  assert.deepEqual(food.nutrients.energy, complete(47.2));
  assert.deepEqual(food.nutrients.protein, complete(0.734));
  assert.deepEqual(food.nutrients.carbohydrates, complete(10.3));
  assert.deepEqual(food.nutrients.fat, complete(0.325));
  close(food.nutrients.potassium.value, 0.18);
  close(food.nutrients.vitaminB9.value, 0.0000298);
});

test("USDA 208 wins over 957 when both are present", () => {
  const food = mapUsdaDetailFood({
    fdcId: 9, description: "e",
    foodNutrients: [{ number: "957", amount: 40, unitName: "KCAL" }, { number: "208", amount: 50, unitName: "KCAL" }],
  });
  assert.deepEqual(food?.nutrients.energy, complete(50));
});

test("USDA F5 without 208 or 957 derives energy as 4P+4C+9F", () => {
  const food = mapUsdaDetailFood(f5b);
  assert.ok(food);
  const n = food.nutrients;
  assert.equal(n.energy.state, "derived");
  assert.equal(n.energy.rule, "energy=4P+4C+9F");
  close(n.energy.value, 4 * 0.734 + 4 * 10.3 + 9 * 0.325);
});

test("USDA energy stays unknown when macros are incomplete and no energy row exists", () => {
  const food = mapUsdaDetailFood({
    fdcId: 9, description: "e",
    foodNutrients: [{ number: "203", amount: 5, unitName: "G" }, { number: "204", amount: 5, unitName: "G" }],
  });
  assert.deepEqual(food?.nutrients.energy, incomplete());
});

test("USDA F6 IU nutrient stays incomplete and is listed in droppedUnits", () => {
  const food = mapUsdaSearchFood(f6.foods[0]);
  assert.ok(food);
  assert.equal(food.sourceId, "2340698");
  assert.deepEqual(food.nutrients.vitaminD, incomplete());
  assert.deepEqual(food.droppedUnits, ["vitaminD"]);
  assert.deepEqual(food.nutrients.protein, complete(21.4));
  assert.equal(food.nutrients.calcium.state, "complete");
});

test("USDA vitamin D falls back to 328 (µg) when 324 is IU", () => {
  const food = mapUsdaDetailFood({
    fdcId: 1,
    description: "Test fish",
    foodNutrients: [
      { number: "324", amount: 400, unitName: "IU" },
      { number: "328", amount: 10, unitName: "µg" },
    ],
  });
  assert.ok(food);
  assert.equal(food.nutrients.vitaminD.state, "complete");
  assert.ok(Math.abs(food.nutrients.vitaminD.value - 0.00001) < 1e-12);
  assert.deepEqual(food.droppedUnits, []);
});

test("USDA vitamin D prefers a usable 324 over 328", () => {
  const food = mapUsdaDetailFood({
    fdcId: 2,
    description: "Test milk",
    foodNutrients: [
      { number: "328", amount: 1, unitName: "UG" },
      { number: "324", amount: 2, unitName: "UG" },
    ],
  });
  assert.ok(food);
  assert.ok(Math.abs(food.nutrients.vitaminD.value - 0.000002) < 1e-12);
});

test("USDA always-empty nutrients are incomplete even with every row present", () => {
  const food = mapUsdaDetailFood(f5a);
  assert.ok(food);
  for (const key of ["omega3", "omega6", "salt", "solubleFiber", "insolubleFiber", "iodine", "chromium"] as const) {
    assert.deepEqual(food.nutrients[key], incomplete(), key);
  }
});

test("USDA detail has no serving and is not liquid", () => {
  const food = mapUsdaDetailFood({ ...f5a, servingSize: 100, servingSizeUnit: "ml" });
  assert.equal(food?.serving, null);
  assert.equal(food?.liquid, false);
});

test("USDA unusable records map to null", () => {
  assert.equal(mapUsdaSearchFood({ fdcId: 1, description: "  ", foodNutrients: [] }), null);
  assert.equal(mapUsdaSearchFood({ description: "x", foodNutrients: [] }), null);
  assert.equal(mapUsdaSearchFood(null), null);
  assert.equal(mapUsdaDetailFood("nope"), null);
});

const KEY = "test-key-not-real";

test("USDA search sends api_key, pageSize=200 and the page number", async () => {
  const { get, calls } = fakeGet(200, { totalHits: 12, foods: [...f4.foods, { bad: true }] });
  const res = await createUsdaClient({ get }).search("cheddar", KEY, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.nal.usda.gov/fdc/v1/foods/search");
  assert.deepEqual(calls[0].params, { api_key: KEY, query: "cheddar", pageSize: "200", pageNumber: "2" });
  assert.equal(res.totalHits, 12);
  assert.equal(res.foods.length, 2);
});

test("USDA search defaults to page 1", async () => {
  const { get, calls } = fakeGet(200, { totalHits: 0, foods: [] });
  await createUsdaClient({ get }).search("x", KEY);
  assert.equal(calls[0].params.pageNumber, "1");
});

test("USDA getFood requests format=abridged and maps the detail", async () => {
  const { get, calls } = fakeGet(200, f5a);
  const food = await createUsdaClient({ get }).getFood(2003591, KEY);
  assert.equal(calls[0].url, "https://api.nal.usda.gov/fdc/v1/food/2003591");
  assert.deepEqual(calls[0].params, { api_key: KEY, format: "abridged" });
  assert.equal(food?.name, f5a.description);
  assert.equal(food?.serving, null);
});

test("USDA error statuses map to NutritionError codes", async () => {
  const client = (status: number, data: unknown = {}) => createUsdaClient({ get: fakeGet(status, data).get });
  await assert.rejects(client(429).search("x", KEY), { code: "rate-limited" });
  await assert.rejects(
    client(403, { error: { code: "API_KEY_INVALID", message: "bad" } }).getFood(1, KEY),
    { code: "unauthorized", reason: "API_KEY_INVALID" },
  );
  await assert.rejects(
    client(403, { error: { code: "API_KEY_UNVERIFIED" } }).search("x", KEY),
    { code: "unauthorized", reason: "API_KEY_UNVERIFIED" },
  );
  await assert.rejects(client(403, "<html>").search("x", KEY), { code: "unauthorized", reason: undefined });
  await assert.rejects(client(400).search("x", KEY), { code: "bad-response" });
  await assert.rejects(client(404).getFood(1, KEY), { code: "not-found" });
  await assert.rejects(client(503).search("x", KEY), { code: "unavailable" });
  await assert.rejects(client(200, {}).search("x", KEY), { code: "bad-response" });
});

test("USDA empty api key is refused without a request", async () => {
  const { get, calls } = fakeGet(200, { totalHits: 0, foods: [] });
  const client = createUsdaClient({ get });
  await assert.rejects(client.search("x", ""), { code: "unauthorized", reason: "API_KEY_MISSING" });
  await assert.rejects(client.getFood(1, "   "), { code: "unauthorized", reason: "API_KEY_MISSING" });
  assert.equal(calls.length, 0);
});
