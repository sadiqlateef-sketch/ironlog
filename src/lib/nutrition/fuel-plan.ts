// A fuel plan around the work roster: when to eat, not how much. On a shift
// day the anchors are before the shift, mid-shift and after it; on an off day
// they are the user's own meal slots. Times only, never amounts. The offsets
// are app defaults the user can change per anchor, not advice.
// Pure, no app imports.

import type { Shift } from "../shifts.ts";
import { isAllDay } from "./day.ts";
import type { MealSlot } from "./diary-types.ts";
import { crossesMidnight } from "./shift-day.ts";

/** Default minutes before a shift starts for the "before" anchor (a setting, not advice). */
export const BEFORE_SHIFT_MIN = 90;
/** Default minutes after a shift ends for the "after" anchor (a setting, not advice). */
export const AFTER_SHIFT_MIN = 30;
export const NO_SHIFTS_TEXT = "Add your shifts to plan around them";

export interface FuelAnchor {
  id: "before" | "mid" | "after" | string;
  label: string;
  /** Local time of the anchor (may be the next morning after a night shift). */
  at: Date;
}

export interface FuelPlan {
  shift: Shift | null;
  anchors: FuelAnchor[];
  /** Shown when the user has no shifts at all. */
  note: string | null;
}

function at(day: string, hm: string, plusDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, d + plusDays, h, mi);
}

const plusMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

export function fuelPlan(
  date: string,
  shifts: readonly Shift[],
  meals: readonly MealSlot[],
  opts: { beforeMin?: number; afterMin?: number } = {},
): FuelPlan {
  const shift = shifts.find((s) => s.date === date) ?? null;
  if (!shift) {
    const anchors = [...meals]
      .filter((m) => !isAllDay(m))
      .sort((a, b) => a.rank - b.rank)
      .map((m) => ({ id: m.id, label: m.name, at: at(date, m.start) }));
    return { shift: null, anchors, note: shifts.length === 0 ? NO_SHIFTS_TEXT : null };
  }
  const start = at(date, shift.start);
  const end = at(date, shift.end, crossesMidnight(shift) ? 1 : 0);
  return {
    shift,
    note: null,
    anchors: [
      { id: "before", label: "Before your shift", at: plusMin(start, -(opts.beforeMin ?? BEFORE_SHIFT_MIN)) },
      { id: "mid", label: "Mid-shift", at: new Date((start.getTime() + end.getTime()) / 2) },
      { id: "after", label: "After your shift", at: plusMin(end, opts.afterMin ?? AFTER_SHIFT_MIN) },
    ],
  };
}

/** The anchor with the user's own time ("HH:MM") applied, keeping its day (and the next morning for late anchors). */
export function withTime(anchor: FuelAnchor, hm: string | undefined): FuelAnchor {
  if (!hm || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hm)) return anchor;
  const a = anchor.at;
  const day = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-${String(a.getDate()).padStart(2, "0")}`;
  return { ...anchor, at: at(day, hm) };
}


/** Pre-lift window: how far back carbs are summed before a planned session (display window, not advice). */
export const PRE_LIFT_HOURS = 3;

/** g of carbohydrate logged in the `hours` before `now` (planned entries don't count). Incomplete when any entry lacks it. */
export function carbsInLast(
  entries: readonly { eatenAt: string; status?: string; nutrients: { carbohydrates?: { value: number; state: string } } }[],
  now: Date,
  hours = PRE_LIFT_HOURS,
): { grams: number; incomplete: boolean; count: number } {
  const from = now.getTime() - hours * 3_600_000;
  let grams = 0;
  let incomplete = false;
  let count = 0;
  for (const e of entries) {
    if (e.status === "planned") continue;
    const t = new Date(e.eatenAt).getTime();
    if (t < from || t > now.getTime()) continue;
    count++;
    const c = e.nutrients.carbohydrates;
    if (!c || c.state === "incomplete") incomplete = true;
    grams += c?.value ?? 0;
  }
  return { grams: Math.round(grams), incomplete, count };
}
