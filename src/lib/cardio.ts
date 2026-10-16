// Timed and cardio sets: typing times like "1:30", distances in your unit,
// and pace. Distances are stored in metres, times in seconds.

import type { UnitSystem } from "./units.ts";

const M_PER_MI = 1609.344;

/** "90", "1:30" or "1:02:30" -> seconds. Blank or nonsense -> null. */
export function parseDuration(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return null;
  return s.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** 90 -> "1:30", 3750 -> "1:02:30". */
export function formatDuration(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export const distanceUnit = (unit: UnitSystem) => (unit === "imperial" ? "mi" : "km");

/** Metres -> the number shown in miles or km (2 decimals at most). */
export function toDistanceDisplay(m: number, unit: UnitSystem): string {
  if (!m) return "";
  const v = m / (unit === "imperial" ? M_PER_MI : 1000);
  return String(Math.round(v * 100) / 100);
}

/** Miles or km as typed -> metres. */
export function toMetres(value: number, unit: UnitSystem): number {
  return Math.round(value * (unit === "imperial" ? M_PER_MI : 1000) * 100) / 100;
}

/** "8:03 /mi" or "5:00 /km", or null without both numbers. */
export function pace(seconds: number | null, metres: number | null, unit: UnitSystem): string | null {
  if (!seconds || !metres) return null;
  const per = seconds / (metres / (unit === "imperial" ? M_PER_MI : 1000));
  return `${formatDuration(per)} /${distanceUnit(unit)}`;
}

/** One set as text: "3.1 mi in 25:00 (8:03 /mi)", "1:00", "1:00 +25 lb". Null for a weight x reps set. */
export function describeTimedSet(
  s: { weight: number; duration_seconds: number | null; distance_m: number | null },
  unit: UnitSystem,
  weightText: (kg: number) => string,
): string | null {
  if (s.duration_seconds == null && s.distance_m == null) return null;
  const time = s.duration_seconds ? formatDuration(s.duration_seconds) : null;
  if (s.distance_m) {
    const p = pace(s.duration_seconds, s.distance_m, unit);
    return `${toDistanceDisplay(s.distance_m, unit)} ${distanceUnit(unit)}${time ? ` in ${time}` : ""}${p ? ` (${p})` : ""}`;
  }
  return `${time ?? "0:00"}${s.weight > 0 ? ` +${weightText(s.weight)}` : ""}`;
}
