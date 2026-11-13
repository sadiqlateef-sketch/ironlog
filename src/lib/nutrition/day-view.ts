// The day story: one food day as a timeline of what happened, in time order:
// meals, workouts, water, supplements, shift start and end, caffeine on board
// (hourly samples), and sleep when the user entered it by hand. Pure, no app
// imports; the screen supplies the data.

import { addDays, dayKey, type Shift } from "../shifts.ts";
import { caffeineAt, entryCaffeineMg } from "./caffeine.ts";
import { dayTotals } from "./entry-math.ts";
import type { DiaryEntry } from "./diary-types.ts";
import type { NutritionLog } from "./hydration.ts";
import { crossesMidnight } from "./shift-day.ts";

export interface StorySession {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
}

export type StoryItem =
  /** Hours from the user's own readiness entry; null shows "No sleep data". */
  | { kind: "sleep"; at: null; hours: number | null }
  | { kind: "meal"; at: string; mealId: string; name: string; foods: string[]; kcal: number; incomplete: boolean }
  | { kind: "workout"; at: string; end: string | null; name: string; id: string }
  | { kind: "water"; at: string; ml: number }
  | { kind: "supplement"; at: string; name: string; doses: number }
  | { kind: "shift-start" | "shift-end"; at: string; shiftType: Shift["type"] }
  | { kind: "caffeine"; at: string; mg: number };

export interface StoryInput {
  day: string;
  /** The day's entries (planned ones are left out of the story). */
  entries: readonly DiaryEntry[];
  /** Entries from the day before too, so caffeine carried over from a night shift counts. */
  earlier?: readonly DiaryEntry[];
  sessions: readonly StorySession[];
  logs: readonly NutritionLog[];
  shifts: readonly Shift[];
  /** Manual sleep hours, or null when the user hasn't entered any. */
  sleep: number | null;
  /** The food day a moment belongs to (the user's rule). Defaults to the calendar day. */
  dayOf?: (t: Date) => string;
  supplementNames?: Readonly<Record<string, string>>;
  halfLifeH?: number;
  /** Samples stop here (pass now for today). */
  until?: Date;
}

/** Caffeine samples stop below this many mg; display rounding, not a health number. */
export const CAFFEINE_FLOOR_MG = 5;
export const MAX_CAFFEINE_SAMPLES = 24;
const HOUR = 3_600_000;

function at(day: string, hm: string, plusDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, d + plusDays, h, mi);
}

const ORDER: Record<StoryItem["kind"], number> = {
  sleep: 0,
  "shift-end": 1,
  "shift-start": 2,
  workout: 3,
  meal: 4,
  water: 5,
  supplement: 6,
  caffeine: 7,
};

export function buildStory(input: StoryInput): StoryItem[] {
  const { day } = input;
  const dayOf = input.dayOf ?? dayKey;
  const items: StoryItem[] = [{ kind: "sleep", at: null, hours: input.sleep !== null && input.sleep > 0 ? input.sleep : null }];

  // Meals: one item per meal, at its first entry.
  const eaten = input.entries.filter((e) => e.foodDay === day && e.status !== "planned");
  const byMeal = new Map<string, DiaryEntry[]>();
  for (const e of eaten) {
    const list = byMeal.get(e.mealId) ?? [];
    list.push(e);
    byMeal.set(e.mealId, list);
  }
  for (const [mealId, list] of byMeal) {
    list.sort((a, b) => (a.eatenAt < b.eatenAt ? -1 : a.eatenAt > b.eatenAt ? 1 : 0));
    const energy = dayTotals(list).energy;
    items.push({
      kind: "meal",
      at: list[0].eatenAt,
      mealId,
      name: list[0].mealName,
      foods: list.map((e) => e.name),
      kcal: Math.round(energy.value),
      incomplete: energy.state === "incomplete",
    });
  }

  for (const s of input.sessions) {
    if (dayOf(new Date(s.start_time)) !== day) continue;
    items.push({ kind: "workout", at: s.start_time, end: s.end_time, name: s.name ?? "Workout", id: s.id });
  }

  for (const l of input.logs) {
    if (l.foodDay !== day) continue;
    if (l.kind === "water") items.push({ kind: "water", at: l.loggedAt, ml: l.amount });
    else items.push({ kind: "supplement", at: l.loggedAt, name: (l.ref && input.supplementNames?.[l.ref]) || "Supplement", doses: l.amount });
  }

  // Shifts: ones starting this day, and the end of an overnight one from the day before.
  for (const s of input.shifts) {
    const overnight = crossesMidnight(s);
    if (s.date === day) {
      items.push({ kind: "shift-start", at: at(day, s.start).toISOString(), shiftType: s.type });
      items.push({ kind: "shift-end", at: at(day, s.end, overnight ? 1 : 0).toISOString(), shiftType: s.type });
    } else if (overnight && s.date === addDays(day, -1)) {
      items.push({ kind: "shift-end", at: at(day, s.end).toISOString(), shiftType: s.type });
    }
  }

  // Caffeine: hourly from the first caffeinated entry of the day.
  const half = input.halfLifeH;
  const first = eaten.filter((e) => entryCaffeineMg(e) > 0).map((e) => e.eatenAt).sort()[0];
  if (half && half > 0 && first) {
    const all = [...(input.earlier ?? []), ...eaten];
    const start = new Date(first);
    start.setMinutes(0, 0, 0);
    let t = start.getTime() + HOUR;
    for (let i = 0; i < MAX_CAFFEINE_SAMPLES; i++, t += HOUR) {
      if (input.until && t > input.until.getTime()) break;
      const mg = caffeineAt(all, new Date(t), half);
      if (mg < CAFFEINE_FLOOR_MG) break;
      items.push({ kind: "caffeine", at: new Date(t).toISOString(), mg: Math.round(mg) });
    }
  }

  return items.sort((a, b) => {
    if (a.at === null || b.at === null) return a.at === null ? (b.at === null ? 0 : -1) : 1;
    const d = new Date(a.at).getTime() - new Date(b.at).getTime();
    return d !== 0 ? d : ORDER[a.kind] - ORDER[b.kind];
  });
}
