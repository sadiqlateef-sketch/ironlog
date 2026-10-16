// Every finished set as a spreadsheet (CSV), in the lifter's units.

import type { UnitSystem } from "./units.ts";
import { kgToLb } from "./units.ts";
import { toDistanceDisplay } from "./cardio.ts";

export interface ExportSet {
  start_time: string;
  workout: string | null;
  exercise: string;
  set_number: number;
  set_type: string;
  weight: number;
  reps: number;
  rpe: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  notes: string | null;
}

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Local date as YYYY-MM-DD (what spreadsheets sort and parse best). */
function localDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toCsv(sets: ExportSet[], unit: UnitSystem): string {
  const w = unit === "imperial" ? "lb" : "kg";
  const dist = unit === "imperial" ? "mi" : "km";
  const header = ["Date", "Workout", "Exercise", "Set", "Type", `Weight (${w})`, "Reps", "RPE", "Time (seconds)", `Distance (${dist})`, "Notes"];
  const rows = sets.map((s) => [
    localDate(s.start_time),
    s.workout ?? "Workout",
    s.exercise,
    s.set_number,
    s.set_type,
    s.weight ? Math.round((unit === "imperial" ? kgToLb(s.weight) : s.weight) * 100) / 100 : s.duration_seconds != null || s.distance_m != null ? "" : 0,
    s.duration_seconds != null || s.distance_m != null ? (s.reps || "") : s.reps,
    s.rpe,
    s.duration_seconds,
    s.distance_m ? toDistanceDisplay(s.distance_m, unit) : "",
    s.notes,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
