import test from "node:test";
import assert from "node:assert/strict";
import { nextNudgeAt, nudgeTimeFor } from "../src/lib/nutrition/nudge.ts";
import { SHIFT_PRESETS, type Shift } from "../src/lib/shifts.ts";

const prefs = { day_start: "00:00", follow_shifts: false, post_night_start: "15:00" };
const night = (date: string): Shift => ({ date, type: "night", ...SHIFT_PRESETS.night });

test("nudge off -> null", () => {
  assert.equal(nextNudgeAt(new Date(2026, 10, 12, 10, 0), prefs, [], false, null), null);
  assert.equal(nextNudgeAt(new Date(2026, 10, 12, 10, 0), prefs, [], false, "8pm"), null);
});

test("nothing logged: today's time; logged: no nudge today, the next day's time instead", () => {
  const now = new Date(2026, 10, 12, 10, 0);
  assert.deepEqual(nextNudgeAt(now, prefs, [], false, "20:00"), new Date(2026, 10, 12, 20, 0));
  assert.deepEqual(nextNudgeAt(now, prefs, [], true, "20:00"), new Date(2026, 10, 13, 20, 0));
  // Past today's time: tomorrow.
  assert.deepEqual(nextNudgeAt(new Date(2026, 10, 12, 21, 0), prefs, [], false, "20:00"), new Date(2026, 10, 13, 20, 0));
});

test("night-shift day: the nudge moves to the shift's end, inside the food day", () => {
  const shifts = [night("2026-11-12")];
  assert.deepEqual(nudgeTimeFor("2026-11-12", shifts, "20:00"), new Date(2026, 10, 13, 7, 30));
  const on = { ...prefs, follow_shifts: true };
  // 03:00 during the shift: food day is still the 12th, nothing logged -> 07:30.
  assert.deepEqual(nextNudgeAt(new Date(2026, 10, 13, 3, 0), on, shifts, false, "20:00"), new Date(2026, 10, 13, 7, 30));
  // Logged during the shift: the 13th's evening time.
  assert.deepEqual(nextNudgeAt(new Date(2026, 10, 13, 3, 0), on, shifts, true, "20:00"), new Date(2026, 10, 13, 20, 0));
  // From the afternoon before the night shift.
  assert.deepEqual(nextNudgeAt(new Date(2026, 10, 12, 14, 0), on, shifts, false, "20:00"), new Date(2026, 10, 13, 7, 30));
});
