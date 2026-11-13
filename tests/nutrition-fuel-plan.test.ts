import test from "node:test";
import assert from "node:assert/strict";
import { fuelPlan, NO_SHIFTS_TEXT, withTime } from "../src/lib/nutrition/fuel-plan.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import { SHIFT_PRESETS, type Shift, type ShiftType } from "../src/lib/shifts.ts";

const D = "2026-11-12";
const shift = (type: ShiftType): Shift => ({ date: D, type, ...SHIFT_PRESETS[type] });
const times = (p: ReturnType<typeof fuelPlan>) => p.anchors.map((a) => [a.id, a.at.getDate(), a.at.getHours(), a.at.getMinutes()]);

test("day shift 07:00-19:30: before 05:30, mid 13:15, after 20:00", () => {
  const p = fuelPlan(D, [shift("day")], DEFAULT_MEALS);
  assert.deepEqual(times(p), [["before", 12, 5, 30], ["mid", 12, 13, 15], ["after", 12, 20, 0]]);
  assert.equal(p.note, null);
});

test("evening shift 15:00-23:30: before 13:30, mid 19:15, after 00:00 next day", () => {
  const p = fuelPlan(D, [shift("evening")], DEFAULT_MEALS);
  assert.deepEqual(times(p), [["before", 12, 13, 30], ["mid", 12, 19, 15], ["after", 13, 0, 0]]);
});

test("night shift 19:00-07:30: before 17:30, mid 01:15, after 08:00 next morning", () => {
  const p = fuelPlan(D, [shift("night")], DEFAULT_MEALS);
  assert.deepEqual(times(p), [["before", 12, 17, 30], ["mid", 13, 1, 15], ["after", 13, 8, 0]]);
  assert.ok(p.anchors.every((a) => !("amount" in a)));
});

test("off day uses meal slots; no shifts at all adds the fallback text", () => {
  const off = fuelPlan(D, [{ ...shift("day"), date: "2026-11-13" }], DEFAULT_MEALS);
  assert.deepEqual(off.anchors.map((a) => a.label), ["Breakfast", "Lunch", "Dinner"]);
  assert.equal(off.note, null);
  const none = fuelPlan(D, [], DEFAULT_MEALS);
  assert.equal(none.note, NO_SHIFTS_TEXT);
  assert.equal(none.note, "Add your shifts to plan around them");
  assert.equal(none.shift, null);
});

test("custom offsets and an edited anchor time", () => {
  const p = fuelPlan(D, [shift("day")], DEFAULT_MEALS, { beforeMin: 60, afterMin: 0 });
  assert.deepEqual(times(p)[0], ["before", 12, 6, 0]);
  assert.deepEqual(times(p)[2], ["after", 12, 19, 30]);
  const moved = withTime(p.anchors[1], "12:45");
  assert.equal(moved.at.getHours(), 12);
  assert.equal(moved.at.getMinutes(), 45);
  assert.equal(withTime(p.anchors[1], "junk"), p.anchors[1]);
});

test("pre-lift: carbs in the last 3 h count logged entries only, and flag a missing value", async () => {
  const { carbsInLast } = await import("../src/lib/nutrition/fuel-plan.ts");
  const now = new Date(2026, 10, 12, 17, 0);
  const e = (h: number, carbs: number | null, status = "logged") => ({
    eatenAt: new Date(2026, 10, 12, h, 0).toISOString(),
    status,
    nutrients: carbs === null ? {} : { carbohydrates: { value: carbs, state: "complete" } },
  });
  assert.deepEqual(carbsInLast([e(15, 40), e(16, 20), e(12, 90), e(16, 50, "planned")], now), { grams: 60, incomplete: false, count: 2 });
  assert.deepEqual(carbsInLast([e(15, 40), e(16, null)], now), { grams: 40, incomplete: true, count: 2 });
  assert.deepEqual(carbsInLast([], now), { grams: 0, incomplete: false, count: 0 });
});
