import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barcodeKey,
  cleanBarcode,
  expandUpcE,
  findLocalByBarcode,
  isPendingFood,
  isValidGtin,
  normalizeBarcode,
  offLookupCodes,
  pendingLabel,
  sameBarcode,
} from "../src/lib/nutrition/barcode.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";

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

test("cleanBarcode keeps digits only", () => {
  assert.equal(cleanBarcode(" 4006 381-333931 "), "4006381333931");
  assert.equal(cleanBarcode("]E04006381333931"), "04006381333931");
  assert.equal(cleanBarcode("abc"), "");
  assert.equal(cleanBarcode(""), "");
});

// EAN-13 4006381333931: body 400638133393, weights from the right 3,1,...
// 3*3+9*1+3*3+3*1+3*3+1*1+8*3+3*1+6*3+0*1+0*3+4*1 = 89 -> check (10-9)%10 = 1.
test("EAN-13 check digit", () => {
  assert.equal(isValidGtin("4006381333931"), true);
  assert.equal(isValidGtin("4006381333932"), false);
});

// UPC-A 036000291452: body 03600029145 -> 5*3+4+1*3+9+2*3+0+0+0+6*3+3+0 = 58 -> check 2.
test("UPC-A check digit", () => {
  assert.equal(isValidGtin("036000291452"), true);
  assert.equal(isValidGtin("036000291453"), false);
});

// EAN-8 96385074: body 9638507 -> 7*3+0+5*3+8+3*3+6+9*3 = 86 -> check 4.
test("EAN-8 check digit", () => {
  assert.equal(isValidGtin("96385074"), true);
  assert.equal(isValidGtin("96385075"), false);
});

test("isValidGtin rejects junk and wrong lengths", () => {
  assert.equal(isValidGtin("12345"), false);
  assert.equal(isValidGtin("40063813339a1"), false);
  assert.equal(isValidGtin(""), false);
});

// 01234565: middle 123456, last 6 (5-9 rule) -> 0 12345 0000 6 + check 5.
// Check of 01234500006: 6*3+5*1+4*3+3*1+2*3+1*1 = 45 -> 5.
test("expandUpcE: 5-9 rule", () => {
  assert.equal(expandUpcE("01234565"), "012345000065");
  assert.equal(isValidGtin("012345000065"), true);
});

// 04252614: middle 425261, last 1 (0-2 rule) -> 0 42 1 0000 526 + check 4.
// Check of 04210000526: 6*3+2*1+5*3+0+0+0+0+1*1+2*3+4*1+0 = 46 -> 4.
test("expandUpcE: 0-2 rule (derived vector)", () => {
  assert.equal(expandUpcE("04252614"), "042100005264");
  assert.equal(isValidGtin("042100005264"), true);
});

test("expandUpcE: 3 and 4 rules, and rejects bad input", () => {
  assert.equal(expandUpcE("01234537"), "012300000457");
  assert.equal(expandUpcE("01234547"), "012340000057");
  assert.equal(expandUpcE("21234565"), null);
  assert.equal(expandUpcE("1234565"), null);
});

test("normalizeBarcode: lengths and kinds", () => {
  assert.equal(normalizeBarcode("1234567"), null);
  assert.equal(normalizeBarcode("123456789012345"), null);
  assert.equal(normalizeBarcode("abc"), null);
  assert.deepEqual(normalizeBarcode("4006-3813-33931"), { code: "4006381333931", valid: true, kind: "ean13" });
  assert.deepEqual(normalizeBarcode("036000291452"), { code: "036000291452", valid: true, kind: "upca" });
  assert.deepEqual(normalizeBarcode("00036000291452"), { code: "00036000291452", valid: true, kind: "gtin14" });
});

test("normalizeBarcode: wrong check digit is kept with valid false", () => {
  assert.deepEqual(normalizeBarcode("4006381333932"), { code: "4006381333932", valid: false, kind: "ean13" });
});

test("normalizeBarcode: 8 digits", () => {
  // Valid EAN-8 stays EAN-8.
  assert.deepEqual(normalizeBarcode("96385074"), { code: "96385074", valid: true, kind: "ean8" });
  // Not a valid EAN-8 (EAN-8 check would be 0), valid as UPC-E -> expanded.
  assert.deepEqual(normalizeBarcode("04252614"), { code: "042100005264", valid: true, kind: "upca" });
  // Scanner says UPC_E: always expand.
  assert.deepEqual(normalizeBarcode("01234565", "UPC_E"), { code: "012345000065", valid: true, kind: "upca" });
  // Valid as both without a hint: EAN-8 wins.
  assert.equal(normalizeBarcode("01234565")?.kind, "ean8");
  // Neither: EAN-8, invalid.
  assert.deepEqual(normalizeBarcode("96385075"), { code: "96385075", valid: false, kind: "ean8" });
});

test("barcodeKey: UPC-A, EAN-13 with leading 0 and GTIN-14 share a key", () => {
  const k = barcodeKey("036000291452");
  assert.equal(k, "00036000291452");
  assert.equal(barcodeKey("0036000291452"), k);
  assert.equal(barcodeKey("00036000291452"), k);
  assert.equal(barcodeKey(""), "");
});

test("sameBarcode", () => {
  assert.equal(sameBarcode("036000291452", "0036000291452"), true);
  assert.equal(sameBarcode("036000291452", "4006381333931"), false);
  assert.equal(sameBarcode("96385074", "4006381333931"), false);
  assert.equal(sameBarcode("", ""), false);
  assert.equal(sameBarcode(null, "96385074"), false);
});

test("offLookupCodes", () => {
  assert.deepEqual(offLookupCodes("036000291452"), ["036000291452", "0036000291452"]);
  assert.deepEqual(offLookupCodes("0036000291452"), ["0036000291452", "036000291452"]);
  assert.deepEqual(offLookupCodes("4006381333931"), ["4006381333931"]);
  assert.deepEqual(offLookupCodes("96385074"), ["96385074"]);
  assert.deepEqual(offLookupCodes(""), []);
});

test("findLocalByBarcode ignores archived foods", () => {
  const foods = [food({ id: "a", barcode: "0036000291452", archived: true })];
  assert.equal(findLocalByBarcode(foods, "036000291452"), null);
});

test("findLocalByBarcode prefers user over off, matching across forms", () => {
  const foods = [
    food({ id: "off", source: "off", sourceId: "x1", barcode: "0036000291452" }),
    food({ id: "mine", source: "user", barcode: "036000291452" }),
    food({ id: "other", source: "user", barcode: "96385074" }),
  ];
  assert.equal(findLocalByBarcode(foods, "00036000291452")?.id, "mine");
  assert.equal(findLocalByBarcode(foods.slice(0, 1), "036000291452")?.id, "off");
  assert.equal(findLocalByBarcode(foods, "4006381333931"), null);
});

test("pendingLabel", () => {
  assert.equal(pendingLabel("96385074"), "Unknown product (96385074)");
});

test("isPendingFood: offline placeholder is pending", () => {
  assert.equal(isPendingFood(food({ barcode: "96385074", name: pendingLabel("96385074") })), true);
});

test("isPendingFood: renamed, filled in, or from a source is not pending", () => {
  const base = { barcode: "96385074", name: pendingLabel("96385074") };
  assert.equal(isPendingFood(food({ ...base, name: "My snack" })), false);
  const n = emptyNutrients();
  n.energy = complete(1);
  assert.equal(isPendingFood(food({ ...base, nutrients: n })), false);
  assert.equal(isPendingFood(food({ ...base, source: "off", sourceId: "x2" })), false);
  assert.equal(isPendingFood(food({ ...base, sourceId: "x3" })), false);
  assert.equal(isPendingFood(food({ name: pendingLabel("96385074") })), false);
});
