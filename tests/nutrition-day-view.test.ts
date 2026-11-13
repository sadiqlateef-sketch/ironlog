import test from "node:test";
import assert from "node:assert/strict";
import { buildStory, type StoryItem } from "../src/lib/nutrition/day-view.ts";
import { makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS, foodDayFor } from "../src/lib/nutrition/day.ts";
import type { DiaryEntry } from "../src/lib/nutrition/diary-types.ts";
import type { NutritionLog } from "../src/lib/nutrition/hydration.ts";
import { SHIFT_PRESETS, type Shift } from "../src/lib/shifts.ts";

// All amounts are made up for the test.
const D = "2026-11-12";
const entry = (id: string, at: Date, meal = DEFAULT_MEALS[0], values: Record<string, number> = { energy: 300 }, day = D): DiaryEntry =>
  makeQuickEntry({ name: id, values, foodDay: day, meal, now: at, id });
const kinds = (s: StoryItem[]) => s.map((i) => i.kind);

test("story orders items by time with sleep first", () => {
  const logs: NutritionLog[] = [
    { id: "w", kind: "water", foodDay: D, amount: 500, ref: null, loggedAt: new Date(2026, 10, 12, 9, 30).toISOString() },
    { id: "s", kind: "supplement", foodDay: D, amount: 1, ref: "sup-1", loggedAt: new Date(2026, 10, 12, 7, 0).toISOString() },
    { id: "x", kind: "water", foodDay: "2026-11-11", amount: 500, ref: null, loggedAt: new Date(2026, 10, 11, 9, 30).toISOString() },
  ];
  const story = buildStory({
    day: D,
    entries: [entry("lunch", new Date(2026, 10, 12, 12, 0), DEFAULT_MEALS[1]), entry("eggs", new Date(2026, 10, 12, 8, 0)), entry("toast", new Date(2026, 10, 12, 8, 10))],
    sessions: [{ id: "s1", name: "Push", start_time: new Date(2026, 10, 12, 17, 0).toISOString(), end_time: new Date(2026, 10, 12, 18, 0).toISOString() }],
    logs,
    shifts: [],
    sleep: 7,
    supplementNames: { "sup-1": "Creatine" },
  });
  assert.deepEqual(kinds(story), ["sleep", "supplement", "meal", "water", "meal", "workout"]);
  const breakfast = story[2] as Extract<StoryItem, { kind: "meal" }>;
  assert.deepEqual(breakfast.foods, ["eggs", "toast"]);
  assert.equal(breakfast.kcal, 600);
  assert.equal((story[1] as Extract<StoryItem, { kind: "supplement" }>).name, "Creatine");
  assert.equal((story[0] as Extract<StoryItem, { kind: "sleep" }>).hours, 7);
});

test("no sleep entered -> a sleep item with no hours (No sleep data)", () => {
  const story = buildStory({ day: D, entries: [], sessions: [], logs: [], shifts: [], sleep: null });
  assert.deepEqual(story, [{ kind: "sleep", at: null, hours: null }]);
});

test("night shift: a workout before it and food at 03:00 join one food day; planned food stays out", () => {
  const shifts: Shift[] = [{ date: D, type: "night", ...SHIFT_PRESETS.night }];
  const prefs = { day_start: "00:00", follow_shifts: true, post_night_start: "15:00" };
  const dayOf = (t: Date) => foodDayFor(t, prefs, shifts);
  const snackAt = new Date(2026, 10, 13, 3, 0);
  const snack = entry("snack", snackAt, DEFAULT_MEALS[3], { energy: 200 }, dayOf(snackAt));
  const planned: DiaryEntry = { ...entry("plan", new Date(2026, 10, 12, 13, 0)), status: "planned" };
  const story = buildStory({
    day: D,
    entries: [snack, planned],
    sessions: [
      { id: "w1", name: "Legs", start_time: new Date(2026, 10, 12, 15, 0).toISOString(), end_time: null },
      { id: "w0", name: "Other day", start_time: new Date(2026, 10, 11, 15, 0).toISOString(), end_time: null },
    ],
    logs: [],
    shifts,
    sleep: null,
    dayOf,
  });
  assert.equal(snack.foodDay, D);
  assert.deepEqual(kinds(story), ["sleep", "workout", "shift-start", "meal", "shift-end"]);
  assert.equal(story[4].at, new Date(2026, 10, 13, 7, 30).toISOString());
});

test("the end of last night's shift shows on the next day; caffeine samples hourly and fade", () => {
  const shifts: Shift[] = [{ date: "2026-11-11", type: "night", ...SHIFT_PRESETS.night }];
  const coffee = entry("coffee", new Date(2026, 10, 12, 8, 15), DEFAULT_MEALS[0], { energy: 5, caffeine: 0.1 });
  const story = buildStory({ day: D, entries: [coffee], sessions: [], logs: [], shifts, sleep: null, halfLifeH: 5 });
  assert.equal(story[1].kind, "shift-end");
  const caf = story.filter((i): i is Extract<StoryItem, { kind: "caffeine" }> => i.kind === "caffeine");
  assert.equal(caf[0].at, new Date(2026, 10, 12, 9, 0).toISOString());
  assert.ok(caf.every((c, i) => i === 0 || c.mg <= caf[i - 1].mg) && caf[caf.length - 1].mg < caf[0].mg);
  assert.ok(caf.length > 5 && caf.length <= 24);
  const cut = buildStory({ day: D, entries: [coffee], sessions: [], logs: [], shifts: [], sleep: null, halfLifeH: 5, until: new Date(2026, 10, 12, 11, 30) });
  assert.equal(cut.filter((i) => i.kind === "caffeine").length, 3);
});
