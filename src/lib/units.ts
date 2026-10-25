// The database stores every weight in kilograms. Convert only at the edges (UI).
export const LB_PER_KG = 2.2046226218;

export type UnitSystem = "metric" | "imperial";

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** Display a stored kg value in the user's unit, rounded to the nearest 0.5, with thousands separators. */
export function formatWeight(kg: number, unit: UnitSystem): string {
  const value = unit === "imperial" ? kgToLb(kg) : kg;
  const rounded = Math.round(value * 2) / 2;
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit === "imperial" ? "lb" : "kg"}`;
}

/**
 * A stored kg value as an editable number in the user's unit: nearest 0.5 lb,
 * or nearest 0.25 kg so 1.25 kg change plates survive. No separators (it goes
 * back through parseNumber), and "" for zero.
 */
export function weightInput(kg: number, unit: UnitSystem): string {
  if (!kg) return "";
  if (unit === "imperial") return String(Math.round(kgToLb(kg) * 2) / 2);
  return String(Math.round(kg * 4) / 4);
}

/** Convert what the user typed into kg for saving. */
export function toKg(value: number, unit: UnitSystem): number {
  return unit === "imperial" ? lbToKg(value) : value;
}
