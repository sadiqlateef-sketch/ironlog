import { test } from "node:test";
import assert from "node:assert/strict";
import { roundLoadKg } from "../supabase/functions/_shared/units.ts";
import { programSchema, toRoutineRows, toProgramWorkouts, PlanRequest, type Program } from "../supabase/functions/_shared/program.ts";
import { clampSuggestion, ruleFor, type Target } from "../supabase/functions/_shared/adjust.ts";

const kgOf = (lb: number) => lb / 2.2046226218;
const lbOf = (kg: number) => Math.round(kg * 2.2046226218 * 10) / 10;

test("loads round to 5 lb or 2.5 kg", () => {
  assert.equal(lbOf(roundLoadKg(kgOf(227), "imperial")), 225);
  assert.equal(roundLoadKg(101.4, "metric"), 102.5);
  assert.equal(roundLoadKg(-3, "metric"), 0);
});

test("plan request validation rejects junk", () => {
  assert.equal(PlanRequest.safeParse({ goal: "strength", methodology: "531", days_per_week: 9, session_minutes: 60, experience: "beginner", equipment: [] }).success, false);
  const ok = PlanRequest.parse({ goal: "strength", methodology: "531", days_per_week: 4, session_minutes: 60, experience: "intermediate", equipment: ["barbell"] });
  assert.equal(ok.notes, "");
  assert.equal(ok.weeks, 8, "older apps that don't send weeks get 8");
  assert.equal(PlanRequest.safeParse({ ...ok, weeks: 40 }).success, false);
});

test("program schema tolerates one unknown slug instead of failing the plan", () => {
  const schema = programSchema(["bench-press", "back-squat"]);
  const day = { name: "D1", focus: "x", exercises: [{ slug: "made-up", sets: 3, reps_min: 5, reps_max: null, warmup_sets: 0, rest_seconds: 120, intensity_type: "none", intensity_value: null, superset_group: null, notes: "", sets_by_week: [3], reps_by_week: [5], intensity_by_week: [null] }] };
  assert.equal(schema.safeParse({ program_name: "p", methodology: "m", summary: "s", progression_rule: "r", days: [day] }).success, true);
  assert.match(JSON.stringify(schema.toJSONSchema?.() ?? ""), /bench-press|^""$/);
});

const program: Program = {
  program_name: "Test", methodology: "5/3/1", summary: "s", progression_rule: "r",
  days: [{
    name: "Day 1", focus: "Bench",
    exercises: [
      { slug: "bench-press", sets: 3, reps_min: 5, reps_max: null, warmup_sets: 2, rest_seconds: 180, intensity_type: "percent_1rm", intensity_value: 77, superset_group: null, notes: "AMRAP last set", sets_by_week: [], reps_by_week: [], intensity_by_week: [] },
      { slug: "back-squat", sets: 40, reps_min: 0, reps_max: 99, warmup_sets: 12, rest_seconds: 5000, intensity_type: "percent_1rm", intensity_value: 130, superset_group: null, notes: "", sets_by_week: [], reps_by_week: [], intensity_by_week: [] },
      { slug: "dip", sets: 3, reps_min: 8, reps_max: 12, warmup_sets: 0, rest_seconds: 90, intensity_type: "rpe", intensity_value: 8.3, superset_group: 1, notes: "", sets_by_week: [], reps_by_week: [], intensity_by_week: [] },
      { slug: "unknown", sets: 3, reps_min: 8, reps_max: 12, warmup_sets: 0, rest_seconds: 90, intensity_type: "none", intensity_value: null, superset_group: null, notes: "", sets_by_week: [], reps_by_week: [], intensity_by_week: [] },
    ],
  }],
};

test("percentages become real weights from your max; junk is clamped", () => {
  const [day] = toRoutineRows(program, {
    unit: "imperial",
    exerciseIds: new Map([["bench-press", "b"], ["back-squat", "s"], ["dip", "d"]]),
    e1rmBySlug: new Map([["bench-press", kgOf(300)]]),
  });
  assert.equal(day.rows.length, 3, "unknown exercise dropped");
  const [bench, squat, dip] = day.rows;
  assert.equal(lbOf(bench.target_weight_kg!), 230); // 77% of 300 = 231 -> 230
  assert.equal(bench.target_percent_1rm, 77);
  // Squat: no max on record -> RPE instead; sets/reps/rest clamped
  assert.equal(squat.target_weight_kg, null);
  assert.equal(squat.target_rpe, 8.5);
  assert.equal(squat.target_sets, 10);
  assert.equal(squat.target_reps, 1);
  assert.equal(squat.target_reps_max, 50);
  assert.equal(squat.warmup_sets, 5);
  assert.equal(squat.rest_seconds, 600);
  assert.equal(dip.target_rpe, 8.5);
  assert.equal(dip.superset_group, 1);
  assert.deepEqual(day.rows.map((r) => r.position), [1, 2, 3]);
});

const bench: Target = {
  routine_exercise_id: "re1", exercise_name: "Bench Press", is_lower_body: false,
  target_sets: 3, target_reps: 8, target_reps_max: 10, target_weight_kg: kgOf(185),
};

test("rule: top of range on every set -> increase", () => {
  const r = ruleFor(bench, [10, 10, 10].map((reps) => ({ weight: kgOf(185), reps })), "imperial");
  assert.equal(r.action, "increase");
  assert.equal(lbOf(r.suggested_weight_kg!), 190);
});

test("rule: in range -> no change needed", () => {
  const r = ruleFor(bench, [9, 8, 8].map((reps) => ({ weight: kgOf(185), reps })), "imperial");
  assert.equal(r.action, "hold");
  assert.equal(r.suggested_weight_kg, null);
});

test("rule: small miss -> hold weight; big miss -> deload ~10%", () => {
  const small = ruleFor(bench, [8, 7, 6].map((reps) => ({ weight: kgOf(185), reps })), "imperial");
  assert.equal(small.action, "hold");
  assert.equal(lbOf(small.suggested_weight_kg!), 185);
  const big = ruleFor(bench, [6, 5, 4].map((reps) => ({ weight: kgOf(185), reps })), "imperial");
  assert.equal(big.action, "deload");
  assert.equal(lbOf(big.suggested_weight_kg!), 165);
  const quit = ruleFor(bench, [{ weight: kgOf(185), reps: 8 }], "imperial");
  assert.equal(quit.action, "deload");
});

test("rule: how hard the sets felt changes the call", () => {
  // Hit the top of the range, but the last set was all-out: hold first.
  const grind = ruleFor(bench, [10, 10, 10].map((reps, i) => ({ weight: kgOf(185), reps, rpe: i === 2 ? 10 : 9 })), "imperial");
  assert.equal(grind.action, "hold");
  assert.equal(lbOf(grind.suggested_weight_kg!), 185);
  assert.match(grind.facts, /10 @ RPE 10/);
  // In range with 3+ reps left on every set: go up even below the top.
  const easy = ruleFor(bench, [9, 9, 8].map((reps) => ({ weight: kgOf(185), reps, rpe: 7 })), "imperial");
  assert.equal(easy.action, "increase");
  assert.equal(lbOf(easy.suggested_weight_kg!), 190);
  // Not every set rated: the plain rule decides.
  const partly = ruleFor(bench, [9, 9, 8].map((reps, i) => ({ weight: kgOf(185), reps, rpe: i ? null : 6 })), "imperial");
  assert.equal(partly.action, "hold");
  assert.equal(partly.suggested_weight_kg, null);
});

test("clamp: Claude can't jump more than +10% / -20%, and a deload must go down", () => {
  const rule = ruleFor(bench, [6, 5, 4].map((reps) => ({ weight: kgOf(185), reps })), "imperial");
  const wild = clampSuggestion({ routine_exercise_id: "re1", action: "deload", suggested_weight_kg: kgOf(50), suggested_reps: 3, suggested_reps_max: 2, reason: " Go light. " }, rule, "imperial");
  assert.equal(lbOf(wild.suggested_weight_kg!), 150); // 80% of 185 = 148 -> 150
  assert.equal(wild.suggested_reps, null, "reps only change on adjust_reps");
  assert.equal(wild.reason, "Go light.");
  const up = clampSuggestion({ routine_exercise_id: "re1", action: "deload", suggested_weight_kg: kgOf(200), suggested_reps: null, suggested_reps_max: null, reason: "x" }, rule, "imperial");
  assert.equal(lbOf(up.suggested_weight_kg!), 165, "a 'deload' that goes up falls back to the rule");
  const reps = clampSuggestion({ routine_exercise_id: "re1", action: "adjust_reps", suggested_weight_kg: kgOf(185), suggested_reps: 6, suggested_reps_max: 8, reason: "x" }, rule, "imperial");
  assert.deepEqual([reps.suggested_reps, reps.suggested_reps_max], [6, 8]);
});

test("a program maps out every week: same exercises, the load moves", () => {
  const p: Program = {
    program_name: "5/3/1", methodology: "5/3/1", summary: "s", progression_rule: "r",
    days: [
      { name: "Day 1 - Bench", focus: "Bench", exercises: [
        { slug: "bench-press", sets: 3, reps_min: 5, reps_max: null, warmup_sets: 2, rest_seconds: 180, intensity_type: "percent_1rm", intensity_value: 65, superset_group: null, notes: "",
          sets_by_week: [3, 3, 3, 3], reps_by_week: [5, 3, 1, 5], intensity_by_week: [65, 70, 76, 40] },
        { slug: "dip", sets: 3, reps_min: 8, reps_max: 12, warmup_sets: 0, rest_seconds: 90, intensity_type: "rpe", intensity_value: 7, superset_group: null, notes: "",
          sets_by_week: [3, 4], reps_by_week: [8, 10], intensity_by_week: [7, null] },
      ] },
      { name: "Day 2 - Squat", focus: "Squat", exercises: [
        { slug: "back-squat", sets: 5, reps_min: 5, reps_max: null, warmup_sets: 2, rest_seconds: 180, intensity_type: "rpe", intensity_value: 8, superset_group: null, notes: "",
          sets_by_week: [], reps_by_week: [], intensity_by_week: [] },
      ] },
    ],
  };
  const ws = toProgramWorkouts(p, {
    unit: "imperial",
    exerciseIds: new Map([["bench-press", "b"], ["dip", "d"], ["back-squat", "s"]]),
    e1rmBySlug: new Map([["bench-press", kgOf(300)]]),
  }, 6, 2);
  assert.equal(ws.length, 12, "6 weeks x 2 days");
  assert.deepEqual(ws.slice(0, 3).map((w) => [w.week, w.day]), [[1, 1], [1, 2], [2, 1]]);
  const bench = (week: number) => ws.find((w) => w.week === week && w.day === 1)!.rows[0];
  assert.deepEqual([1, 2, 3, 4].map((w) => lbOf(bench(w).target_weight_kg!)), [195, 210, 230, 120]); // deload in week 4
  assert.deepEqual([1, 2, 3, 4].map((w) => bench(w).target_reps), [5, 3, 1, 5]);
  assert.deepEqual([5, 6].map((w) => lbOf(bench(w).target_weight_kg!)), [195, 210], "a short plan repeats as a wave, not stuck on the deload");
  const dip = (week: number) => ws.find((w) => w.week === week && w.day === 1)!.rows[1];
  assert.equal(dip(2).target_sets, 4);
  assert.deepEqual([dip(2).target_reps, dip(2).target_reps_max], [10, 14], "rep range keeps its width");
  assert.equal(dip(2).target_rpe, 7, "a null week keeps the base intensity");
  assert.ok(ws.every((w) => w.rows.every((r) => r.exercise_id === (w.day === 1 ? r.exercise_id : "s"))));
  // No per-week plan at all: every week is week 1.
  assert.equal(ws.filter((w) => w.day === 2).every((w) => w.rows[0].target_sets === 5), true);
});
