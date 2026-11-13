// Caffeine on board: each logged entry's caffeine decays by half every
// `halfLifeH` hours (the user's setting; the app default is a parameter, not
// medical advice). The cutoff is the latest time another drink like the last
// one keeps the level at sleep under the user's own threshold.
// Pure, no app imports.

import type { DiaryEntry } from "./diary-types.ts";
import type { Shift } from "../shifts.ts";

type CaffeineEntry = Pick<DiaryEntry, "eatenAt" | "nutrients" | "status">;
const HOUR = 3_600_000;

/** mg of caffeine in an entry (nutrients are stored in g). */
export function entryCaffeineMg(e: CaffeineEntry): number {
  const v = e.nutrients.caffeine;
  return v && v.value > 0 ? v.value * 1000 : 0;
}

/** mg of caffeine still active at `t`. Entries after `t` and planned entries don't count. */
export function caffeineAt(entries: readonly CaffeineEntry[], t: Date, halfLifeH: number): number {
  let mg = 0;
  for (const e of entries) {
    if (e.status === "planned") continue;
    const dose = entryCaffeineMg(e);
    if (!dose) continue;
    const dt = (t.getTime() - new Date(e.eatenAt).getTime()) / HOUR;
    if (dt < 0) continue;
    mg += dose * Math.pow(0.5, dt / halfLifeH);
  }
  return mg;
}

export type Cutoff =
  /** Nothing caffeinated logged yet: no drink size to plan with. */
  | { kind: "none" }
  /** Already above the threshold at sleep. */
  | { kind: "over"; atSleepMg: number }
  /** Another drink like the last stays under the threshold at sleep, whenever it's had. */
  | { kind: "free" }
  | { kind: "at"; at: Date; doseMg: number };

/**
 * Latest time a drink of `doseMg` (default: the last caffeinated entry) keeps
 * caffeine at `sleepAt` at or under `thresholdMg`.
 */
export function cutoffTime(
  entries: readonly CaffeineEntry[],
  sleepAt: Date,
  thresholdMg: number,
  halfLifeH: number,
  doseMg?: number,
): Cutoff {
  const atSleep = caffeineAt(entries, sleepAt, halfLifeH);
  if (atSleep > thresholdMg) return { kind: "over", atSleepMg: Math.round(atSleep) };
  let dose = doseMg;
  if (dose === undefined) {
    const last = entries
      .filter((e) => e.status !== "planned" && entryCaffeineMg(e) > 0)
      .sort((a, b) => (a.eatenAt < b.eatenAt ? 1 : a.eatenAt > b.eatenAt ? -1 : 0))[0];
    if (!last) return { kind: "none" };
    dose = entryCaffeineMg(last);
  }
  const room = thresholdMg - atSleep;
  if (dose <= room) return { kind: "free" };
  if (room <= 0) return { kind: "over", atSleepMg: Math.round(atSleep) };
  const hoursBefore = halfLifeH * Math.log2(dose / room);
  return { kind: "at", at: new Date(sleepAt.getTime() - hoursBefore * HOUR), doseMg: Math.round(dose) };
}

function at(day: string, hm: string, plusDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, d + plusDays, h, mi);
}
const crossesMidnight = (s: Shift) => s.end <= s.start;

/** Minutes after a shift ends that sleep is assumed to start. */
export const SLEEP_AFTER_SHIFT_MIN = 30;

/**
 * When the user sleeps on calendar `day`: after a night shift that ends that
 * morning, shift end + 30 min; after a later-ending shift that day, its end +
 * 30 min; otherwise the user's sleep time (before noon means the next morning).
 */
export function sleepAtFor(day: string, shifts: readonly Shift[], fallback: string): Date {
  const prev = at(day, "00:00", -1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
  const post = shifts.find((s) => s.date === prevKey && crossesMidnight(s));
  if (post) return new Date(at(day, post.end).getTime() + SLEEP_AFTER_SHIFT_MIN * 60_000);
  const usual = at(day, fallback, fallback < "12:00" ? 1 : 0);
  const today = shifts.find((s) => s.date === day && !crossesMidnight(s));
  if (today) {
    const after = new Date(at(day, today.end).getTime() + SLEEP_AFTER_SHIFT_MIN * 60_000);
    if (after > usual) return after;
  }
  return usual;
}
