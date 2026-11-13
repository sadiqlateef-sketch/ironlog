import test from "node:test";
import assert from "node:assert/strict";
import { isScanCancel, scanErrorMessage } from "../src/lib/nutrition/scan-error.ts";
import { decodeEntities } from "../src/lib/nutrition/entities.ts";
import { createOffClient, mapOffProduct, quantityFromText } from "../src/lib/nutrition/sources/off.ts";
import { matchLevel, normalizeName, rankFoods } from "../src/lib/nutrition/rank.ts";
import { searchFoods } from "../src/lib/nutrition/search.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { allowedUnits, makeEntry } from "../src/lib/nutrition/entry-math.ts";
import { discardPrompt, unitChoiceLabel } from "../src/lib/nutrition/display.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";
import type { OffClient } from "../src/lib/nutrition/sources/off.ts";
import type { RemoteFood } from "../src/lib/nutrition/types.ts";

// ---------- Scanner cancel ----------

test("a scanner cancel is a cancel even though Capacitor rejects with a plain object", () => {
  // What the Android plugin sends when the person backs out.
  assert.equal(isScanCancel({ message: "scan canceled." }), true);
  assert.equal(isScanCancel({ message: "Scan cancelled", code: "CANCELED" }), true);
  assert.equal(isScanCancel(new Error("scan canceled.")), true);
  assert.equal(isScanCancel({ message: "The scan result was lost because the app process was terminated." }), true);
  assert.equal(isScanCancel(undefined), true);
  assert.equal(isScanCancel({}), true);
});

test("a real scanner failure is not a cancel", () => {
  assert.equal(isScanCancel({ message: "The Google Barcode Scanner Module is not available." }), false);
  assert.equal(isScanCancel(new Error("The scan failed.")), false);
  assert.equal(scanErrorMessage({ message: "x" }), "x");
  assert.equal(scanErrorMessage("plain"), "plain");
  assert.equal(scanErrorMessage(42), "");
});

// ---------- HTML entities ----------

test("decodeEntities handles named, numeric and accent entities once", () => {
  assert.equal(decodeEntities("&quot;Legendairy&quot; Milk"), '"Legendairy" Milk');
  assert.equal(decodeEntities("Ben &amp; Jerry&#39;s"), "Ben & Jerry's");
  assert.equal(decodeEntities("Caf&eacute; cr&egrave;me &#x2013; 1&frac12;"), "Café crème – 1½");
  assert.equal(decodeEntities("M&uuml;sli &Agrave; la"), "Müsli À la");
  assert.equal(decodeEntities("&amp;quot;"), "&quot;");
  assert.equal(decodeEntities("Fish & chips &unknown; &#0;"), "Fish & chips &unknown; &#0;");
  assert.equal(decodeEntities("plain"), "plain");
});

test("the OFF mapper decodes entities in the name and brand", () => {
  const food = mapOffProduct({
    product_name: "&quot;Legendairy&quot;  Whole&nbsp;Milk",
    brands: "Ben &amp; Jerry&#39;s",
    code: "1",
    nutriments: {},
  });
  assert.ok(food);
  assert.equal(food.name, '"Legendairy" Whole Milk');
  assert.equal(food.brand, "Ben & Jerry's");
  assert.equal(mapOffProduct({ product_name: "&nbsp;", code: "1", nutriments: {} }), null);
});

// ---------- Serving and package sizes ----------

test("quantityFromText reads grams and millilitres written as text", () => {
  assert.deepEqual(quantityFromText("15 g"), { amount: 15, unit: "g" });
  assert.deepEqual(quantityFromText("15g"), { amount: 15, unit: "g" });
  assert.deepEqual(quantityFromText("1 portion (15 g)"), { amount: 15, unit: "g" });
  assert.deepEqual(quantityFromText("2 biscuits 3 g (25 g)"), { amount: 25, unit: "g" });
  assert.deepEqual(quantityFromText("400 g e"), { amount: 400, unit: "g" });
  assert.deepEqual(quantityFromText("1,5 l"), { amount: 1500, unit: "ml" });
  assert.deepEqual(quantityFromText("33 cl"), { amount: 330, unit: "ml" });
  assert.deepEqual(quantityFromText("1 kg"), { amount: 1000, unit: "g" });
  assert.equal(quantityFromText("1 slice"), null);
  assert.equal(quantityFromText("2 glasses"), null);
  assert.equal(quantityFromText(""), null);
  assert.equal(quantityFromText(null), null);
});

test("Nutella: serving from serving_size text, package from the number, serving offered", () => {
  // Shaped like OFF 3017620422003: the unit field without serving_quantity, serving only as text.
  const n = mapOffProduct({
    product_name: "Nutella",
    brands: "Ferrero",
    code: "3017620422003",
    serving_quantity_unit: "g",
    serving_size: "15 g",
    product_quantity: 400,
    product_quantity_unit: "g",
    quantity: "400 g e",
    nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, sodium_100g: 0.0428 },
  });
  assert.ok(n);
  assert.deepEqual(n.serving, { amount: 15, unit: "g" });
  assert.deepEqual(n.packageAmount, { amount: 400, unit: "g" });
  assert.equal(n.liquid, false);

  // The amount sheet path: remote -> Food -> units -> entry.
  const food: Food = {
    id: "f", name: n.name, brand: n.brand, barcode: n.barcode, liquid: n.liquid,
    servingAmount: n.serving?.amount ?? null, packageAmount: n.packageAmount?.amount ?? null,
    nutrients: n.nutrients, source: "off", sourceId: n.sourceId, sourceUrl: n.sourceUrl, note: null, archived: false,
  };
  const units = allowedUnits(food);
  assert.deepEqual(units, ["g", "oz", "serving", "package"]);
  assert.equal(unitChoiceLabel("serving", food), "serving (15 g)");
  assert.equal(unitChoiceLabel("package", food), "package (400 g)");
  assert.equal(unitChoiceLabel("g", food), "g");
  const meal = DEFAULT_MEALS[0];
  const one = makeEntry({ food, quantity: 1, unit: "serving", foodDay: "2026-11-13", meal, now: new Date(0), id: "e" });
  assert.equal(one.grams, 15);
  assert.equal(Math.round(one.nutrients.energy.value * 100) / 100, 80.85);
  const pack = makeEntry({ food, quantity: 1, unit: "package", foodDay: "2026-11-13", meal, now: new Date(0), id: "p" });
  assert.equal(pack.grams, 400);
});

test("a numeric serving still wins, and a text size in the wrong unit is ignored", () => {
  const a = mapOffProduct({ product_name: "x", code: "1", nutriments: {}, serving_quantity: "20", serving_size: "15 g" });
  assert.deepEqual(a?.serving, { amount: 20, unit: "g" });
  const drink = mapOffProduct({
    product_name: "Cola", code: "2", nutriments: {}, product_quantity: 330, product_quantity_unit: "ml", serving_size: "1 can (30 g)",
  });
  assert.equal(drink?.liquid, true);
  assert.equal(drink?.serving, null);
  assert.equal(unitChoiceLabel("serving", { liquid: true, servingAmount: 250, packageAmount: null }), "serving (250 ml)");
});

// ---------- Ranking ----------

function rf(name: string, known = 0, over: Partial<RemoteFood> = {}): RemoteFood {
  const n = emptyNutrients();
  const keys = Object.keys(n) as (keyof typeof n)[];
  for (const k of keys.slice(0, known)) n[k] = complete(1);
  return {
    source: "off", sourceId: name, name, brand: null, barcode: null, sourceUrl: "https://example.test",
    liquid: false, serving: null, packageAmount: null, nutrients: n, droppedUnits: [], ...over,
  };
}

test("matchLevel: exact > starts with whole word > starts with > all words > some text > none", () => {
  assert.equal(normalizeName("  &Joy  Frutas, Banana + Cacau "), "joy frutas banana cacau");
  assert.equal(matchLevel("Banana", "banana"), 0);
  assert.equal(matchLevel("BANANA!", "Banana"), 0);
  assert.equal(matchLevel("Banana, raw", "banana"), 1);
  assert.equal(matchLevel("Bananas", "banana"), 2);
  assert.equal(matchLevel("&Joy Frutas Banana + Cacau", "banana"), 3);
  assert.equal(matchLevel("Peanut butter cups", "butter peanut"), 3);
  assert.equal(matchLevel("Bananenbrot", "nenb"), 4);
  assert.equal(matchLevel("Ice cream", "banana"), 5);
  assert.equal(matchLevel("Crème brûlée", "creme brulee"), 0);
});

test("rankFoods: match level first, then nutrient completeness, then the shorter name", () => {
  const foods = [
    rf("&Joy Frutas Banana + Cacau", 20),
    rf("Banana ice cream with chocolate chips", 10),
    rf("Bananas", 5),
    rf("Banana chips", 8),
    rf("Banana", 3),
    rf("Banana", 12, { sourceId: "rich" }),
    rf("Banana bread", 8),
    rf("Ice cream", 40),
  ];
  const order = rankFoods("banana", foods).map((f) => f.sourceId);
  assert.deepEqual(order, [
    "rich",
    "Banana",
    "Banana ice cream with chocolate chips",
    "Banana chips", // same level, nutrients and length as bread: input order
    "Banana bread",
    "Bananas",
    "&Joy Frutas Banana + Cacau",
    "Ice cream",
  ]);
  assert.equal(foods[0].name, "&Joy Frutas Banana + Cacau", "input is not changed");
});

test("searchFoods ranks within each source; OFF stays before USDA", async () => {
  const off: OffClient = {
    async getProduct() {
      return null;
    },
    async search() {
      return { count: 3, foods: [rf("&Joy Banana"), rf("Ice cream banana"), rf("Banana")] };
    },
  };
  const usda = {
    async search() {
      return { totalHits: 2, foods: [rf("Bread, banana", 0, { source: "usda" }), rf("Bananas, raw", 0, { source: "usda" })] };
    },
    async getFood(): Promise<never> {
      throw new Error("not used");
    },
  };
  const r = await searchFoods("banana", { sources: { off, usda: { client: usda, apiKey: "TESTKEY-not-real" } } });
  assert.deepEqual(r.results.map((f) => f.name), ["Banana", "&Joy Banana", "Ice cream banana", "Bananas, raw", "Bread, banana"]);
});

// ---------- Discard wording ----------

test("discardPrompt names how many changes go and that the phone loses them too", () => {
  assert.equal(discardPrompt(1), "Discard 1 waiting food change? They'll be removed from this phone too.");
  assert.equal(discardPrompt(3), "Discard 3 waiting food changes? They'll be removed from this phone too.");
  assert.equal(discardPrompt(0), "Discard 1 waiting food change? They'll be removed from this phone too.");
});

test("Galaxy scanner back-out message counts as a cancel", () => {
  assert.equal(isScanCancel(new Error("Failed to scan code.")), true);
  assert.equal(isScanCancel({ message: "Google Play services unavailable" }), false);
});

test("OFF search retries once after a 503, then succeeds", async () => {
  let calls = 0;
  const client = createOffClient({
    retryDelayMs: 0,
    get: async () => {
      calls += 1;
      if (calls === 1) return { status: 503, data: "<html>busy</html>" };
      return { status: 200, data: { count: 0, products: [] } };
    },
  });
  const res = await client.search("banana");
  assert.equal(calls, 2);
  assert.equal(res.foods.length, 0);
});

test("OFF search gives up as unavailable after two 503s", async () => {
  let calls = 0;
  const client = createOffClient({
    retryDelayMs: 0,
    get: async () => {
      calls += 1;
      return { status: 503, data: "" };
    },
  });
  await assert.rejects(client.search("banana"), (e: { code?: string }) => e.code === "unavailable");
  assert.equal(calls, 2);
});
