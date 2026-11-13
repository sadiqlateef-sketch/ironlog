import { test } from "node:test";
import assert from "node:assert/strict";
import { isPendingFood } from "../src/lib/nutrition/barcode.ts";
import { applyEnrichment, decideEnrichment, makePendingFood, pendingFoods, pickBatch } from "../src/lib/nutrition/enrich.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import type { RemoteFood } from "../src/lib/nutrition/search.ts";

// Reference check-digit vector, not a real product. Nutrient numbers are fake.
const CODE = "4006381333931";

function remote(over: Partial<RemoteFood> = {}): RemoteFood {
  const nutrients = emptyNutrients();
  nutrients.energy = complete(1);
  return {
    source: "off",
    sourceId: CODE,
    name: "Fake product",
    brand: "Fake brand",
    barcode: CODE,
    sourceUrl: "https://example.invalid/fake",
    liquid: true,
    serving: { amount: 2, unit: "ml" },
    packageAmount: { amount: 1, unit: "ml" },
    nutrients,
    droppedUnits: [],
    ...over,
  };
}

test("makePendingFood is pending, with empty nutrients and the offline note", () => {
  const f = makePendingFood(CODE, "p1");
  assert.equal(isPendingFood(f), true);
  assert.equal(f.name, `Unknown product (${CODE})`);
  assert.deepEqual(f.nutrients, emptyNutrients());
  assert.match(f.note ?? "", /offline/);
});

test("pendingFoods keeps only pending foods", () => {
  const named = { ...makePendingFood(CODE, "p2"), name: "My snack" };
  assert.deepEqual(
    pendingFoods([makePendingFood(CODE, "p1"), named]).map((f) => f.id),
    ["p1"],
  );
});

test("applyEnrichment keeps the id and is no longer pending", () => {
  const out = applyEnrichment(makePendingFood(CODE, "p1"), remote());
  assert.equal(out.id, "p1");
  assert.equal(out.name, "Fake product");
  assert.equal(out.brand, "Fake brand");
  assert.equal(out.source, "off");
  assert.equal(out.sourceId, CODE);
  assert.equal(out.liquid, true);
  assert.equal(out.servingAmount, 2);
  assert.equal(out.packageAmount, 1);
  assert.equal(out.note, null);
  assert.equal(isPendingFood(out), false);
});

test("applyEnrichment keeps archived", () => {
  const out = applyEnrichment({ ...makePendingFood(CODE, "p1"), archived: true }, remote());
  assert.equal(out.archived, true);
});

test("applyEnrichment keeps the scanned code when the product has none", () => {
  assert.equal(applyEnrichment(makePendingFood(CODE, "p1"), remote({ barcode: null })).barcode, CODE);
});

test("decideEnrichment applies to a fresh pending food", () => {
  const d = decideEnrichment([makePendingFood(CODE, "p1")], "p1", remote());
  assert.equal(d.kind, "apply");
  assert.equal(d.kind === "apply" && d.food.id, "p1");
});

test("decideEnrichment skips a duplicate (source, sourceId)", () => {
  const existing = applyEnrichment(makePendingFood(CODE, "other"), remote());
  const d = decideEnrichment([makePendingFood(CODE, "p1"), existing], "p1", remote());
  assert.equal(d.kind, "duplicate");
  assert.equal(d.kind === "duplicate" && d.existing.id, "other");
});

test("decideEnrichment skips a food renamed meanwhile", () => {
  const renamed = { ...makePendingFood(CODE, "p1"), name: "Renamed" };
  assert.deepEqual(decideEnrichment([renamed], "p1", remote()), { kind: "not-pending" });
});

test("decideEnrichment skips a food that is gone", () => {
  assert.deepEqual(decideEnrichment([], "p1", remote()), { kind: "not-pending" });
});

test("pickBatch respects the cap and the tried set", () => {
  const pending = ["a", "b", "c", "d", "e", "f", "g"].map((id) => makePendingFood(CODE, id));
  assert.deepEqual(
    pickBatch(pending, new Set(), 5).map((f) => f.id),
    ["a", "b", "c", "d", "e"],
  );
  assert.deepEqual(
    pickBatch(pending, new Set(["a", "c"]), 5).map((f) => f.id),
    ["b", "d", "e", "f", "g"],
  );
  assert.deepEqual(pickBatch(pending, new Set(pending.map((f) => f.id)), 5), []);
});
