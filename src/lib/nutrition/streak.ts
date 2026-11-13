// Logging streak: consecutive food days with at least one logged (not planned)
// entry, counted back from today. Today gets grace until it ends: an empty
// today doesn't break the streak, it just isn't counted yet. Pure, no app imports.

import { addDays } from "../shifts.ts";

export interface LoggingStreak {
  days: number;
  todayLogged: boolean;
}

/** `isLogged(day)` says whether a food day has a logged entry. Looks back at most `maxDays`. */
export function loggingStreak(isLogged: (day: string) => boolean, today: string, maxDays = 366): LoggingStreak {
  const todayLogged = isLogged(today);
  let days = todayLogged ? 1 : 0;
  let d = addDays(today, -1);
  while (days < maxDays && isLogged(d)) {
    days++;
    d = addDays(d, -1);
  }
  return { days, todayLogged };
}

/** True when a day's entries include a logged one. */
export function hasLogged(entries: readonly { status?: string }[] | null | undefined): boolean {
  return !!entries && entries.some((e) => e.status !== "planned");
}
