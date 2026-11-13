// The food day and meal slots. A "food day" starts at the user's own time
// (default midnight), so a 3 a.m. snack after a night shift still counts for the
// day you are in. Pure, no app imports beyond the date helpers.

import { addDays, dayKey } from "../shifts.ts";
import type { Shift } from "../shifts.ts";
import type { MealSlot, NutritionPrefs } from "./diary-types.ts";
import { DEFAULT_POST_NIGHT_START, postNightFoodDay } from "./shift-day.ts";

export const shiftDay = addDays;

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for a strict "HH:MM", else null. */
export function parseHm(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = HM.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function normalizeDayStart(s: unknown): string {
  return parseHm(s) === null ? "00:00" : (s as string);
}

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** The food day (YYYY-MM-DD) that `now` belongs to. */
export function foodDay(now: Date, dayStart: string): string {
  const key = dayKey(now);
  const start = parseHm(normalizeDayStart(dayStart)) ?? 0;
  return minutesOf(now) < start ? addDays(key, -1) : key;
}

/**
 * The food day for `now` under the user's settings: with "follow my shifts" on,
 * the morning after a night shift stays on the shift's day until
 * `post_night_start`; otherwise (and on every other day) the day-start rule.
 */
export function foodDayFor(
  now: Date,
  prefs: Pick<NutritionPrefs, "day_start" | "follow_shifts" | "post_night_start">,
  shifts: readonly Shift[],
): string {
  const plain = foodDay(now, prefs.day_start);
  if (!prefs.follow_shifts) return plain;
  const night = postNightFoodDay(now, shifts, prefs.post_night_start ?? DEFAULT_POST_NIGHT_START);
  return night !== null && night < plain ? night : plain;
}

export function isFoodDayToday(day: string, now: Date, dayStart: string): boolean {
  return day === foodDay(now, dayStart);
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ---- meal slots ------------------------------------------------------------

export function isAllDay(slot: MealSlot): boolean {
  return slot.start === slot.end;
}

/** Does the slot's window contain this minute of the day? */
export function mealContains(slot: MealSlot, minutes: number): boolean {
  const start = parseHm(slot.start);
  const end = parseHm(slot.end);
  if (start === null || end === null) return false;
  if (start === end) return true;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function byRank(a: MealSlot, b: MealSlot): number {
  return a.rank - b.rank;
}

/** By rank; on today's view (pass `now`) the slots happening now come first and all-day slots last. */
export function orderMeals(meals: readonly MealSlot[], now: Date | null): MealSlot[] {
  const ranked = [...meals].sort(byRank);
  if (now === null) return ranked;
  const m = minutesOf(now);
  const current = ranked.filter((s) => !isAllDay(s) && mealContains(s, m));
  const others = ranked.filter((s) => !current.includes(s));
  return [...current, ...others.filter((s) => !isAllDay(s)), ...others.filter(isAllDay)];
}

/** The slot a new entry should land in right now. */
export function defaultMealFor(meals: readonly MealSlot[], now: Date): MealSlot | null {
  const ranked = [...meals].sort(byRank);
  const m = minutesOf(now);
  return (
    ranked.find((s) => !isAllDay(s) && mealContains(s, m)) ??
    ranked.find(isAllDay) ??
    ranked[0] ??
    null
  );
}

export const MAX_MEALS = 12;

export const DEFAULT_MEALS: readonly MealSlot[] = [
  { id: "meal-breakfast", name: "Breakfast", start: "06:00", end: "10:00", rank: 1 },
  { id: "meal-lunch", name: "Lunch", start: "10:00", end: "15:00", rank: 2 },
  { id: "meal-dinner", name: "Dinner", start: "15:00", end: "21:00", rank: 3 },
  { id: "meal-snacks", name: "Snacks", start: "00:00", end: "00:00", rank: 4 },
];

export const DEFAULT_PREFS: Readonly<NutritionPrefs> = {
  day_start: "00:00",
  meals: DEFAULT_MEALS as MealSlot[],
  staples_version: 0,
  follow_shifts: false,
  post_night_start: DEFAULT_POST_NIGHT_START,
};

function defaultMealsCopy(): MealSlot[] {
  return DEFAULT_MEALS.map((m) => ({ ...m }));
}

/** Accept anything the server or an old phone copy might hold and return valid prefs. */
export function normalizePrefs(raw: unknown): NutritionPrefs {
  const r = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const meals: MealSlot[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.meals)) {
    for (const item of r.meals) {
      if (item === null || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id.trim().slice(0, 40) : "";
      const name = typeof s.name === "string" ? s.name.trim().slice(0, 60) : "";
      if (!id || !name || seen.has(id)) continue;
      if (parseHm(s.start) === null || parseHm(s.end) === null) continue;
      seen.add(id);
      meals.push({ id, name, start: s.start as string, end: s.end as string, rank: 0 });
      if (meals.length >= MAX_MEALS) break;
    }
  }
  const final = meals.length > 0 ? meals : defaultMealsCopy();
  final.forEach((m, i) => { m.rank = i + 1; });
  const sv = r.staples_version;
  return {
    day_start: normalizeDayStart(r.day_start),
    meals: final,
    staples_version: typeof sv === "number" && Number.isInteger(sv) && sv >= 0 ? sv : 0,
    follow_shifts: r.follow_shifts === true,
    post_night_start: parseHm(r.post_night_start) === null ? DEFAULT_POST_NIGHT_START : (r.post_night_start as string),
  };
}

/** Message for the meal editor, or null when the list can be saved. */
export function validateMeals(meals: readonly MealSlot[]): string | null {
  if (meals.length < 1) return "Keep at least one meal.";
  if (meals.length > MAX_MEALS) return `Use at most ${MAX_MEALS} meals.`;
  const names = new Set<string>();
  for (const m of meals) {
    const name = m.name.trim();
    if (!name) return "Every meal needs a name.";
    if (name.length > 60) return "Meal names can be up to 60 characters.";
    if (parseHm(m.start) === null || parseHm(m.end) === null) return `"${name}" needs a start and end time.`;
    const lower = name.toLowerCase();
    if (names.has(lower)) return `"${name}" is used twice.`;
    names.add(lower);
  }
  return null;
}
