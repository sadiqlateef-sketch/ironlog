// Protein per dollar (F9): grams of protein for one unit of the price you
// typed in. Only with your own price and a complete protein value; never guessed.

import type { Food } from "./diary-types.ts";

export type PricedFood = Pick<Food, "nutrients" | "priceCents" | "priceAmount">;

/** Grams of protein per 1.00 of currency, or null without a price or a known protein value. */
export function proteinPerDollar(food: PricedFood): number | null {
  const cents = food.priceCents ?? null;
  const amount = food.priceAmount ?? null;
  const p = food.nutrients.protein;
  if (cents === null || amount === null || !(cents > 0) || !(amount > 0)) return null;
  if (p.state !== "complete" || !(p.value >= 0)) return null;
  const grams = (p.value * amount) / 100;
  return Math.round((grams / (cents / 100)) * 10) / 10;
}

/** Foods with a value, most protein per dollar first; foods without one are left out. */
export function rankByValue<T extends PricedFood>(foods: readonly T[]): { food: T; perDollar: number }[] {
  return foods
    .map((food, i) => ({ food, perDollar: proteinPerDollar(food), i }))
    .filter((x): x is { food: T; perDollar: number; i: number } => x.perDollar !== null)
    .sort((a, b) => b.perDollar - a.perDollar || a.i - b.i)
    .map(({ food, perDollar }) => ({ food, perDollar }));
}

/** "12.5 g protein per $1" style text, currency symbol left to the caller. */
export function valueText(perDollar: number, symbol = "$"): string {
  return `${perDollar} g protein per ${symbol}1`;
}

/** Cents from a typed price ("3.49", "3,49"), or null/NaN as in the food forms. */
export function parsePriceCents(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN;
}
