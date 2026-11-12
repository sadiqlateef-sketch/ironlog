import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MEALS, defaultMealFor, dayLabel, foodDay, isFoodDayToday, mealContains, normalizeDayStart,
  normalizePrefs, orderMeals, parseHm, shiftDay, validateMeals,
} from "../src/lib/nutrition/day.ts";
import type { MealSlot } from "../src/lib/nutrition/diary-types.ts";

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);
const meals = (): MealSlot[] => DEFAULT_MEALS.map((m) => ({ ...m }));

test("parseHm is strict", () => {
  assert.equal(parseHm("00:00"), 0);
  assert.equal(parseHm("04:30"), 270);
  assert.equal(parseHm("23:59"), 1439);
  for (const bad of ["24:00", "4:00", "04:60", "0400", "", "ab:cd", " 04:00", null, undefined, 5, "04:00:00"]) {
    assert.equal(parseHm(bad), null, String(bad));
  }
  assert.equal(normalizeDayStart("junk"), "00:00");
  assert.equal(normalizeDayStart("05:15"), "05:15");
});

test("food day at 00:00 is the calendar day", () => {
  assert.equal(foodDay(at(2026, 11, 12, 0, 0), "00:00"), "2026-11-12");
  assert.equal(foodDay(at(2026, 11, 12, 23, 59), "00:00"), "2026-11-12");
  assert.equal(foodDay(at(2026, 11, 12, 1, 0), "garbage"), "2026-11-12");
});

test("food day with a 04:00 start", () => {
  assert.equal(foodDay(at(2026, 11, 12, 3, 59), "04:00"), "2026-11-11");
  assert.equal(foodDay(at(2026, 11, 12, 4, 0), "04:00"), "2026-11-12");
  assert.equal(foodDay(at(2026, 11, 12, 22, 0), "04:00"), "2026-11-12");
});

test("food day rolls over months and years", () => {
  assert.equal(foodDay(at(2026, 12, 1, 2, 0), "04:00"), "2026-11-30");
  assert.equal(foodDay(at(2027, 1, 1, 0, 30), "04:00"), "2026-12-31");
  assert.equal(foodDay(at(2028, 3, 1, 1, 0), "04:00"), "2028-02-29");
});

test("food day on DST change days", () => {
  // US spring forward 2026-03-08 and fall back 2026-11-01 (local clock); holds in any zone.
  assert.equal(foodDay(at(2026, 3, 8, 3, 30), "04:00"), "2026-03-07");
  assert.equal(foodDay(at(2026, 3, 8, 4, 0), "04:00"), "2026-03-08");
  assert.equal(foodDay(at(2026, 11, 1, 3, 59), "04:00"), "2026-10-31");
  assert.equal(foodDay(at(2026, 11, 1, 12, 0), "04:00"), "2026-11-01");
});

test("isFoodDayToday, dayLabel, shiftDay", () => {
  const now = at(2026, 11, 12, 2, 0);
  assert.equal(isFoodDayToday("2026-11-11", now, "04:00"), true);
  assert.equal(isFoodDayToday("2026-11-12", now, "04:00"), false);
  assert.equal(dayLabel("2026-11-12", "2026-11-12"), "Today");
  assert.equal(dayLabel("2026-11-11", "2026-11-12"), "Yesterday");
  assert.match(dayLabel("2026-11-09", "2026-11-12"), /Nov/);
  assert.equal(shiftDay("2026-11-30", 1), "2026-12-01");
});

test("meal windows", () => {
  const [b, , , snacks] = meals();
  assert.equal(mealContains(b, 6 * 60), true);
  assert.equal(mealContains(b, 10 * 60 - 1), true);
  assert.equal(mealContains(b, 10 * 60), false);
  assert.equal(mealContains(b, 5 * 60 + 59), false);
  const night: MealSlot = { id: "n", name: "Night", start: "21:00", end: "03:00", rank: 5 };
  assert.equal(mealContains(night, 22 * 60), true);
  assert.equal(mealContains(night, 0), true);
  assert.equal(mealContains(night, 2 * 60 + 59), true);
  assert.equal(mealContains(night, 3 * 60), false);
  assert.equal(mealContains(night, 12 * 60), false);
  assert.equal(mealContains(snacks, 0), true);
  assert.equal(mealContains(snacks, 13 * 60), true);
});

test("orderMeals and defaultMealFor", () => {
  const m = meals();
  assert.deepEqual(orderMeals(m, null).map((s) => s.id), ["meal-breakfast", "meal-lunch", "meal-dinner", "meal-snacks"]);
  // 12:30: lunch is current, then the rest by rank with all-day last
  assert.deepEqual(orderMeals(m, at(2026, 11, 12, 12, 30)).map((s) => s.id), ["meal-lunch", "meal-breakfast", "meal-dinner", "meal-snacks"]);
  // 02:00: nothing current; all-day stays last
  assert.deepEqual(orderMeals(m, at(2026, 11, 12, 2, 0)).map((s) => s.id), ["meal-breakfast", "meal-lunch", "meal-dinner", "meal-snacks"]);
  assert.equal(defaultMealFor(m, at(2026, 11, 12, 7, 0))?.id, "meal-breakfast");
  assert.equal(defaultMealFor(m, at(2026, 11, 12, 16, 0))?.id, "meal-dinner");
  assert.equal(defaultMealFor(m, at(2026, 11, 12, 2, 0))?.id, "meal-snacks");
  const noAllDay = m.slice(0, 3);
  assert.equal(defaultMealFor(noAllDay, at(2026, 11, 12, 2, 0))?.id, "meal-breakfast");
  assert.equal(defaultMealFor([], new Date()), null);
});

test("orderMeals puts an all-day slot ranked first after the live ones", () => {
  const m = meals();
  m[3].rank = 0; // all-day slot ranked first
  assert.deepEqual(orderMeals(m, null).map((s) => s.id)[0], "meal-snacks");
  assert.deepEqual(orderMeals(m, at(2026, 11, 12, 12, 30)).map((s) => s.id), ["meal-lunch", "meal-breakfast", "meal-dinner", "meal-snacks"]);
});

test("normalizePrefs tolerates junk", () => {
  for (const junk of [null, undefined, "x", 5, [], {}, { meals: "no" }, { meals: [] }]) {
    const p = normalizePrefs(junk);
    assert.equal(p.day_start, "00:00");
    assert.deepEqual(p.meals, DEFAULT_MEALS);
    assert.equal(p.staples_version, 0);
  }
  const p = normalizePrefs({
    day_start: "04:00",
    staples_version: 2,
    meals: [
      { id: "a", name: "  First  ", start: "06:00", end: "09:00", rank: 9 },
      { id: "a", name: "Dup", start: "06:00", end: "09:00", rank: 1 },
      { id: "b", name: "", start: "06:00", end: "09:00" },
      { id: "c", name: "Bad time", start: "6am", end: "09:00" },
      null,
      { id: "d", name: "x".repeat(100), start: "10:00", end: "10:00" },
    ],
  });
  assert.equal(p.day_start, "04:00");
  assert.equal(p.staples_version, 2);
  assert.deepEqual(p.meals.map((s) => [s.id, s.rank]), [["a", 1], ["d", 2]]);
  assert.equal(p.meals[0].name, "First");
  assert.equal(p.meals[1].name.length, 60);
  assert.equal(normalizePrefs({ staples_version: -1 }).staples_version, 0);
  assert.equal(normalizePrefs({ staples_version: 1.5 }).staples_version, 0);
});

test("normalizePrefs caps at 12 slots and does not share defaults", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, name: `Meal ${i}`, start: "08:00", end: "09:00" }));
  const p = normalizePrefs({ meals: many });
  assert.equal(p.meals.length, 12);
  assert.equal(p.meals[11].rank, 12);
  const a = normalizePrefs(null);
  a.meals[0].name = "Changed";
  assert.equal(DEFAULT_MEALS[0].name, "Breakfast");
  assert.equal(normalizePrefs(null).meals[0].name, "Breakfast");
});

test("validateMeals", () => {
  assert.equal(validateMeals(meals()), null);
  assert.ok(validateMeals([]));
  assert.ok(validateMeals(Array.from({ length: 13 }, (_, i) => ({ id: `${i}`, name: `M${i}`, start: "08:00", end: "09:00", rank: i }))));
  const m = meals();
  m[0].name = "  ";
  assert.ok(validateMeals(m));
  const t = meals();
  t[1].start = "25:00";
  assert.ok(validateMeals(t));
  const d = meals();
  d[1].name = "BREAKFAST";
  assert.match(validateMeals(d) ?? "", /twice/);
});
