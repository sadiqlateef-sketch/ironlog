import { test } from "node:test";
import assert from "node:assert/strict";
import { hintFromFormat, isNetworkFailure, lookupBarcode } from "../src/lib/nutrition/barcode-lookup.ts";
import type { LookupDeps } from "../src/lib/nutrition/barcode-lookup.ts";
import { NutritionError } from "../src/lib/nutrition/http.ts";
import { emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";
import type { RemoteFood } from "../src/lib/nutrition/search.ts";

// Codes are reference check-digit vectors, not real products.
const UPCA = "036000291452";
const EAN13_OF_UPCA = "0036000291452";
const EAN13 = "4006381333931";

function food(over: Partial<Food>): Food {
  return {
    id: "fake-id",
    name: "Test food",
    brand: null,
    barcode: null,
    liquid: false,
    servingAmount: null,
    packageAmount: null,
    nutrients: emptyNutrients(),
    source: "user",
    sourceId: null,
    sourceUrl: null,
    note: null,
    archived: false,
    ...over,
  };
}

function remote(code: string): RemoteFood {
  return {
    source: "off",
    sourceId: code,
    name: "Fake product",
    brand: null,
    barcode: code,
    sourceUrl: "https://example.invalid/fake",
    liquid: false,
    serving: null,
    packageAmount: null,
    nutrients: emptyNutrients(),
    droppedUnits: [],
  };
}

function deps(over: Partial<LookupDeps> & { products?: Record<string, RemoteFood>; error?: unknown } = {}) {
  const calls: string[] = [];
  const d: LookupDeps = {
    foods: over.foods ?? [],
    isOnline: over.isOnline ?? (() => true),
    getProduct: async (code) => {
      calls.push(code);
      if (over.error) throw over.error;
      return over.products?.[code] ?? null;
    },
  };
  return { d, calls };
}

test("local hit makes no network call", async () => {
  const mine = food({ id: "a", barcode: EAN13 });
  const { d, calls } = deps({ foods: [mine] });
  const r = await lookupBarcode(EAN13, d);
  assert.equal(r.kind, "local");
  assert.equal(r.kind === "local" && r.food.id, "a");
  assert.deepEqual(calls, []);
});

test("a UPC-A scan matches a stored EAN-13 with a leading 0", async () => {
  const { d, calls } = deps({ foods: [food({ id: "b", barcode: EAN13_OF_UPCA })] });
  const r = await lookupBarcode(UPCA, d, "UPC_A");
  assert.equal(r.kind === "local" && r.food.id, "b");
  assert.deepEqual(calls, []);
});

test("archived local food is skipped and the lookup goes online", async () => {
  const { d, calls } = deps({ foods: [food({ barcode: EAN13, archived: true })] });
  const r = await lookupBarcode(EAN13, d);
  assert.equal(r.kind, "not-found");
  assert.deepEqual(calls, [EAN13]);
});

test("OFF lookup tries the 12-digit form, then the 13-digit form", async () => {
  const { d, calls } = deps({ products: { [EAN13_OF_UPCA]: remote(EAN13_OF_UPCA) } });
  const r = await lookupBarcode(UPCA, d);
  assert.equal(r.kind, "remote");
  assert.equal(r.kind === "remote" && r.food.barcode, EAN13_OF_UPCA);
  assert.deepEqual(calls, [UPCA, EAN13_OF_UPCA]);
});

test("first form hit stops the lookup", async () => {
  const { d, calls } = deps({ products: { [UPCA]: remote(UPCA) } });
  const r = await lookupBarcode(UPCA, d);
  assert.equal(r.kind, "remote");
  assert.deepEqual(calls, [UPCA]);
});

test("a product with no nutrients is still a remote hit", async () => {
  const { d } = deps({ products: { [EAN13]: remote(EAN13) } });
  assert.equal((await lookupBarcode(EAN13, d)).kind, "remote");
});

test("not found after both forms", async () => {
  const { d, calls } = deps();
  const r = await lookupBarcode(UPCA, d);
  assert.deepEqual(r, { kind: "not-found", code: UPCA, warning: false });
  assert.deepEqual(calls, [UPCA, EAN13_OF_UPCA]);
});

test("offline returns offline with no calls", async () => {
  const { d, calls } = deps({ isOnline: () => false });
  assert.deepEqual(await lookupBarcode(EAN13, d), { kind: "offline", code: EAN13, warning: false });
  assert.deepEqual(calls, []);
});

test("offline still finds a local food", async () => {
  const { d } = deps({ isOnline: () => false, foods: [food({ barcode: EAN13 })] });
  assert.equal((await lookupBarcode(EAN13, d)).kind, "local");
});

test("rate-limited is a failure with a plain message and no URL", async () => {
  const { d } = deps({ error: new NutritionError("rate-limited", "HTTP 429") });
  const r = await lookupBarcode(EAN13, d);
  assert.equal(r.kind, "failed");
  const message = r.kind === "failed" ? r.message : "";
  assert.equal(message, "Too many searches, wait a minute");
  assert.doesNotMatch(message, /http|www|\.org|\//i);
});

test("a server error (HTTP 503) is a failure, not offline", async () => {
  const { d } = deps({ error: new NutritionError("unavailable", "HTTP 503") });
  const r = await lookupBarcode(EAN13, d);
  assert.equal(r.kind, "failed");
  assert.equal(r.kind === "failed" && r.message, "Open Food Facts isn't answering right now");
});

test("a network failure behaves like offline", async () => {
  const { d } = deps({ error: new NutritionError("unavailable", "Unable to resolve host") });
  assert.deepEqual(await lookupBarcode(EAN13, d), { kind: "offline", code: EAN13, warning: false });
});

test("a wrong check digit warns but still looks up", async () => {
  const { d, calls } = deps();
  const r = await lookupBarcode("4006381333932", d);
  assert.deepEqual(r, { kind: "not-found", code: "4006381333932", warning: true });
  assert.deepEqual(calls, ["4006381333932"]);
});

test("too short or junk input is invalid with no calls", async () => {
  const { d, calls } = deps();
  assert.deepEqual(await lookupBarcode("12345", d), { kind: "invalid" });
  assert.deepEqual(await lookupBarcode("hello", d), { kind: "invalid" });
  assert.deepEqual(calls, []);
});

test("a UPC-E scan is expanded before matching", async () => {
  // 01234565 expands to UPC-A 012345000065.
  const { d } = deps({ foods: [food({ id: "c", barcode: "012345000065" })] });
  const r = await lookupBarcode("01234565", d, hintFromFormat("UPC_E"));
  assert.equal(r.kind === "local" && r.food.id, "c");
});

test("hintFromFormat and isNetworkFailure", () => {
  assert.equal(hintFromFormat("EAN_13"), "EAN_13");
  assert.equal(hintFromFormat("QR_CODE"), undefined);
  assert.equal(hintFromFormat(null), undefined);
  assert.equal(isNetworkFailure(new NutritionError("unavailable")), true);
  assert.equal(isNetworkFailure(new NutritionError("unavailable", "HTTP 503")), false);
  assert.equal(isNetworkFailure(new Error("boom")), false);
});
