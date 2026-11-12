import { test } from "node:test";
import assert from "node:assert/strict";
import { isBarcodeQuery, searchFoods } from "../src/lib/nutrition/search.ts";
import { NutritionError } from "../src/lib/nutrition/http.ts";
import { emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import type { OffClient } from "../src/lib/nutrition/sources/off.ts";
import type { UsdaClient } from "../src/lib/nutrition/sources/usda.ts";
import type { RemoteFood } from "../src/lib/nutrition/types.ts";

function food(over: Partial<RemoteFood>): RemoteFood {
  return {
    source: "off",
    sourceId: "1",
    name: "Thing",
    brand: null,
    barcode: null,
    sourceUrl: "https://example.test/1",
    liquid: false,
    serving: null,
    packageAmount: null,
    nutrients: emptyNutrients(),
    droppedUnits: [],
    ...over,
  };
}

function fakeOff(foods: RemoteFood[], calls: string[], opts: { fail?: NutritionError } = {}): OffClient {
  return {
    async getProduct(barcode) {
      calls.push(`getProduct:${barcode}`);
      if (opts.fail) throw opts.fail;
      return foods[0] ?? null;
    },
    async search(query) {
      calls.push(`search:${query}`);
      if (opts.fail) throw opts.fail;
      return { count: foods.length, foods };
    },
  };
}

function fakeUsda(foods: RemoteFood[], calls: string[], opts: { fail?: NutritionError } = {}): UsdaClient {
  return {
    async search(query, apiKey) {
      calls.push(`usda:${query}:${apiKey}`);
      if (opts.fail) throw opts.fail;
      return { totalHits: foods.length, foods };
    },
    async getFood() {
      throw new Error("not used");
    },
  };
}

test("isBarcodeQuery accepts trimmed digit strings only", () => {
  assert.equal(isBarcodeQuery("3017620422003"), true);
  assert.equal(isBarcodeQuery("  123  "), true);
  assert.equal(isBarcodeQuery(""), false);
  assert.equal(isBarcodeQuery("   "), false);
  assert.equal(isBarcodeQuery("12a4"), false);
  assert.equal(isBarcodeQuery("1 2"), false);
});

test("barcode query goes to OFF getProduct, USDA still gets the text", async () => {
  const calls: string[] = [];
  const off = fakeOff([food({ sourceId: "3017620422003", barcode: "3017620422003" })], calls);
  const usda = { client: fakeUsda([food({ source: "usda", sourceId: "9" })], calls), apiKey: "k" };
  const r = await searchFoods(" 3017620422003 ", { sources: { off, usda } });
  assert.deepEqual([...calls].sort(), ["getProduct:3017620422003", "usda:3017620422003:k"]);
  assert.equal(r.results.length, 2);
  assert.equal(r.results[0].source, "off");
  assert.equal(r.errors.length, 0);
});

test("barcode not found in OFF yields no OFF result and no error", async () => {
  const calls: string[] = [];
  const r = await searchFoods("0000", { sources: { off: fakeOff([], calls) } });
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.errors, []);
});

test("text query uses OFF search, not getProduct", async () => {
  const calls: string[] = [];
  await searchFoods("apple", { sources: { off: fakeOff([food({})], calls) } });
  assert.deepEqual(calls, ["search:apple"]);
});

test("per-source limits cap results; default is 50", async () => {
  const many = (src: "off" | "usda", n: number) =>
    Array.from({ length: n }, (_, i) => food({ source: src, sourceId: String(i), name: `n${i}` }));
  const calls: string[] = [];
  const limited = await searchFoods("x", {
    sources: { off: fakeOff(many("off", 10), calls), usda: { client: fakeUsda(many("usda", 10), calls), apiKey: "k" } },
    limits: { off: 3, usda: 2 },
  });
  assert.equal(limited.results.filter((f) => f.source === "off").length, 3);
  assert.equal(limited.results.filter((f) => f.source === "usda").length, 2);

  const dflt = await searchFoods("x", {
    sources: { off: fakeOff(many("off", 80), calls), usda: { client: fakeUsda(many("usda", 80), calls), apiKey: "k" } },
  });
  assert.equal(dflt.results.filter((f) => f.source === "off").length, 50);
  assert.equal(dflt.results.filter((f) => f.source === "usda").length, 50);
});

test("in-source dedupe: name case/trim, brand-or-null, barcode-or-null", async () => {
  const calls: string[] = [];
  const foods = [
    food({ sourceId: "a", name: "Cola", brand: "Acme", barcode: "1" }),
    food({ sourceId: "b", name: "  cola ", brand: "Acme", barcode: "1" }), // dup of a
    food({ sourceId: "c", name: "Cola", brand: "Other", barcode: "1" }), // different brand
    food({ sourceId: "d", name: "Cola", brand: null, barcode: "1" }), // null brand differs
    food({ sourceId: "e", name: "Cola", brand: "Acme", barcode: null }), // null barcode differs
    food({ sourceId: "f", name: "COLA", brand: "Acme", barcode: null }), // dup of e
  ];
  const r = await searchFoods("cola", { sources: { off: fakeOff(foods, calls) } });
  assert.deepEqual(r.results.map((f) => f.sourceId), ["a", "c", "d", "e"]);
});

test("cross-source duplicates are kept", async () => {
  const calls: string[] = [];
  const r = await searchFoods("cola", {
    sources: {
      off: fakeOff([food({ source: "off", name: "Cola", brand: "Acme" })], calls),
      usda: { client: fakeUsda([food({ source: "usda", name: "Cola", brand: "Acme" })], calls), apiKey: "k" },
    },
  });
  assert.deepEqual(r.results.map((f) => f.source), ["off", "usda"]);
});

test("one source failing still returns the other plus an errors entry", async () => {
  const calls: string[] = [];
  const err = new NutritionError("unavailable", "HTTP 503");
  const r = await searchFoods("apple", {
    sources: {
      off: fakeOff([], calls, { fail: err }),
      usda: { client: fakeUsda([food({ source: "usda", sourceId: "u1" })], calls), apiKey: "k" },
    },
  });
  assert.deepEqual(r.results.map((f) => f.sourceId), ["u1"]);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].source, "off");
  assert.equal(r.errors[0].error, err);

  const r2 = await searchFoods("apple", {
    sources: {
      off: fakeOff([food({ sourceId: "o1" })], calls),
      usda: { client: fakeUsda([], calls, { fail: new NutritionError("rate-limited") }), apiKey: "k" },
    },
  });
  assert.deepEqual(r2.results.map((f) => f.sourceId), ["o1"]);
  assert.equal(r2.errors[0].source, "usda");
  assert.equal(r2.errors[0].error.code, "rate-limited");
});

test("non-NutritionError throws are wrapped as unavailable", async () => {
  const off: OffClient = {
    async getProduct() {
      return null;
    },
    async search() {
      throw new Error("boom");
    },
  };
  const r = await searchFoods("apple", { sources: { off } });
  assert.equal(r.errors[0].error.code, "unavailable");
});

test("a source that is not provided is never called", async () => {
  const calls: string[] = [];
  const onlyOff = await searchFoods("apple", { sources: { off: fakeOff([food({})], calls) } });
  assert.deepEqual(calls, ["search:apple"]);
  assert.equal(onlyOff.results.length, 1);

  const calls2: string[] = [];
  const onlyUsda = await searchFoods("apple", {
    sources: { usda: { client: fakeUsda([food({ source: "usda" })], calls2), apiKey: "k" } },
  });
  assert.deepEqual(calls2, ["usda:apple:k"]);
  assert.equal(onlyUsda.results.length, 1);
});
