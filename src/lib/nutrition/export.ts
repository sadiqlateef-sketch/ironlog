// Food log as spreadsheets (CSV) to share with a dietitian or doctor: one row
// per entry, or one row per day with totals. Planned entries are left out.
// Unknown values are blank, never zero. Pure, no app imports.

import { addDays } from "../shifts.ts";
import { dayTotals } from "./entry-math.ts";
import type { DiaryEntry } from "./diary-types.ts";
import type { NutrientKey } from "./nutrients.ts";

/** Most days one export covers. */
export const MAX_EXPORT_DAYS = 366;

const COLUMNS: { key: NutrientKey; label: string; scale: number }[] = [
  { key: "energy", label: "Energy (kcal)", scale: 1 },
  { key: "protein", label: "Protein (g)", scale: 1 },
  { key: "carbohydrates", label: "Carbs (g)", scale: 1 },
  { key: "fat", label: "Fat (g)", scale: 1 },
  { key: "fiber", label: "Fiber (g)", scale: 1 },
  { key: "sugars", label: "Sugars (g)", scale: 1 },
  { key: "sodium", label: "Sodium (mg)", scale: 1000 },
  { key: "caffeine", label: "Caffeine (mg)", scale: 1000 },
];

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: (string | number | null)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Every day from `from` to `to`, inclusive (empty when reversed; capped at MAX_EXPORT_DAYS). */
export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_EXPORT_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

function value(n: { value: number; state: string } | undefined, scale: number): number | null {
  if (!n || n.state === "incomplete") return null;
  return r1(n.value * scale);
}

const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** One row per logged entry in [from, to]. */
export function entriesCsv(entries: readonly DiaryEntry[], from: string, to: string): string {
  const header = ["Food day", "Time", "Meal", "Food", "Brand", "Amount", "Unit", "Weight (g or ml)", ...COLUMNS.map((c) => c.label), "Note"];
  const rows = entries
    .filter((e) => e.status !== "planned" && e.foodDay >= from && e.foodDay <= to)
    .sort((a, b) => a.foodDay.localeCompare(b.foodDay) || a.eatenAt.localeCompare(b.eatenAt))
    .map((e) => [
      e.foodDay,
      localTime(e.eatenAt),
      e.mealName,
      e.name,
      e.brand,
      e.unit === "quick" ? null : e.quantity,
      e.unit === "quick" ? "quick add" : e.unit,
      e.grams,
      ...COLUMNS.map((c) => value(e.nutrients[c.key], c.scale)),
      e.note,
    ]);
  return toCsv([header, ...rows]);
}

/** One row per food day in [from, to] that has a logged entry, with that day's totals. */
export function dayTotalsCsv(entries: readonly DiaryEntry[], from: string, to: string): string {
  const header = ["Food day", "Entries", ...COLUMNS.map((c) => c.label), "Some values unknown"];
  const byDay = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    if (e.status === "planned" || e.foodDay < from || e.foodDay > to) continue;
    const list = byDay.get(e.foodDay) ?? [];
    list.push(e);
    byDay.set(e.foodDay, list);
  }
  const rows = [...byDay.keys()].sort().map((day) => {
    const list = byDay.get(day) as DiaryEntry[];
    const t = dayTotals(list);
    const partial = COLUMNS.some((c) => t[c.key]?.state === "incomplete");
    // Day totals keep the known part of an incomplete total, flagged in the last column.
    return [day, list.length, ...COLUMNS.map((c) => (t[c.key] ? r1(t[c.key].value * c.scale) : null)), partial ? "yes" : ""];
  });
  return toCsv([header, ...rows]);
}
