import test from "node:test";
import assert from "node:assert/strict";
import { dayTotalsCsv, daysInRange, entriesCsv, MAX_EXPORT_DAYS } from "../src/lib/nutrition/export.ts";
import { makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { DiaryEntry } from "../src/lib/nutrition/diary-types.ts";

// All amounts are made up for the test.
let n = 0;
const e = (day: string, name: string, values: Record<string, number>, status: DiaryEntry["status"] = "logged", note: string | null = null): DiaryEntry => ({
  ...makeQuickEntry({ name, values, foodDay: day, meal: DEFAULT_MEALS[1], now: new Date(2026, 10, 10, 12, n++), id: `e${n}`, note }),
  status,
});

test("entries CSV: header with units, escaping, planned out, range inclusive", () => {
  const csv = entriesCsv(
    [
      e("2026-11-09", "before range", { energy: 1 }),
      e("2026-11-10", 'Rice, "jasmine"', { energy: 200, protein: 4, sodium: 0.12, caffeine: 0 }, "logged", "line1\nline2"),
      e("2026-11-11", "planned", { energy: 999 }, "planned"),
      e("2026-11-12", "last day", { energy: 300 }),
      e("2026-11-13", "after", { energy: 1 }),
    ],
    "2026-11-10",
    "2026-11-12",
  );
  const lines = csv.split("\r\n");
  assert.equal(
    lines[0],
    "Food day,Time,Meal,Food,Brand,Amount,Unit,Weight (g or ml),Energy (kcal),Protein (g),Carbs (g),Fat (g),Fiber (g),Sugars (g),Sodium (mg),Caffeine (mg),Note",
  );
  assert.ok(csv.includes('"Rice, ""jasmine"""'));
  assert.ok(csv.includes('"line1\nline2"'));
  assert.ok(!csv.includes("planned"));
  assert.ok(!csv.includes("before range") && !csv.includes("after"));
  assert.ok(csv.includes("last day"));
  assert.ok(csv.includes(",120,"), "sodium shown in mg");
  assert.ok(csv.endsWith("\r\n"));
});

test("day totals CSV: one row per logged day, planned out, unknown flagged", () => {
  const partial = e("2026-11-11", "partial", { energy: 100 });
  partial.nutrients = { ...partial.nutrients, protein: { value: 0, state: "incomplete" } };
  const csv = dayTotalsCsv(
    [e("2026-11-10", "a", { energy: 200, protein: 10 }), e("2026-11-10", "b", { energy: 300, protein: 5 }), partial, e("2026-11-12", "p", { energy: 5 }, "planned")],
    "2026-11-10",
    "2026-11-12",
  );
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("Food day,Entries,Energy (kcal)"));
  assert.ok(lines[1].startsWith("2026-11-10,2,500,15,"));
  assert.ok(lines[2].startsWith("2026-11-11,1,100,") && lines[2].endsWith(",yes"));
});

test("daysInRange is inclusive, empty when reversed, capped", () => {
  assert.deepEqual(daysInRange("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(daysInRange("2026-11-02", "2026-11-01"), []);
  assert.equal(daysInRange("2020-01-01", "2026-01-01").length, MAX_EXPORT_DAYS);
});
