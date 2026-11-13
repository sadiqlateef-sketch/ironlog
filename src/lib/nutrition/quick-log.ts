// Shortcuts for logging what you log often: copy a meal from yesterday, log a
// recent food again at its last amount, and remember the last few scans.
// Pure, no app imports.

import { sameBarcode } from "./barcode.ts";
import type { DiaryEntry, EntryUnit, Food, MealSlot } from "./diary-types.ts";
import { allowedUnits, copyNutrients, makeEntry } from "./entry-math.ts";

/**
 * Yesterday's entries for one meal, as new entries on `day` in `meal`. Amounts
 * and nutrients are kept exactly (they come from each entry's own snapshot);
 * each copy gets a new id and is stamped `now`, a millisecond apart so the
 * order stays the same.
 */
export function copyMealEntries(
  from: readonly DiaryEntry[],
  mealId: string,
  day: string,
  meal: Pick<MealSlot, "id" | "name">,
  now: Date,
  newId: () => string,
): DiaryEntry[] {
  const source = from
    .filter((e) => e.mealId === mealId)
    .sort((a, b) => (a.eatenAt < b.eatenAt ? -1 : a.eatenAt > b.eatenAt ? 1 : 0));
  return source.map((e, i) => ({
    ...e,
    id: newId(),
    foodDay: day,
    mealId: meal.id,
    mealName: meal.name,
    eatenAt: new Date(now.getTime() + i).toISOString(),
    food: e.food ? { ...e.food, per100: copyNutrients(e.food.per100) } : null,
    nutrients: copyNutrients(e.nutrients),
  }));
}

/** "Copy yesterday's Breakfast". */
export function copyMealLabel(mealName: string): string {
  return `Copy yesterday's ${mealName}`;
}

/** What the toast says after a copy. */
export function copiedText(count: number, mealName: string): string {
  if (count === 0) return `Nothing in ${mealName} yesterday`;
  return `Copied ${count} ${count === 1 ? "food" : "foods"} to ${mealName}`;
}

/**
 * Log a food again at the amount used last time. Null when that amount no
 * longer fits the food (say the serving size was removed), so the caller opens
 * the amount sheet instead.
 */
export function relogEntry(
  food: Food,
  last: { quantity: number; unit: EntryUnit },
  day: string,
  meal: Pick<MealSlot, "id" | "name">,
  now: Date,
  id: string,
): DiaryEntry | null {
  if (!(last.quantity > 0) || !allowedUnits(food).includes(last.unit)) return null;
  try {
    return makeEntry({ food, quantity: last.quantity, unit: last.unit, foodDay: day, meal, now, id });
  } catch {
    return null;
  }
}

export interface RecentScan {
  code: string;
  name: string;
}

export const MAX_RECENT_SCANS = 5;

/** Newest first, one per product (EAN-13 and UPC-A of the same code count once), at most five. */
export function pushRecentScan(list: readonly RecentScan[], scan: RecentScan, max = MAX_RECENT_SCANS): RecentScan[] {
  const rest = list.filter((s) => !sameBarcode(s.code, scan.code));
  return [scan, ...rest].slice(0, max);
}
