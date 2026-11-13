// The pantry: foods you have at home, how much, where, and until when.
// Eating some takes it off. Pure, no app imports.

import type { EntryUnit, Food } from "./diary-types.ts";
import { toBase } from "./entry-math.ts";
import { addDaysTo } from "./batch.ts";

export type PantryUnit = "g" | "ml" | "serving" | "package";
export type PantryLocation = "fridge" | "freezer" | "cupboard";
export const PANTRY_LOCATIONS: readonly PantryLocation[] = ["fridge", "freezer", "cupboard"];
export const LOCATION_LABEL: Record<PantryLocation, string> = { fridge: "Fridge", freezer: "Freezer", cupboard: "Cupboard" };

export interface PantryItem {
  id: string;
  foodId: string;
  quantity: number;
  unit: PantryUnit;
  location: PantryLocation;
  addedOn: string;
  openedOn: string | null;
  useBy: string | null;
  note: string | null;
}

type UnitSource = Pick<Food, "liquid" | "servingAmount" | "packageAmount">;

/** Units an item of this food can be counted in. */
export function pantryUnits(food: UnitSource): PantryUnit[] {
  const out: PantryUnit[] = [food.liquid ? "ml" : "g"];
  if (food.servingAmount !== null && food.servingAmount > 0) out.push("serving");
  if (food.packageAmount !== null && food.packageAmount > 0) out.push("package");
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type DecrementResult = { item: PantryItem; ok: true } | { item: PantryItem; ok: false; reason: string };

/**
 * Take `quantity` `unit` of the food off the item. The amounts are compared in
 * grams (ml). An amount that can't be compared leaves the item as it was.
 */
export function decrement(item: PantryItem, quantity: number, unit: EntryUnit, food: UnitSource): DecrementResult {
  const eaten = toBase(food, quantity, unit);
  const one = toBase(food, 1, item.unit);
  if (!eaten.ok || !one.ok) return { item, ok: false, reason: "That amount can't be taken off this pantry item." };
  const have = item.quantity * one.base;
  const left = Math.max(0, have - eaten.base);
  return { item: { ...item, quantity: round2(left / one.base) }, ok: true };
}

/** Items with a use-by date within `days` of today (or past it), soonest first. */
export function expiringSoon<T extends Pick<PantryItem, "useBy">>(items: readonly T[], today: string, days: number): T[] {
  const limit = addDaysTo(today, days);
  return items
    .filter((i) => i.useBy !== null && i.useBy <= limit)
    .sort((a, b) => ((a.useBy as string) < (b.useBy as string) ? -1 : (a.useBy as string) > (b.useBy as string) ? 1 : 0));
}

/** Fridge, freezer, cupboard; within a place the soonest use-by first (none last), then oldest added. */
export function sortPantry<T extends Pick<PantryItem, "location" | "useBy" | "addedOn">>(items: readonly T[]): T[] {
  const place = (l: PantryLocation) => PANTRY_LOCATIONS.indexOf(l);
  return [...items].sort((a, b) => {
    if (a.location !== b.location) return place(a.location) - place(b.location);
    const ua = a.useBy ?? "9999-12-31";
    const ub = b.useBy ?? "9999-12-31";
    if (ua !== ub) return ua < ub ? -1 : 1;
    return a.addedOn < b.addedOn ? -1 : a.addedOn > b.addedOn ? 1 : 0;
  });
}

type Row = Record<string, unknown>;

export function pantryToRow(p: PantryItem): Row {
  return {
    id: p.id,
    food_id: p.foodId,
    quantity: p.quantity,
    unit: p.unit,
    location: p.location,
    added_on: p.addedOn,
    opened_on: p.openedOn,
    use_by: p.useBy,
    note: p.note,
  };
}

export function rowToPantry(row: Row): PantryItem {
  const q = typeof row.quantity === "number" ? row.quantity : Number(row.quantity);
  return {
    id: String(row.id),
    foodId: String(row.food_id),
    quantity: Number.isFinite(q) ? q : 0,
    unit: (["g", "ml", "serving", "package"].includes(String(row.unit)) ? row.unit : "g") as PantryUnit,
    location: (PANTRY_LOCATIONS.includes(row.location as PantryLocation) ? row.location : "cupboard") as PantryLocation,
    addedOn: String(row.added_on),
    openedOn: typeof row.opened_on === "string" ? row.opened_on : null,
    useBy: typeof row.use_by === "string" ? row.use_by : null,
    note: typeof row.note === "string" ? row.note : null,
  };
}
