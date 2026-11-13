import test from "node:test";
import assert from "node:assert/strict";
import { foodDay, foodDayFor, normalizePrefs, DEFAULT_PREFS } from "../src/lib/nutrition/day.ts";
import { crossesMidnight, nightBefore, postNightFoodDay } from "../src/lib/nutrition/shift-day.ts";
import { SHIFT_PRESETS, type Shift } from "../src/lib/shifts.ts";

const night = (date: string): Shift => ({ date, type: "night", ...SHIFT_PRESETS.night });
const dayShift = (date: string): Shift => ({ date, type: "day", ...SHIFT_PRESETS.day });
const on = { day_start: "00:00", follow_shifts: true, post_night_start: "15:00" };

test("night shift: entries at 03:00 and 11:00 the next day land on the shift's day", () => {
  const shifts = [night("2026-11-12")];
  assert.equal(foodDayFor(new Date(2026, 10, 13, 3, 0), on, shifts), "2026-11-12");
  assert.equal(foodDayFor(new Date(2026, 10, 13, 11, 0), on, shifts), "2026-11-12");
  assert.equal(foodDayFor(new Date(2026, 10, 13, 14, 59), on, shifts), "2026-11-12");
  assert.equal(foodDayFor(new Date(2026, 10, 13, 15, 0), on, shifts), "2026-11-13");
  // During the shift before midnight: the shift's own day anyway.
  assert.equal(foodDayFor(new Date(2026, 10, 12, 22, 0), on, shifts), "2026-11-12");
});

test("off day and day shift: unchanged", () => {
  const shifts = [dayShift("2026-11-12")];
  for (const t of [new Date(2026, 10, 13, 3, 0), new Date(2026, 10, 12, 3, 0), new Date(2026, 10, 12, 20, 0)]) {
    assert.equal(foodDayFor(t, on, shifts), foodDay(t, "00:00"));
  }
  assert.equal(foodDayFor(new Date(2026, 10, 13, 3, 0), on, []), "2026-11-13");
});

test("follow_shifts off keeps the old day-start rule", () => {
  const shifts = [night("2026-11-12")];
  const off = { ...on, follow_shifts: false };
  assert.equal(foodDayFor(new Date(2026, 10, 13, 3, 0), off, shifts), "2026-11-13");
  assert.equal(foodDayFor(new Date(2026, 10, 13, 3, 0), { ...off, day_start: "04:00" }, shifts), "2026-11-12");
  assert.equal(foodDayFor(new Date(2026, 10, 13, 3, 0), DEFAULT_PREFS, shifts), "2026-11-13");
});

test("a late day start still applies with the shift rule on", () => {
  assert.equal(foodDayFor(new Date(2026, 10, 13, 3, 0), { ...on, day_start: "04:00" }, []), "2026-11-12");
});

test("shift-day helpers: crossesMidnight, nightBefore, custom post-night start", () => {
  assert.equal(crossesMidnight({ type: "night", start: "19:00", end: "07:30" }), true);
  assert.equal(crossesMidnight({ type: "evening", start: "15:00", end: "23:30" }), false);
  assert.equal(crossesMidnight({ type: "evening", start: "16:00", end: "00:30" }), true);
  assert.equal(nightBefore("2026-11-13", [night("2026-11-12")])?.date, "2026-11-12");
  assert.equal(nightBefore("2026-11-14", [night("2026-11-12")]), null);
  assert.equal(postNightFoodDay(new Date(2026, 10, 13, 11, 0), [night("2026-11-12")], "10:00"), null);
  assert.equal(postNightFoodDay(new Date(2026, 10, 13, 9, 0), [night("2026-11-12")], "10:00"), "2026-11-12");
  assert.equal(postNightFoodDay(new Date(2026, 10, 13, 9, 0), [night("2026-11-12")], "junk"), "2026-11-12");
});

test("normalizePrefs: follow_shifts off and post_night_start 15:00 by default; keeps valid values", () => {
  const p = normalizePrefs({});
  assert.equal(p.follow_shifts, false);
  assert.equal(p.post_night_start, "15:00");
  const q = normalizePrefs({ follow_shifts: true, post_night_start: "12:30" });
  assert.equal(q.follow_shifts, true);
  assert.equal(q.post_night_start, "12:30");
  const r = normalizePrefs({ follow_shifts: "yes", post_night_start: "25:00" });
  assert.equal(r.follow_shifts, false);
  assert.equal(r.post_night_start, "15:00");
});
