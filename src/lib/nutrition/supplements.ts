// Supplement stack: the user's own list (goals.supplements) checked off each
// day as nutrition_logs. Pure, no app imports.

import type { Supplement } from "./goals.ts";
import type { NutritionLog } from "./hydration.ts";

const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Doses a day: one per time, or one when no time is set. */
export const dosesPerDay = (s: Supplement): number => Math.max(1, s.times.length);

/** Doses of `s` checked off on `day`. */
export function takenToday(s: Supplement, logs: readonly NutritionLog[], day: string): number {
  return logs.filter((l) => l.kind === "supplement" && l.ref === s.id && l.foodDay === day).reduce((n, l) => n + l.amount, 0);
}

/** Supplements with a dose due by `now` and not yet checked off today. */
export function dueNow(supplements: readonly Supplement[], logs: readonly NutritionLog[], day: string, now: Date): Supplement[] {
  const t = hm(now);
  return supplements.filter((s) => {
    const due = s.times.length ? s.times.filter((x) => x <= t).length : 1;
    return due > takenToday(s, logs, day);
  });
}

function addDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function allTaken(supplements: readonly Supplement[], logs: readonly NutritionLog[], day: string): boolean {
  return supplements.every((s) => takenToday(s, logs, day) >= dosesPerDay(s));
}

/**
 * Days in a row with every dose of every supplement taken, ending today (or
 * yesterday while today is still in progress). 0 with no supplements.
 */
export function supplementStreak(supplements: readonly Supplement[], logs: readonly NutritionLog[], today: string, maxDays = 366): number {
  if (!supplements.length) return 0;
  let day = allTaken(supplements, logs, today) ? today : addDay(today, -1);
  let n = 0;
  while (n < maxDays && allTaken(supplements, logs, day)) {
    n++;
    day = addDay(day, -1);
  }
  return n;
}
