// Fasting window from entry times. Uses the real eaten-at times, so it works
// across food days (a night shift spanning midnight). Pure, no app imports.

import type { DiaryEntry } from "./diary-types.ts";

type Timed = Pick<DiaryEntry, "eatenAt" | "status">;

const eatenTimes = (entries: readonly Timed[]) => entries.filter((e) => e.status !== "planned").map((e) => new Date(e.eatenAt));

/** The last time anything was eaten at or before `t`; null if never. */
export function lastEatenBefore(t: Date, entries: readonly Timed[]): Date | null {
  let best: Date | null = null;
  for (const d of eatenTimes(entries)) if (d <= t && (!best || d > best)) best = d;
  return best;
}

/** First and last eaten-at times of a day's entries, and the hours between. */
export function eatingWindow(dayEntries: readonly Timed[]): { first: Date; last: Date; hours: number } | null {
  const times = eatenTimes(dayEntries).sort((a, b) => a.getTime() - b.getTime());
  if (!times.length) return null;
  const first = times[0];
  const last = times[times.length - 1];
  return { first, last, hours: (last.getTime() - first.getTime()) / 3_600_000 };
}

/** Hours since the last thing eaten; null if nothing logged. */
export function hoursSinceEaten(now: Date, entries: readonly Timed[]): number | null {
  const last = lastEatenBefore(now, entries);
  return last ? (now.getTime() - last.getTime()) / 3_600_000 : null;
}
