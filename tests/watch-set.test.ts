import test from "node:test";
import assert from "node:assert/strict";
import { watchSetPatch } from "../src/lib/workout-logic.ts";

test("a watch set shows in your unit and saves in kg", () => {
  const { ui, db } = watchSetPatch({ weightKg: 100, reps: 5 }, "imperial");
  assert.equal(ui.weight, "220.5");
  assert.equal(ui.reps, "5");
  assert.equal(db.weight, 100);
  assert.equal(db.reps, 5);
  assert.equal("rpe" in ui, false);
});

test("a metric watch set shows kg as it is", () => {
  const { ui, db } = watchSetPatch({ weightKg: 62.5, reps: 8, rpe: 9 }, "metric");
  assert.equal(ui.weight, "62.5");
  assert.equal(db.weight, 62.5);
  assert.equal(ui.rpe, 9);
  assert.equal(db.rpe, 9);
});

test("fields the watch didn't send are left alone", () => {
  const { ui, db } = watchSetPatch({ weightKg: null, reps: null }, "metric");
  assert.deepEqual(ui, {});
  assert.deepEqual(db, {});
});
