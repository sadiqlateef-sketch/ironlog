// Capture inbox: snap a meal (or jot a note) now, log it properly later.
// The food day and meal come from when it was captured, not when it is logged.
// Photos stay on this phone: never synced, never in a backup.

import { defaultMealFor, foodDayFor } from "./day.ts";
import type { NutritionPrefs } from "./diary-types.ts";
import type { Shift } from "../shifts.ts";

export interface InboxItem {
  id: string;
  /** ISO time of the capture. */
  takenAt: string;
  foodDay: string;
  mealId: string | null;
  note: string | null;
  /** Where the photo is kept on this phone ("inbox/<id>.jpg" in app data, or "kv:<id>" in a browser), or null. */
  photoPath: string | null;
}

export const INBOX_DIR = "inbox";
export const MAX_INBOX = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function makeInboxItem(input: {
  id: string;
  takenAt: Date;
  prefs: Pick<NutritionPrefs, "day_start" | "follow_shifts" | "post_night_start" | "meals">;
  shifts: readonly Shift[];
  note?: string | null;
  photoPath?: string | null;
}): InboxItem {
  const { id, takenAt, prefs, shifts } = input;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;
  return {
    id,
    takenAt: takenAt.toISOString(),
    foodDay: foodDayFor(takenAt, prefs, shifts),
    mealId: defaultMealFor(prefs.meals, takenAt)?.id ?? null,
    note,
    photoPath: input.photoPath ?? null,
  };
}

/** Saved items that still make sense, oldest first. Anything malformed is dropped. */
export function normalizeInbox(raw: unknown): InboxItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InboxItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    if (typeof x.id !== "string" || !x.id) continue;
    if (typeof x.takenAt !== "string" || Number.isNaN(Date.parse(x.takenAt))) continue;
    if (typeof x.foodDay !== "string" || !DAY.test(x.foodDay)) continue;
    out.push({
      id: x.id,
      takenAt: x.takenAt,
      foodDay: x.foodDay,
      mealId: typeof x.mealId === "string" ? x.mealId : null,
      note: typeof x.note === "string" && x.note ? x.note : null,
      photoPath: typeof x.photoPath === "string" && x.photoPath ? x.photoPath : null,
    });
  }
  out.sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  return out.slice(-MAX_INBOX);
}

export const photoFileFor = (id: string): string => `${INBOX_DIR}/${id}.jpg`;

/** Photo files in the inbox folder that no item points to any more (left by a sign-out or a crash). */
export function orphanPhotos(items: readonly InboxItem[], files: readonly string[]): string[] {
  const kept = new Set(items.map((i) => i.photoPath).filter((p): p is string => p !== null));
  return files.map((f) => (f.includes("/") ? f : `${INBOX_DIR}/${f}`)).filter((f) => f.endsWith(".jpg") && !kept.has(f));
}

/** Where "Log it" goes: the add-food screen on the capture's day and meal. */
export function inboxAddHref(item: Pick<InboxItem, "id" | "foodDay" | "mealId">): string {
  const meal = item.mealId ? `&meal=${encodeURIComponent(item.mealId)}` : "";
  return `/food/add/?d=${item.foodDay}${meal}&inbox=${encodeURIComponent(item.id)}`;
}
