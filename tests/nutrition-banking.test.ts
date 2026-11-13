import test from "node:test";
import assert from "node:assert/strict";
import { bankedSoFar, todayAllowance, weekBudget } from "../src/lib/nutrition/banking.ts";

// A made-up week of 2000 kcal goals (test settings, not advice).
const WEEK = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
const goalByDay = Object.fromEntries(WEEK.map((d) => [d, 2000]));
const on = { on: true, maxBoostPct: 20 };

test("F23: the week's budget is the sum of daily goals", () => {
  assert.equal(weekBudget(goalByDay), 14000);
  assert.equal(weekBudget({ a: 2000, b: null }), 2000);
});

test("under and over days balance out; today's boost is spread over the days left", () => {
  const eaten = {
    [WEEK[0]]: { energy: 1500, complete: true }, // +500
    [WEEK[1]]: { energy: 2300, complete: true }, // -300
    [WEEK[2]]: { energy: 1800, complete: true }, // +200
  };
  assert.equal(bankedSoFar(goalByDay, eaten, WEEK[3]).banked, 400);
  const a = todayAllowance(goalByDay, eaten, WEEK[3], on)!;
  assert.equal(a.boost, 100); // 400 over 4 days left
  assert.equal(a.allowance, 2100);
  assert.equal(a.capped, false);
});

test("the boost never exceeds the cap, in either direction", () => {
  const under = { [WEEK[0]]: { energy: 0, complete: true }, [WEEK[1]]: { energy: 0, complete: true } };
  const a = todayAllowance(goalByDay, under, WEEK[6], on)!;
  assert.equal(a.boost, 400);
  assert.equal(a.capped, true);
  const over = { [WEEK[0]]: { energy: 6000, complete: true } };
  assert.equal(todayAllowance(goalByDay, over, WEEK[6], on)!.boost, -400);
});

test("a day with unknown energy is left out and reported", () => {
  const eaten = { [WEEK[0]]: { energy: 1000, complete: false }, [WEEK[1]]: { energy: 1800, complete: true } };
  const b = bankedSoFar(goalByDay, eaten, WEEK[2]);
  assert.equal(b.banked, 200);
  assert.deepEqual(b.incomplete, [WEEK[0]]);
  assert.deepEqual(todayAllowance(goalByDay, eaten, WEEK[2], on)!.incomplete, [WEEK[0]]);
});

test("banking off: today's allowance is just the goal; no goal today -> null", () => {
  const eaten = { [WEEK[0]]: { energy: 1000, complete: true } };
  const a = todayAllowance(goalByDay, eaten, WEEK[1], { on: false, maxBoostPct: 20 })!;
  assert.equal(a.allowance, 2000);
  assert.equal(a.banked, 1000);
  assert.equal(todayAllowance({ ...goalByDay, [WEEK[1]]: null }, eaten, WEEK[1], on), null);
});
