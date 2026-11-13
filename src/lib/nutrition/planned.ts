// Planned entries: a meal you mean to eat (say, ordering ahead at a
// restaurant). They don't count until you confirm you ate them. Pure.

import type { DiaryEntry } from "./diary-types.ts";
import { foodDay } from "./day.ts";
import { isPlanned } from "./entry-math.ts";

/** Ate it: logged now, on the food day `now` falls on. */
export function confirm(entry: DiaryEntry, now: Date, dayStart: string): DiaryEntry {
  return { ...entry, status: "logged", eatenAt: now.toISOString(), foodDay: foodDay(now, dayStart) };
}

/** The planned entries on one food day, in time order. */
export function plannedFor(entries: readonly DiaryEntry[], day: string): DiaryEntry[] {
  return entries
    .filter((e) => isPlanned(e) && e.foodDay === day)
    .sort((a, b) => (a.eatenAt < b.eatenAt ? -1 : a.eatenAt > b.eatenAt ? 1 : 0));
}
