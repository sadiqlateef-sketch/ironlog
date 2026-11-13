// Water and supplement check-offs (nutrition_logs), and the day's water total.
// A glass of water is a log, not a food: it never changes the day's nutrients.
// Drinks logged as food (liquid foods, in ml) count toward water only when the
// user turns that on. Pure, no app imports.

import type { DiaryEntry } from "./diary-types.ts";

export type LogKind = "water" | "supplement";

export interface NutritionLog {
  id: string;
  kind: LogKind;
  foodDay: string;
  /** ml of water, or doses of a supplement. */
  amount: number;
  /** The supplement's id (goals.supplements); null for water. */
  ref: string | null;
  loggedAt: string;
}

type Row = Record<string, unknown>;

export function logToRow(l: NutritionLog): Row {
  return { id: l.id, kind: l.kind, food_day: l.foodDay, amount: l.amount, ref: l.ref, logged_at: l.loggedAt };
}

export function rowToLog(row: Row): NutritionLog {
  const n = typeof row.amount === "number" ? row.amount : Number(row.amount);
  return {
    id: String(row.id),
    kind: row.kind === "supplement" ? "supplement" : "water",
    foodDay: String(row.food_day ?? ""),
    amount: Number.isFinite(n) ? n : 0,
    ref: typeof row.ref === "string" ? row.ref : null,
    loggedAt: typeof row.logged_at === "string" ? row.logged_at : "",
  };
}

/** Quick-add sizes on the water card (ml). App choices, not advice. */
export const WATER_STEPS = [250, 500] as const;

/** ml of water on a food day: water logs, plus liquid foods when `countDrinks` is on. */
export function waterMl(
  logs: readonly NutritionLog[],
  entries: readonly Pick<DiaryEntry, "foodDay" | "grams" | "food" | "status" | "unit">[],
  day: string,
  countDrinks: boolean,
): number {
  let ml = 0;
  for (const l of logs) if (l.kind === "water" && l.foodDay === day) ml += l.amount;
  if (countDrinks) {
    for (const e of entries) {
      if (e.foodDay !== day || e.status === "planned" || e.unit === "quick") continue;
      if (e.food?.liquid && e.grams) ml += e.grams;
    }
  }
  return Math.round(ml);
}
