// The evening "log your food" nudge: at the user's chosen time on the current
// food day, unless something is already logged that day (then the next food
// day's time, so a missed day still gets its reminder). On a night-shift day
// the evening falls mid-shift, so the nudge moves to the shift's end, still
// inside that food day when "follow my shifts" is on. Pure, no app imports.

import { addDays, type Shift } from "../shifts.ts";
import { foodDayFor, parseHm } from "./day.ts";
import type { NutritionPrefs } from "./diary-types.ts";
import { crossesMidnight } from "./shift-day.ts";

type DayPrefs = Pick<NutritionPrefs, "day_start" | "follow_shifts" | "post_night_start">;

function at(day: string, hm: string, plusDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, d + plusDays, h, mi);
}

/** When the nudge for food day `day` would fire. */
export function nudgeTimeFor(day: string, shifts: readonly Shift[], time: string): Date {
  const night = shifts.find((s) => s.date === day && crossesMidnight(s));
  return night ? at(day, night.end, 1) : at(day, time);
}

/**
 * Next time to nudge, or null when the nudge is off (`time` not "HH:MM").
 * `loggedToday`: the current food day already has a logged entry.
 */
export function nextNudgeAt(now: Date, prefs: DayPrefs, shifts: readonly Shift[], loggedToday: boolean, time: string | null): Date | null {
  if (time === null || parseHm(time) === null) return null;
  const day = foodDayFor(now, prefs, shifts);
  const today = nudgeTimeFor(day, shifts, time);
  if (!loggedToday && today > now) return today;
  // Today is done (or its time has passed): the next food day's time.
  let next = addDays(day, 1);
  let t = nudgeTimeFor(next, shifts, time);
  // Guard: never a time already past.
  if (t <= now) {
    next = addDays(next, 1);
    t = nudgeTimeFor(next, shifts, time);
  }
  return t;
}
