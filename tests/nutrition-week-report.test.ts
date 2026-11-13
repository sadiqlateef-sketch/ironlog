import test from "node:test";
import assert from "node:assert/strict";
import { ENERGY_HIT_PCT, weekEnding, weekReport } from "../src/lib/nutrition/week-report.ts";
import { hasLogged, loggingStreak } from "../src/lib/nutrition/streak.ts";
import { makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { DiaryEntry } from "../src/lib/nutrition/diary-types.ts";
import type { DayGoal } from "../src/lib/nutrition/goals.ts";

// All amounts are made up for the test.
const e = (day: string, values: Record<string, number>, status: DiaryEntry["status"] = "logged"): DiaryEntry => ({
  ...makeQuickEntry({ name: "x", values, foodDay: day, meal: DEFAULT_MEALS[0], now: new Date(2026, 10, 10, 12), id: Math.random().toString(36).slice(2) }),
  status,
});
const goal = (energy: number, protein: number): DayGoal => ({ energy, protein, carbs: 0, fat: 0, micros: {}, training: false, phase: null, weekdayOverride: false });

test("streak: consecutive days, a gap stops it, today has grace", () => {
  const logged = new Set(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-08"]);
  const is = (d: string) => logged.has(d);
  assert.deepEqual(loggingStreak(is, "2026-11-12"), { days: 3, todayLogged: true });
  // Today empty so far: still 3 (yesterday's run), not broken.
  assert.deepEqual(loggingStreak(is, "2026-11-13"), { days: 3, todayLogged: false });
  // Two empty days: broken.
  assert.deepEqual(loggingStreak(is, "2026-11-14"), { days: 0, todayLogged: false });
  assert.equal(loggingStreak(() => true, "2026-11-12", 30).days, 30);
  assert.equal(hasLogged([e("2026-11-12", { energy: 1 }, "planned")]), false);
  assert.equal(hasLogged([e("2026-11-12", { energy: 1 })]), true);
  assert.equal(hasLogged(null), false);
});

test("report: averages use complete days only; incomplete days are listed; planned ignored", () => {
  const days = weekEnding("2026-11-12");
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-11-06");
  const incomplete = { ...e("2026-11-11", { energy: 900, protein: 50 }) };
  incomplete.nutrients = { ...incomplete.nutrients, energy: { value: 900, state: "incomplete" } };
  const report = weekReport({
    days,
    entriesByDay: {
      "2026-11-10": [e("2026-11-10", { energy: 2000, protein: 150 })],
      "2026-11-11": [incomplete],
      "2026-11-12": [e("2026-11-12", { energy: 2400, protein: 110 }), e("2026-11-12", { energy: 5000, protein: 300 }, "planned")],
    },
  });
  assert.equal(report.daysLogged, 3);
  assert.deepEqual(report.incompleteDays, ["2026-11-11"]);
  assert.equal(report.avgEnergy, 2200);
  assert.equal(report.avgProtein, 103);
  assert.equal(report.goalDays, 0);
  assert.equal(report.bestDay, null);
  assert.equal(report.weight, null);
});

test("report: goal hits, best day, weight beside intake", () => {
  const days = weekEnding("2026-11-12");
  const within = Math.round(2000 * (1 + ENERGY_HIT_PCT / 200));
  const report = weekReport({
    days,
    entriesByDay: {
      "2026-11-10": [e("2026-11-10", { energy: within, protein: 160 })],
      "2026-11-11": [e("2026-11-11", { energy: 2600, protein: 100 })],
    },
    goalByDay: { "2026-11-10": goal(2000, 150), "2026-11-11": goal(2000, 150) },
    weights: [
      { measured_on: "2026-11-01", weight_kg: 90 },
      { measured_on: "2026-11-07", weight_kg: 80.4 },
      { measured_on: "2026-11-12", weight_kg: 80.1 },
      { measured_on: "2026-11-09", weight_kg: null },
    ],
  });
  assert.equal(report.goalDays, 2);
  assert.equal(report.energyHits, 1);
  assert.equal(report.proteinHits, 1);
  assert.equal(report.bestDay?.day, "2026-11-10");
  assert.equal(report.weight?.count, 2);
  assert.equal(report.weight?.changeKg, -0.3);
  assert.equal(report.weight?.first.measured_on, "2026-11-07");
});
