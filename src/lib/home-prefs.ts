// Per-phone choices for "Use What You Got" home workouts.

import type { HomeFocus } from "@/lib/home-workout";

export const HOME_CALENDAR_KEY = "ironlog.home.calendar";
const OPTS_KEY = "ironlog.home.opts";
const SHUFFLE_KEY = "ironlog.home.shuffle";

/** Your last "Add to calendar?" answer (yes the first time). */
export function homeCalendarDefault(): boolean {
  try {
    return localStorage.getItem(HOME_CALENDAR_KEY) !== "0";
  } catch {
    return true;
  }
}

export type HomeOpts = { minutes: number | "surprise"; focus: HomeFocus };

export function savedHomeOpts(): HomeOpts {
  try {
    const o = JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}");
    return {
      minutes: o.minutes === "surprise" || [15, 20, 25].includes(o.minutes) ? o.minutes : 20,
      focus: ["full", "upper", "lower", "push", "pull"].includes(o.focus) ? o.focus : "full",
    };
  } catch {
    return { minutes: 20, focus: "full" };
  }
}

export function saveHomeOpts(o: HomeOpts): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(o));
  } catch {}
}

/** How many times you've shuffled tonight's workout (resets each night). */
export function shufflesFor(day: string): number {
  try {
    const o = JSON.parse(localStorage.getItem(SHUFFLE_KEY) ?? "{}");
    return o.day === day ? Number(o.n) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveShuffles(day: string, n: number): void {
  try {
    localStorage.setItem(SHUFFLE_KEY, JSON.stringify({ day, n }));
  } catch {}
}
