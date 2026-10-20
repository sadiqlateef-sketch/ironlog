// Work shifts (nursing 12s, evenings, nights) and a week plan that keeps
// heavy training days away from shift days and the day after a night shift.
// Dates are local calendar days ("2026-10-20"). No app imports, so it can be
// unit tested.

export type ShiftType = "day" | "evening" | "night";

export interface Shift {
  /** The day the shift starts. A night shift ends the next morning. */
  date: string;
  type: ShiftType;
  start: string;
  end: string;
}

export const SHIFT_PRESETS: Record<ShiftType, { label: string; start: string; end: string }> = {
  day: { label: "Day", start: "07:00", end: "19:30" },
  evening: { label: "Evening", start: "15:00", end: "23:30" },
  night: { label: "Night", start: "19:00", end: "07:30" },
};

/** How ready you are to train that day: 3 = off, 0 = sleep it off. */
export type Readiness = { score: number; label: string; kind: "off" | "evening" | "pre-night" | "day" | "post-night" };

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function readiness(date: string, shifts: Shift[]): Readiness {
  const on = shifts.find((s) => s.date === date);
  const nightBefore = shifts.some((s) => s.date === addDays(date, -1) && s.type === "night");
  if (nightBefore) return { score: 0, label: "After night shift", kind: "post-night" };
  if (on?.type === "day") return { score: 0.5, label: "Day shift", kind: "day" };
  if (on?.type === "night") return { score: 1.5, label: "Night shift tonight", kind: "pre-night" };
  if (on?.type === "evening") return { score: 1.5, label: "Evening shift", kind: "evening" };
  return { score: 3, label: "Off", kind: "off" };
}

/** Rough weight of a workout: working sets, counting heavy barbell work and low reps more. */
export function heaviness(items: { target_sets: number; target_reps: number; equipment?: string | null }[]): number {
  return items.reduce((t, x) => {
    const heavyKit = x.equipment === "barbell" || x.equipment === "trap_bar" ? 2 : 1;
    return t + x.target_sets * heavyKit * (x.target_reps <= 6 ? 1.5 : 1);
  }, 0);
}

export interface PlanDay {
  id: string;
  heaviness: number;
}

export interface Slot {
  date: string;
  readiness: Readiness;
  /** The workout planned that day, or null for rest. */
  dayId: string | null;
  heavy: boolean;
}

/**
 * Lay the week's remaining workouts over the next `horizon` days. Heaviest
 * first, each takes the most-rested free day (off days, then evening and
 * pre-night shifts; a day shift only for a light day when nothing else is
 * left; never the day after a night shift). Back-to-back days are avoided
 * when there's room. Workouts that don't fit come back in `unplaced`.
 */
export function planWeek(
  days: PlanDay[],
  shifts: Shift[],
  today: string,
  opts: { horizon?: number; skipToday?: boolean } = {},
): { slots: Slot[]; unplaced: string[] } {
  const horizon = opts.horizon ?? 7;
  const slots: Slot[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    slots.push({ date, readiness: readiness(date, shifts), dayId: null, heavy: false });
  }
  const max = Math.max(0, ...days.map((d) => d.heaviness));
  const isHeavy = (d: PlanDay) => days.length > 1 && max > 0 && d.heaviness >= max * 0.8;
  const order = [...days].sort((a, b) => b.heaviness - a.heaviness);
  const unplaced: string[] = [];

  for (const day of order) {
    const heavy = isHeavy(day);
    const floor = heavy ? 1.5 : 1;
    const pick = (min: number) => {
      let best = -1;
      let bestScore = -Infinity;
      slots.forEach((s, i) => {
        if (s.dayId || s.readiness.score < min || (i === 0 && opts.skipToday)) return;
        const busyNext = (slots[i - 1]?.dayId ? 1 : 0) + (slots[i + 1]?.dayId ? 1 : 0);
        // A heavy day wants the most rest; earlier is better on a tie.
        const score = s.readiness.score * (heavy ? 1.5 : 1) - busyNext * 0.9 - i * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      return best;
    };
    let i = pick(floor);
    if (i < 0) i = pick(heavy ? 1 : 0.5);
    if (i < 0) {
      unplaced.push(day.id);
      continue;
    }
    slots[i].dayId = day.id;
    slots[i].heavy = heavy;
  }
  return { slots, unplaced };
}

/** Keep shifts from 2 weeks ago onward, one per day, in date order. */
export function tidyShifts(shifts: Shift[], today: string): Shift[] {
  const cutoff = addDays(today, -14);
  const byDate = new Map<string, Shift>();
  for (const s of shifts) if (s.date >= cutoff && /^\d{4}-\d{2}-\d{2}$/.test(s.date)) byDate.set(s.date, s);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeShifts(raw: unknown): Shift[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s.date === "string" && s.type in SHIFT_PRESETS)
    .map((s) => ({
      date: s.date,
      type: s.type as ShiftType,
      start: typeof s.start === "string" ? s.start : SHIFT_PRESETS[s.type as ShiftType].start,
      end: typeof s.end === "string" ? s.end : SHIFT_PRESETS[s.type as ShiftType].end,
    }));
}
