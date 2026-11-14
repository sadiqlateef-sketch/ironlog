import test from "node:test";
import assert from "node:assert/strict";
import { MAX_LEFTOVER_REMINDERS, reminderTimes, toUseSoon } from "../src/lib/nutrition/leftovers.ts";
import type { Batch } from "../src/lib/nutrition/batch.ts";
import type { PantryItem } from "../src/lib/nutrition/pantry.ts";

const batch = (id: string, useBy: string | null, over: Partial<Batch> = {}): Batch => ({
  id, recipeId: null, foodId: "f", name: `Batch ${id}`, madeOn: "2026-11-10", portions: 4, portionsLeft: 2, portionAmount: 300, useBy, finished: false, note: null, ...over,
});
const item = (id: string, useBy: string | null, quantity = 1): PantryItem => ({
  id, foodId: `food-${id}`, quantity, unit: "serving", location: "fridge", addedOn: "2026-11-10", openedOn: null, useBy, note: null,
});

test("toUseSoon: within the window or past, soonest first, finished and empty skipped", () => {
  const out = toUseSoon(
    [batch("a", "2026-11-15"), batch("b", "2026-11-12"), batch("c", "2026-11-14", { finished: true }), batch("d", "2026-11-14", { portionsLeft: 0 }), batch("e", null), batch("f", "2026-11-30")],
    [item("p", "2026-11-14"), item("q", "2026-11-15"), item("r", "2026-11-13", 0)],
    "2026-11-13",
    2,
  );
  assert.deepEqual(out.map((o) => o.id), ["b", "p", "a", "q"]);
  assert.equal(out[0].past, true);
  assert.equal(out[1].label, "food-p");
});

test("reminderTimes: evening before, one per day, future only, capped", () => {
  const now = new Date(2026, 10, 13, 12, 0);
  const r = reminderTimes(
    [
      { useBy: "2026-11-14", label: "Chili" },
      { useBy: "2026-11-14", label: "Rice" },
      { useBy: "2026-11-13", label: "Soup" },
      { useBy: "2026-11-12", label: "Old" },
    ],
    now,
  );
  assert.deepEqual(r.map((x) => [x.day, x.at.getDate(), x.at.getHours(), x.labels]), [
    ["2026-11-13", 13, 18, ["Soup"]],
    ["2026-11-14", 13, 18, ["Chili", "Rice"]],
  ]);
  const many = Array.from({ length: 30 }, (_, i) => ({ useBy: `2026-12-${String(i + 1).padStart(2, "0")}`, label: `x${i}` }));
  assert.equal(reminderTimes(many, now).length, MAX_LEFTOVER_REMINDERS);
});
