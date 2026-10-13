// The database stores every weight in kilograms. Convert only at the edges (UI).
export const LB_PER_KG = 2.2046226218;

export type UnitSystem = "metric" | "imperial";

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** Display a stored kg value in the user's unit, rounded to the nearest 0.5. */
export function formatWeight(kg: number, unit: UnitSystem): string {
  const value = unit === "imperial" ? kgToLb(kg) : kg;
  const rounded = Math.round(value * 2) / 2;
  return `${rounded} ${unit === "imperial" ? "lb" : "kg"}`;
}

/** Convert what the user typed into kg for saving. */
export function toKg(value: number, unit: UnitSystem): number {
  return unit === "imperial" ? lbToKg(value) : value;
}
