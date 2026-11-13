import test from "node:test";
import assert from "node:assert/strict";
import { decrement, expiringSoon, pantryToRow, pantryUnits, rowToPantry, sortPantry, type PantryItem } from "../src/lib/nutrition/pantry.ts";

// A made-up food: 50 g servings, 500 g packages.
const FOOD = { liquid: false, servingAmount: 50, packageAmount: 500 };
const item = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: "p1",
  foodId: "f1",
  quantity: 400,
  unit: "g",
  location: "cupboard",
  addedOn: "2026-11-01",
  openedOn: null,
  useBy: null,
  note: null,
  ...over,
});

test("eating grams off a gram item", () => {
  const r = decrement(item(), 150, "g", FOOD);
  assert.equal(r.ok, true);
  assert.equal(r.item.quantity, 250);
});

test("servings come off a package count in the package's unit", () => {
  const r = decrement(item({ quantity: 2, unit: "package" }), 2, "serving", FOOD);
  // 2 packages = 1000 g; 2 servings = 100 g; 900 g = 1.8 packages.
  assert.equal(r.item.quantity, 1.8);
  const s = decrement(item({ quantity: 4, unit: "serving" }), 60, "g", FOOD);
  assert.equal(s.item.quantity, 2.8);
});

test("never below zero", () => {
  assert.equal(decrement(item({ quantity: 100 }), 300, "g", FOOD).item.quantity, 0);
});

test("an amount that can't be compared leaves the item untouched with a reason", () => {
  const before = item();
  const r = decrement(before, 100, "ml", FOOD);
  assert.equal(r.ok, false);
  assert.equal(r.item, before);
  assert.ok(!r.ok && r.reason.length > 0);
  const noServing = decrement(before, 1, "serving", { liquid: false, servingAmount: null, packageAmount: null });
  assert.equal(noServing.ok, false);
});

test("expiring soon: within the window, soonest first, undated left out", () => {
  const list = [
    item({ id: "late", useBy: "2026-11-20" }),
    item({ id: "past", useBy: "2026-11-10" }),
    item({ id: "soon", useBy: "2026-11-13" }),
    item({ id: "none", useBy: null }),
  ];
  assert.deepEqual(expiringSoon(list, "2026-11-12", 2).map((i) => i.id), ["past", "soon"]);
});

test("pantry sorts by place, then use-by, then oldest added", () => {
  const list = [
    item({ id: "c", location: "cupboard" }),
    item({ id: "f2", location: "fridge", useBy: null }),
    item({ id: "f1", location: "fridge", useBy: "2026-11-14" }),
    item({ id: "z", location: "freezer" }),
  ];
  assert.deepEqual(sortPantry(list).map((i) => i.id), ["f1", "f2", "z", "c"]);
});

test("units follow the food; rows round-trip", () => {
  assert.deepEqual(pantryUnits(FOOD), ["g", "serving", "package"]);
  assert.deepEqual(pantryUnits({ liquid: true, servingAmount: null, packageAmount: null }), ["ml"]);
  const p = item({ useBy: "2026-11-20" });
  assert.deepEqual(rowToPantry(pantryToRow(p)), p);
});
