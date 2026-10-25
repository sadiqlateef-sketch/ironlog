import { test } from "node:test";
import assert from "node:assert/strict";
import { capDeload, deloadInterval, deloadWeeks, DELOAD_NOTE, PlanRequest, toProgramWorkouts, type Program, type RoutineExerciseRow } from "../supabase/functions/_shared/program.ts";
import { earlyDeloadReason, isRough, judgeSession, needsEarlyDeload, ruleFor, type PlannedExercise } from "../supabase/functions/_shared/adjust.ts";

const kgOf = (lb: number) => lb / 2.2046226218;
const lbOf = (kg: number) => Math.round(kg * 2.2046226218 * 10) / 10;

test("deload interval follows the style and experience", () => {
  assert.equal(deloadInterval({ methodology: "531", experience: "beginner" }), 4);
  assert.equal(deloadInterval({ methodology: "sheiko", experience: "intermediate" }), 4);
  assert.equal(deloadInterval({ methodology: "rp", experience: "intermediate" }), 5);
  assert.equal(deloadInterval({ methodology: "linear", experience: "advanced" }), 6);
  assert.deepEqual(
    (["beginner", "intermediate", "advanced"] as const).map((experience) => deloadInterval({ methodology: "auto", experience })),
    [6, 5, 4],
  );
});

test("deload weeks: every interval-th week, none when off or too short", () => {
  const base = PlanRequest.parse({ goal: "strength", methodology: "531", days_per_week: 4, session_minutes: 60, experience: "intermediate", equipment: [] });
  assert.equal(base.deload, "auto", "older apps that don't send it get deloads");
  assert.deepEqual(deloadWeeks(base), [4, 8]);
  assert.deepEqual(deloadWeeks({ ...base, weeks: 12 }), [4, 8, 12]);
  assert.deepEqual(deloadWeeks({ ...base, weeks: 3 }), []);
  assert.deepEqual(deloadWeeks({ ...base, deload: "off" }), []);
  assert.deepEqual(deloadWeeks({ ...base, methodology: "rp", weeks: 12 }), [5, 10]);
  assert.equal(PlanRequest.safeParse({ ...base, deload: "sometimes" }).success, false);
});

const row = (over: Partial<RoutineExerciseRow> = {}): RoutineExerciseRow => ({
  exercise_id: "b", position: 1, superset_group: null, target_sets: 4, target_reps: 5, target_reps_max: null,
  target_weight_kg: kgOf(225), target_percent_1rm: 75, target_rpe: null, warmup_sets: 2, rest_seconds: 180, notes: "AMRAP last set",
  ...over,
});

test("a deload is always lighter than the week before, whatever Claude planned", () => {
  // Claude forgot the deload: same as last week.
  const d = capDeload(row(), row(), "imperial");
  assert.equal(d.target_sets, 2, "half the sets");
  assert.equal(lbOf(d.target_weight_kg!), 205, "90% of 225 rounded to 5 lb");
  assert.equal(d.target_percent_1rm, 67.5);
  assert.equal(d.notes, DELOAD_NOTE, "no AMRAP on a deload");
  // Claude planned a proper deload: keep its lighter numbers.
  const light = capDeload(row({ target_sets: 1, target_weight_kg: kgOf(135), target_percent_1rm: 45 }), row(), "imperial");
  assert.deepEqual([light.target_sets, lbOf(light.target_weight_kg!), light.target_percent_1rm], [1, 135, 45]);
  // RPE-based work tops out at RPE 7; odd set counts round up; never zero sets.
  const rpe = capDeload(row({ target_weight_kg: null, target_percent_1rm: null, target_rpe: 9, target_sets: 3 }), row({ target_sets: 3 }), "metric");
  assert.deepEqual([rpe.target_sets, rpe.target_rpe, rpe.target_weight_kg], [2, 7, null]);
  assert.equal(capDeload(row({ target_sets: 1 }), row({ target_sets: 1 }), "metric").target_sets, 1);
});

test("generated programs mark and lighten their deload weeks", () => {
  const p: Program = {
    program_name: "p", methodology: "m", summary: "s", progression_rule: "r",
    days: [{ name: "Day 1 - Bench", focus: "Bench", exercises: [
      // Claude ignored the deload: load keeps climbing through week 4.
      { slug: "bench-press", sets: 4, reps_min: 5, reps_max: null, warmup_sets: 2, rest_seconds: 180, intensity_type: "percent_1rm", intensity_value: 70, superset_group: null, notes: "",
        sets_by_week: [4, 4, 4, 4, 4], reps_by_week: [5, 5, 5, 5, 5], intensity_by_week: [70, 72.5, 75, 77.5, 72.5] },
    ] }],
  };
  const ws = toProgramWorkouts(p, { unit: "imperial", exerciseIds: new Map([["bench-press", "b"]]), e1rmBySlug: new Map([["bench-press", kgOf(300)]]) }, 5, 1, [4]);
  assert.deepEqual(ws.map((w) => w.is_deload), [false, false, false, true, false]);
  const w3 = ws[2].rows[0];
  const w4 = ws[3].rows[0];
  assert.equal(w4.target_sets, 2);
  assert.ok(w4.target_weight_kg! < w3.target_weight_kg!, "lighter than week 3");
  assert.equal(lbOf(w4.target_weight_kg!), 200, "90% of week 3's 225");
  assert.equal(ws[4].rows[0].target_sets, 4, "back to normal after");
});

test("judging a workout marks misses", () => {
  const t = { routine_exercise_id: "x", exercise_name: "Squat", is_lower_body: true, target_sets: 3, target_reps: 5, target_reps_max: null, target_weight_kg: kgOf(225) };
  assert.equal(ruleFor(t, [{ weight: kgOf(225), reps: 5 }, { weight: kgOf(225), reps: 5 }, { weight: kgOf(225), reps: 5 }], "imperial").missed, false);
  assert.equal(ruleFor(t, [{ weight: kgOf(225), reps: 5 }, { weight: kgOf(225), reps: 4 }, { weight: kgOf(225), reps: 4 }], "imperial").missed, true);
  assert.equal(ruleFor(t, [{ weight: kgOf(225), reps: 2 }], "imperial").missed, true);

  const plan: PlannedExercise[] = [
    { id: "re1", exercise_id: "sq", target_sets: 3, target_reps: 5, target_reps_max: null, target_weight_kg: "102.058", exercises: { name: "Squat", primary_muscle: "quads" } },
    { id: "re2", exercise_id: "rdl", target_sets: 3, target_reps: 8, target_reps_max: 10, target_weight_kg: null, exercises: { name: "RDL", primary_muscle: "hamstrings" } },
    { id: "re3", exercise_id: "curl", target_sets: 3, target_reps: 10, target_reps_max: null, target_weight_kg: null, exercises: null },
  ];
  const sets = [
    { exercise_id: "sq", exercise_order: 1, weight: "102.058", reps: 3 },
    { exercise_id: "sq", exercise_order: 1, weight: "102.058", reps: 3 },
    { exercise_id: "rdl", exercise_order: 2, weight: 60, reps: 9 },
    { exercise_id: "rdl", exercise_order: 2, weight: 60, reps: 9 },
    { exercise_id: "rdl", exercise_order: 2, weight: 60, reps: 9 },
  ];
  const judged = judgeSession(plan, sets, "metric");
  assert.equal(judged.length, 2, "skipped curls aren't judged");
  assert.deepEqual(judged.map((r) => r.missed), [true, false]);
  assert.equal(isRough(judged), true, "1 of 2 missed is rough");
  assert.equal(isRough([]), false);
});

test("early deload: two rough workouts out of the last three", () => {
  const rough = [{ missed: true }, { missed: false }];
  const fine = [{ missed: false }, { missed: false }, { missed: true }];
  assert.equal(needsEarlyDeload(rough, [rough]), true);
  assert.equal(needsEarlyDeload(rough, [fine, rough]), true);
  assert.equal(needsEarlyDeload(rough, [fine, fine, rough]), false, "only the last three count");
  assert.equal(needsEarlyDeload(rough, []), false, "one bad day is noise");
  assert.equal(needsEarlyDeload(fine, [rough, rough]), false, "today went fine");
  assert.match(earlyDeloadReason(rough, [fine, rough]), /2 of your last 3 workouts/);
  assert.match(earlyDeloadReason(rough, [rough]), /2 of your last 2 workouts/);
});
