// Usual meals: a meal you eat often, saved once and logged again in one tap.
// Ranked so the likely one is on top: one saved for a place you're at now,
// then "work" ones while you're on shift, then the ones you use most.
// Pure, no app imports.

import type { DiaryEntry, EntryStatus, MealSlot } from "./diary-types.ts";
import { copyNutrients, entryNutrients, toBase } from "./entry-math.ts";
import { distanceMeters } from "../gym-logic.ts";

/** An entry without its day, meal, time or id: what gets logged again. */
export type UsualItem = Omit<DiaryEntry, "id" | "foodDay" | "mealId" | "mealName" | "eatenAt" | "status">;

export interface Usual {
  id: string;
  name: string;
  /** A place name ("work", "Campus cafe"); its location, if any, stays on the phone. */
  place: string | null;
  mealId: string | null;
  items: UsualItem[];
  useCount: number;
  lastUsedAt: string | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}
export interface SavedPlace extends LatLng {
  name: string;
}

/** A place counts as "here" within this distance. */
export const NEARBY_METERS = 300;
/** Usuals with this place go first while you're on shift. */
export const WORK_PLACE = "work";

export function usualFromMeal(entries: readonly DiaryEntry[], name: string, place: string | null, id: string, mealId: string | null = null): Usual {
  const items: UsualItem[] = [...entries]
    .sort((a, b) => (a.eatenAt < b.eatenAt ? -1 : a.eatenAt > b.eatenAt ? 1 : 0))
    .map((e) => ({
      foodId: e.foodId,
      name: e.name,
      brand: e.brand,
      quantity: e.quantity,
      unit: e.unit,
      grams: e.grams,
      food: e.food ? { ...e.food, per100: copyNutrients(e.food.per100) } : null,
      nutrients: copyNutrients(e.nutrients),
      note: e.note,
    }));
  const p = place?.trim() ?? "";
  return { id, name: name.trim(), place: p === "" ? null : p, mealId, items, useCount: 0, lastUsedAt: null };
}

/**
 * The usual as new entries on `day` in `meal`. Fresh ids; totals worked out
 * again from each item's own food copy; stamped `now`, a millisecond apart.
 */
export function entriesFromUsual(
  usual: Usual,
  day: string,
  meal: Pick<MealSlot, "id" | "name">,
  now: Date,
  mkId: () => string,
  status: EntryStatus = "logged",
): DiaryEntry[] {
  return usual.items.map((it, i) => {
    let nutrients = copyNutrients(it.nutrients);
    let grams = it.grams;
    if (it.food && it.unit !== "quick") {
      const base = toBase(it.food, it.quantity, it.unit);
      if (base.ok) {
        grams = Math.round(base.base * 100) / 100;
        nutrients = entryNutrients(it.food.per100, base.base);
      }
    }
    return {
      ...it,
      id: mkId(),
      foodDay: day,
      mealId: meal.id,
      mealName: meal.name,
      eatenAt: new Date(now.getTime() + i).toISOString(),
      food: it.food ? { ...it.food, per100: copyNutrients(it.food.per100) } : null,
      grams,
      nutrients,
      status,
    };
  });
}

export function usedNow(usual: Usual, now: Date): Usual {
  return { ...usual, useCount: usual.useCount + 1, lastUsedAt: now.toISOString() };
}

const same = (a: string | null, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export interface RankContext {
  /** Where you are, only when you asked ("Use my location"). */
  here?: LatLng | null;
  places: readonly SavedPlace[];
  now: Date;
  onShift: boolean;
  /** Distance function; straight-line meters by default. */
  distance?: (a: LatLng, b: LatLng) => number;
}

/** Nearby place first, then work usuals on shift, then most used, then most recent, then name. */
export function rankUsuals<T extends Usual>(usuals: readonly T[], ctx: RankContext): T[] {
  const dist = ctx.distance ?? distanceMeters;
  const nearby = ctx.here
    ? ctx.places.filter((p) => dist(ctx.here as LatLng, p) <= NEARBY_METERS).map((p) => p.name)
    : [];
  const tier = (u: Usual) => {
    if (u.place && nearby.some((n) => same(u.place, n))) return 0;
    if (ctx.onShift && same(u.place, WORK_PLACE)) return 1;
    return 2;
  };
  return [...usuals].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      b.useCount - a.useCount ||
      (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") ||
      a.name.localeCompare(b.name),
  );
}

/** Is `now` inside one of these shifts? A shift whose end is before its start ends the next day. */
export function isOnShift(now: Date, shifts: readonly { date: string; start: string; end: string }[]): boolean {
  const at = (day: string, hm: string, plusDays = 0) => {
    const [y, m, d] = day.split("-").map(Number);
    const [h, min] = hm.split(":").map(Number);
    return new Date(y, m - 1, d + plusDays, h, min).getTime();
  };
  const t = now.getTime();
  return shifts.some((s) => {
    const start = at(s.date, s.start);
    const end = at(s.date, s.end, s.end <= s.start ? 1 : 0);
    return t >= start && t < end;
  });
}

type Row = Record<string, unknown>;

export function usualToRow(u: Usual): Row {
  return {
    id: u.id,
    name: u.name,
    place: u.place,
    meal_id: u.mealId,
    items: u.items,
    use_count: u.useCount,
    last_used_at: u.lastUsedAt,
  };
}

export function rowToUsual(row: Row): Usual {
  const n = typeof row.use_count === "number" ? row.use_count : Number(row.use_count);
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    place: typeof row.place === "string" ? row.place : null,
    mealId: typeof row.meal_id === "string" ? row.meal_id : null,
    items: Array.isArray(row.items) ? (row.items as UsualItem[]) : [],
    useCount: Number.isFinite(n) ? n : 0,
    lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
  };
}
