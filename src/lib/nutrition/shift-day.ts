// Shift-driven food day: after a night shift that started on day D, everything
// eaten before `postNightStart` on D+1 still counts for D (the shift, the
// sleep after it and the first meal on waking are one "day" for the body).
// Off by default; when it doesn't apply the caller falls back to the plain
// day-start rule. Pure, no app imports.

import { addDays, dayKey, type Shift } from "../shifts.ts";

/** The app's default; the user changes it in food settings. A setting, not advice. */
export const DEFAULT_POST_NIGHT_START = "15:00";

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (hm: string): number | null => {
  const m = HM.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** A shift that runs past midnight (a night shift, or any shift ending at or before its start time). */
export function crossesMidnight(s: Pick<Shift, "type" | "start" | "end">): boolean {
  return s.type === "night" || s.end <= s.start;
}

/** The overnight shift that started the calendar day before `calDay`, if any. */
export function nightBefore(calDay: string, shifts: readonly Shift[]): Shift | null {
  const prev = addDays(calDay, -1);
  return shifts.find((s) => s.date === prev && crossesMidnight(s)) ?? null;
}

/**
 * The food day `now` belongs to under the shift rule, or null when the rule
 * doesn't apply (no overnight shift the day before, or it's past `postNightStart`).
 */
export function postNightFoodDay(now: Date, shifts: readonly Shift[], postNightStart: string): string | null {
  const cal = dayKey(now);
  const night = nightBefore(cal, shifts);
  if (!night) return null;
  const cut = toMin(postNightStart) ?? (toMin(DEFAULT_POST_NIGHT_START) as number);
  return now.getHours() * 60 + now.getMinutes() < cut ? night.date : null;
}
