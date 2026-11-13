import test from "node:test";
import assert from "node:assert/strict";
import { proteinSplit } from "../src/lib/nutrition/goals.ts";
import { weekDays } from "../src/lib/nutrition/banking.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import { makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import type { DiaryEntry } from "../src/lib/nutrition/diary-types.ts";

// Made-up entries; the 30 g per-meal target is a test setting.
const NOW = new Date(2026, 10, 12, 8);
const e = (id: string, protein: number, status: DiaryEntry["status"] = "logged"): DiaryEntry => ({
  ...makeQuickEntry({ name: id, values: { energy: 100, protein }, foodDay: "2026-11-12", meal: DEFAULT_MEALS[0], now: NOW, id }),
  status,
});

test("protein split counts meals reaching the user's per-meal target", () => {
  const s = proteinSplit({ breakfast: [e("a", 20), e("b", 12)], lunch: [e("c", 25)], dinner: [e("d", 40)] }, 30);
  assert.deepEqual(s, { meals: 3, reached: 2, target: 30 });
});

test("empty meals and planned entries don't count", () => {
  const s = proteinSplit({ breakfast: [], lunch: [e("p", 50, "planned")], dinner: [e("d", 30)] }, 30);
  assert.deepEqual(s, { meals: 1, reached: 1, target: 30 });
});

test("no per-meal target -> hidden", () => {
  assert.equal(proteinSplit({ lunch: [e("c", 25)] }, null), null);
  assert.equal(proteinSplit({ lunch: [e("c", 25)] }, 0), null);
});

test("banking weeks run Monday to Sunday", () => {
  assert.deepEqual(weekDays("2026-11-12"), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  assert.equal(weekDays("2026-11-15")[0], "2026-11-09");
  assert.equal(weekDays("2026-11-16")[0], "2026-11-16");
});
