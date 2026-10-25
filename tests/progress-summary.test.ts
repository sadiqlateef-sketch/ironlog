import assert from "node:assert/strict";
import test from "node:test";
import { mainLifts, needsAttention, newPrsThisWeek } from "../src/lib/progress-summary.ts";
import { weekStart, type StatSet } from "../src/lib/stats.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 15); // a Thursday
const set = (session: string, ex: string, daysAgo: number, weight: number, reps = 5): StatSet => ({
  session_id: session,
  exercise_id: ex,
  set_type: "normal",
  weight,
  reps,
  completed_at: new Date(NOW - daysAgo * DAY).toISOString(),
});

test("a record this week counts only with earlier history", () => {
  const start = weekStart(NOW);
  const before = (NOW - start) / DAY + 3; // 3 days before this week began
  const sets = [set("a", "sq", before, 100), set("b", "sq", 0.5, 110), set("c", "bn", 0.5, 80)];
  assert.equal(newPrsThisWeek(sets, NOW), 1); // squat beat 100; bench has no history
  assert.equal(newPrsThisWeek([set("a", "sq", before, 100), set("b", "sq", 0.5, 100)], NOW), 0);
});

test("main lifts match by slug and report the trend", () => {
  const slugs: Record<string, string> = { sq: "back-squat", rw: "barbell-curl" };
  const sets = [set("a", "sq", 28, 100), set("b", "sq", 14, 105), set("c", "sq", 1, 110), set("d", "rw", 1, 30)];
  const lifts = mainLifts(sets, (id) => slugs[id], NOW);
  assert.equal(lifts.length, 1);
  assert.equal(lifts[0].lift, "squat");
  assert.equal(lifts[0].points.length, 3);
  assert.ok((lifts[0].change ?? 0) > 0);
  assert.equal(lifts[0].flatWeeks, null);
});

test("a lift with no new best for weeks is flat", () => {
  const sets = [set("a", "sq", 40, 120), set("b", "sq", 20, 100), set("c", "sq", 5, 100)];
  const lift = mainLifts(sets, () => "back-squat", NOW)[0];
  assert.equal(lift.flatWeeks, 5);
});

test("needs attention names the most stalled lift", () => {
  const sets = [set("a", "sq", 30, 120), set("b", "sq", 22, 100), set("c", "sq", 15, 100), set("d", "sq", 8, 100), set("e", "sq", 1, 100)];
  assert.equal(needsAttention(sets, "lb", NOW)?.exerciseId, "sq");
  assert.equal(needsAttention([set("a", "sq", 1, 100)], "lb", NOW), null);
});
