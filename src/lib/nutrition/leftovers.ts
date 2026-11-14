// Use-soon list (F35): batches and pantry items whose use-by date is near,
// soonest first, and the evening reminders for them. The reminder time is a
// product setting, not advice.

import { addDaysTo, type Batch } from "./batch.ts";
import type { PantryItem } from "./pantry.ts";

export const LEFTOVER_REMINDER_AT = "18:00";
export const MAX_LEFTOVER_REMINDERS = 20;

export interface UseSoonItem {
  kind: "batch" | "pantry";
  id: string;
  /** Batch name, or the pantry item's food id (the screen looks up the name). */
  label: string;
  useBy: string;
  past: boolean;
}

/** Open batches and pantry items with a use-by within `days` of today (or past it), soonest first. */
export function toUseSoon(batches: readonly Batch[], pantry: readonly PantryItem[], today: string, days: number): UseSoonItem[] {
  const limit = addDaysTo(today, days);
  const out: UseSoonItem[] = [];
  for (const b of batches) {
    if (b.finished || b.portionsLeft <= 0 || !b.useBy || b.useBy > limit) continue;
    out.push({ kind: "batch", id: b.id, label: b.name, useBy: b.useBy, past: b.useBy < today });
  }
  for (const p of pantry) {
    if (!p.useBy || p.useBy > limit || !(p.quantity > 0)) continue;
    out.push({ kind: "pantry", id: p.id, label: p.foodId, useBy: p.useBy, past: p.useBy < today });
  }
  return out.sort((a, b) => (a.useBy < b.useBy ? -1 : a.useBy > b.useBy ? 1 : a.kind === b.kind ? 0 : a.kind === "batch" ? -1 : 1));
}

function at(day: string, hm: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

/**
 * One reminder per use-by day, on the evening before it (the day itself when that
 * evening has passed), only in the future, at most MAX_LEFTOVER_REMINDERS.
 */
export function reminderTimes(items: readonly Pick<UseSoonItem, "useBy" | "label">[], now: Date, hm = LEFTOVER_REMINDER_AT): { at: Date; day: string; labels: string[] }[] {
  const byDay = new Map<string, string[]>();
  for (const i of items) byDay.set(i.useBy, [...(byDay.get(i.useBy) ?? []), i.label]);
  const out: { at: Date; day: string; labels: string[] }[] = [];
  for (const [day, labels] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let when = at(addDaysTo(day, -1), hm);
    if (when <= now) when = at(day, hm);
    if (when <= now) continue;
    out.push({ at: when, day, labels });
    if (out.length >= MAX_LEFTOVER_REMINDERS) break;
  }
  return out;
}
