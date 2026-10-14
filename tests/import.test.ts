import { test } from "node:test";
import assert from "node:assert/strict";
import { ImportRequest, matchByName, normalizeName, toImportedWorkout, type LibraryExercise, type ParsedImport } from "../supabase/functions/_shared/import.ts";

const lib = (slug: string, name: string, aliases: string[] = [], created_by: string | null = null): LibraryExercise => ({
  id: `${created_by ? "mine-" : ""}${slug}`, slug, name, aliases, equipment: "barbell", created_by,
});
const library = [
  lib("barbell-bench-press", "Barbell Bench Press", ["Bench Press"]),
  lib("dumbbell-row", "Dumbbell Row", ["One-Arm Dumbbell Row"]),
  lib("romanian-deadlift", "Romanian Deadlift"),
  lib("pull-up", "Pull Up"),
  lib("barbell-curl", "Barbell Curl"),
];

test("gym shorthand is spelled out", () => {
  assert.deepEqual(normalizeName("DB Rows"), ["dumbbell", "row"]);
  assert.deepEqual(normalizeName("RDL"), ["romanian", "deadlift"]);
});

test("names from other apps match the library, near misses don't", () => {
  assert.equal(matchByName("Bench Press (Barbell)", library)?.slug, "barbell-bench-press");
  assert.equal(matchByName("DB Row", library)?.slug, "dumbbell-row");
  assert.equal(matchByName("rdl", library)?.slug, "romanian-deadlift");
  assert.equal(matchByName("Pullups", library)?.slug, "pull-up");
  assert.equal(matchByName("Incline Dumbbell Curl", library), null);
  assert.equal(matchByName("", library), null);
});

test("request needs a photo or text, and caps image count", () => {
  assert.equal(ImportRequest.safeParse({}).success, false);
  assert.equal(ImportRequest.safeParse({ text: "  " }).success, false);
  assert.equal(ImportRequest.safeParse({ text: "bench 3x5 225" }).success, true);
  const img = { media_type: "image/jpeg", data: "x".repeat(100) };
  assert.equal(ImportRequest.safeParse({ images: [img] }).success, true);
  assert.equal(ImportRequest.safeParse({ images: Array(9).fill(img) }).success, false);
  assert.equal(ImportRequest.safeParse({ images: [{ ...img, media_type: "image/heic" }] }).success, false);
});

const parsed: ParsedImport = {
  is_workout: true,
  title: "  Push day ",
  date: "2026-10-12",
  start_time: "7:05",
  duration_minutes: 62,
  unit: "lb",
  notes: "felt good",
  exercises: [
    {
      name_as_written: "Bench Press (Barbell)",
      slug: "barbell-bench-press",
      notes: "",
      sets: [
        { weight: 135, unit: null, reps: 10, set_type: "warmup", rpe: null },
        { weight: 225, unit: null, reps: 5, set_type: "normal", rpe: 8.3 },
        { weight: 100, unit: "kg", reps: 5, set_type: "failure", rpe: 14 },
        { weight: null, unit: null, reps: null, set_type: "normal", rpe: null },
      ],
    },
    { name_as_written: "DB Row", slug: "made-up-slug", notes: "", sets: [{ weight: 70, unit: null, reps: 12, set_type: "normal", rpe: null }] },
    { name_as_written: "Cable Crossover", slug: null, notes: "", sets: [{ weight: 30, unit: null, reps: 15, set_type: "drop", rpe: null }] },
    { name_as_written: "Stretching", slug: null, notes: "", sets: [] },
    { name_as_written: "Pull Up", slug: "pull-up", notes: "", sets: [{ weight: null, unit: null, reps: 8, set_type: "normal", rpe: null }, { weight: -5, unit: null, reps: 2000, set_type: "normal", rpe: null }] },
  ],
};

test("Claude's answer becomes kg sets, matched and clamped", () => {
  const w = toImportedWorkout(parsed, { library, unit: "metric", today: "2026-10-14" });
  assert.equal(w.title, "Push day");
  assert.equal(w.date, "2026-10-12");
  assert.equal(w.start_time, "07:05");
  assert.equal(w.duration_minutes, 62);
  assert.equal(w.source_unit, "lb");
  assert.equal(w.exercises.length, 4, "the exercise with no sets is dropped");

  const [bench, row, cable, pull] = w.exercises;
  assert.equal(bench.exercise_id, "barbell-bench-press");
  assert.equal(bench.match, "claude");
  assert.equal(bench.sets.length, 3, "empty set dropped");
  assert.equal(Math.round(bench.sets[1].weight_kg * 10) / 10, 102.1); // 225 lb
  assert.equal(bench.sets[0].set_type, "warmup");
  assert.equal(bench.sets[1].rpe, 8.5);
  assert.equal(bench.sets[2].weight_kg, 100, "a set marked kg stays kg");
  assert.equal(bench.sets[2].rpe, null, "impossible RPE dropped");

  assert.equal(row.exercise_id, "dumbbell-row", "unknown slug falls back to the name");
  assert.equal(row.match, "name");
  assert.equal(cable.exercise_id, null);
  assert.equal(cable.match, "none");
  assert.equal(pull.sets[0].weight_kg, 0);
  assert.equal(pull.sets[1].weight_kg, 0);
  assert.equal(pull.sets[1].reps, 999);
});

test("bad dates and times are left for the lifter to pick", () => {
  const ctx = { library, unit: "imperial" as const, today: "2026-10-14" };
  for (const date of ["2026-10-20", "2026-02-30", "Oct 12", null]) {
    assert.equal(toImportedWorkout({ ...parsed, date }, ctx).date, null, String(date));
  }
  assert.equal(toImportedWorkout({ ...parsed, start_time: "25:00" }, ctx).start_time, null);
  assert.equal(toImportedWorkout({ ...parsed, duration_minutes: 0 }, ctx).duration_minutes, null);
});

test("unknown unit uses the lifter's own unit", () => {
  const one = { ...parsed, unit: "unknown" as const, exercises: [parsed.exercises[1]] };
  assert.equal(Math.round(toImportedWorkout(one, { library, unit: "imperial", today: "2026-10-14" }).exercises[0].sets[0].weight_kg), 32);
  assert.equal(toImportedWorkout(one, { library, unit: "metric", today: "2026-10-14" }).exercises[0].sets[0].weight_kg, 70);
});

test("your own exercise wins over the built-in one", () => {
  const mine = [...library, lib("barbell-bench-press", "Barbell Bench Press", [], "me")];
  const w = toImportedWorkout(parsed, { library: mine, unit: "metric", today: "2026-10-14" });
  assert.equal(w.exercises[0].exercise_id, "mine-barbell-bench-press");
});
