// Recovery-day reminder: the morning after a workout, a notification says
// which muscles are still rebuilding and suggests something easy.
// Plain logic lives here (tested); scheduling is in native.ts.

import type { MuscleGroup } from "../types/database";
import { MUSCLE_LABELS } from "./labels.ts";

export const REMINDER_HOUR = 9;

/** 9:00 tomorrow, local time. */
export function nextMorning(now: Date, hour = REMINDER_HOUR): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The notification text for the muscles trained most in the workout (up to three). */
export function recoveryMessage(muscles: MuscleGroup[]): { title: string; body: string } {
  const counts = new Map<MuscleGroup, number>();
  for (const m of muscles) counts.set(m, (counts.get(m) ?? 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLE_LABELS[m].toLowerCase());
  const what = top.length ? `Your ${list(top)} ${top.length === 1 ? "is" : "are"} still rebuilding from yesterday.` : "Your muscles are rebuilding from yesterday.";
  return { title: "Recovery day", body: `${what} A walk, some stretching, sleep and protein all help.` };
}
