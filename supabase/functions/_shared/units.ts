// Weight rounding shared by the Edge Functions. The database stores kg; plans
// are rounded to what you can actually load: 5 lb steps for imperial users,
// 2.5 kg steps for metric users.

export type UnitSystem = "metric" | "imperial";
export const LB_PER_KG = 2.2046226218;

export function roundLoadKg(kg: number, unit: UnitSystem): number {
  if (!(kg > 0)) return 0;
  if (unit === "imperial") {
    const lb = Math.round((kg * LB_PER_KG) / 5) * 5;
    return Math.round((lb / LB_PER_KG) * 1000) / 1000;
  }
  return Math.round(kg / 2.5) * 2.5;
}

export function formatKg(kg: number, unit: UnitSystem): string {
  return unit === "imperial" ? `${Math.round(kg * LB_PER_KG)} lb` : `${Math.round(kg * 10) / 10} kg`;
}
