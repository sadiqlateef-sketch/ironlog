// Shapes for the food diary: the phone-side (camelCase) view of the `foods` and
// `food_entries` rows, plus converters in both directions. No app imports beyond
// types, so it can be unit tested.

import type { Tables } from "../../types/database.ts";
import type { Nutrients } from "./nutrients.ts";

export type EntryUnit = "g" | "ml" | "oz" | "fl_oz" | "serving" | "package" | "quick";
export type FoodSource = "user" | "off" | "usda" | "staple" | "recipe";
/** "planned": meant to be eaten, not counted until confirmed. */
export type EntryStatus = "logged" | "planned";

/** A meal slot with a time window ("HH:MM"). start == end means all day. */
export interface MealSlot {
  id: string;
  name: string;
  start: string;
  end: string;
  rank: number;
}

export interface NutritionPrefs {
  /** "HH:MM" the food day starts at; "00:00" is a plain calendar day. */
  day_start: string;
  meals: MealSlot[];
  staples_version: number;
  /** Shift-driven food day: the morning after a night shift counts for the shift's day. Off unless set. */
  follow_shifts?: boolean;
  /** "HH:MM" on the day after a night shift when the new food day starts (with follow_shifts). */
  post_night_start?: string;
}

/** A food in the user's library. Nutrients are per 100 g, or per 100 ml when liquid. */
export interface Food {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  liquid: boolean;
  /** One serving, in g (ml when liquid). */
  servingAmount: number | null;
  /** A whole package, in g (ml when liquid). */
  packageAmount: number | null;
  nutrients: Nutrients;
  source: FoodSource;
  sourceId: string | null;
  sourceUrl: string | null;
  note: string | null;
  archived: boolean;
  /** What the food cost, in cents, for `priceAmount` g (ml). Optional; absent means unknown. */
  priceCents?: number | null;
  priceAmount?: number | null;
}

/** What an entry remembers about its food, so later edits never rewrite history. */
export interface FoodSnapshot {
  liquid: boolean;
  servingAmount: number | null;
  packageAmount: number | null;
  source: FoodSource;
  sourceUrl: string | null;
  per100: Nutrients;
}

export interface DiaryEntry {
  id: string;
  foodDay: string;
  mealId: string;
  mealName: string;
  eatenAt: string;
  foodId: string | null;
  name: string;
  brand: string | null;
  quantity: number;
  unit: EntryUnit;
  /** Resolved grams (ml for liquids); null for quick entries. */
  grams: number | null;
  food: FoodSnapshot | null;
  /** Totals for this entry. */
  nutrients: Nutrients;
  note: string | null;
  /** Absent means "logged" (entries saved before planning existed). */
  status?: EntryStatus;
}

type FoodRow = Tables<"foods">;
type EntryRow = Tables<"food_entries">;

/** Row shapes sent to the server (no user_id, no timestamps). */
export type FoodWriteRow = Omit<FoodRow, "user_id" | "created_at" | "updated_at">;
export type EntryWriteRow = Omit<EntryRow, "user_id" | "created_at" | "updated_at">;

/** Postgres numeric can arrive as a string; accept both. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function snapshotFromJson(raw: unknown): FoodSnapshot | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    liquid: r.liquid === true,
    servingAmount: num(r.serving_amount),
    packageAmount: num(r.package_amount),
    source: (r.source as FoodSource) ?? "user",
    sourceUrl: typeof r.source_url === "string" ? r.source_url : null,
    per100: r.per100 as Nutrients,
  };
}

export function rowToFood(row: FoodRow): Food {
  const priceCents = num(row.price_cents);
  const priceAmount = num(row.price_amount);
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    liquid: row.liquid,
    servingAmount: num(row.serving_amount),
    packageAmount: num(row.package_amount),
    nutrients: row.nutrients as unknown as Nutrients,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    note: row.note,
    archived: row.archived,
    // Only foods with a price carry the keys (rows from before prices existed have none).
    ...(priceCents !== null || priceAmount !== null ? { priceCents, priceAmount } : {}),
  };
}

export function foodToRow(food: Food): FoodWriteRow {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    liquid: food.liquid,
    serving_amount: food.servingAmount,
    package_amount: food.packageAmount,
    nutrients: food.nutrients as unknown as FoodRow["nutrients"],
    source: food.source,
    source_id: food.sourceId,
    source_url: food.sourceUrl,
    note: food.note,
    archived: food.archived,
    price_cents: food.priceCents ?? null,
    price_amount: food.priceAmount ?? null,
  };
}

export function rowToEntry(row: EntryRow): DiaryEntry {
  return {
    id: row.id,
    foodDay: row.food_day,
    mealId: row.meal_id,
    mealName: row.meal_name,
    eatenAt: row.eaten_at,
    foodId: row.food_id,
    name: row.name,
    brand: row.brand,
    quantity: num(row.quantity) ?? 0,
    unit: row.unit,
    grams: num(row.grams),
    food: snapshotFromJson(row.food),
    nutrients: row.nutrients as unknown as Nutrients,
    note: row.note,
    status: row.status === "planned" ? "planned" : "logged",
  };
}

export function entryToRow(entry: DiaryEntry): EntryWriteRow {
  const s = entry.food;
  return {
    id: entry.id,
    food_day: entry.foodDay,
    meal_id: entry.mealId,
    meal_name: entry.mealName,
    eaten_at: entry.eatenAt,
    food_id: entry.foodId,
    name: entry.name,
    brand: entry.brand,
    quantity: entry.quantity,
    unit: entry.unit,
    grams: entry.grams,
    food: s
      ? ({
          liquid: s.liquid,
          serving_amount: s.servingAmount,
          package_amount: s.packageAmount,
          source: s.source,
          source_url: s.sourceUrl,
          per100: s.per100,
        } as unknown as EntryRow["food"])
      : null,
    nutrients: entry.nutrients as unknown as EntryRow["nutrients"],
    note: entry.note,
    status: entry.status ?? "logged",
  };
}
