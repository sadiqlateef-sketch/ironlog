import { test } from "node:test";
import assert from "node:assert/strict";
import { activeKit, defaultHomeKit, describeKit, kitAllows, kitsOf, maxBarbellKg, needsOf, normalizeKit } from "../src/lib/kit.ts";
import { calculatePlates, kitPlates } from "../src/lib/plates.ts";
import { buildHomeWorkout, nightSeed, surprise, swapHomeItem, blockMinutes, HOME_FOCUS } from "../src/lib/home-workout.ts";
import { smartSwaps } from "../src/lib/workout-logic.ts";
import { heaviness, planWeek, readiness, tidyShifts, type Shift } from "../src/lib/shifts.ts";
import { isDue } from "../supabase/functions/_shared/google.ts";

const lbOf = (kg: number) => Math.round(kg * 2.2046226218 * 2) / 2;
const ex = (slug: string, equipment: string, primary_muscle = "quads", extra: Record<string, unknown> = {}) => ({
  id: slug,
  slug,
  name: slug,
  equipment,
  primary_muscle,
  secondary_muscles: [] as string[],
  mechanic: "compound",
  created_by: null,
  aliases: [] as string[],
  ...extra,
});

const profile = { bar_weight_kg: 20.412, available_plates_kg: [20.412, 11.34], training_equipment: ["barbell", "machine"], equipment_kits: [], active_kit_id: null };

test("without saved kits you get your gym from the old bar and plates settings", () => {
  const kits = kitsOf(profile);
  assert.equal(kits.length, 1);
  assert.equal(kits[0].kind, "gym");
  assert.deepEqual(kits[0].equipment, ["barbell", "machine"]);
  assert.equal(activeKit(profile).id, "gym");
  assert.deepEqual(kitPlates(kits[0], "imperial"), { bar: 45, plates: [45, 25] });
});

test("a saved home kit sits next to the gym, and the active one is used", () => {
  const p = { ...profile, equipment_kits: [defaultHomeKit("h1")], active_kit_id: "h1" };
  assert.deepEqual(kitsOf(p).map((k) => k.id), ["gym", "h1"]);
  assert.equal(activeKit(p).id, "h1");
  assert.equal(normalizeKit({ id: "x", kind: "home", plates: [{ kg: -1, count: 2 }, { kg: 5, count: 0 }] })!.plates.length, 0, "junk weights are dropped");
});

test("Sadiq's home kit: one 20 and one 40 lb dumbbell, a standard bar and 100 lb of plates", () => {
  const home = defaultHomeKit();
  assert.equal(lbOf(maxBarbellKg(home)!), 115, "15 lb bar + 100 lb of plates");
  assert.equal(kitAllows(ex("dumbbell-row", "dumbbell"), home), true, "one-arm row needs one dumbbell");
  assert.equal(kitAllows(ex("goblet-squat", "kettlebell"), home), true, "a dumbbell works for a goblet squat");
  assert.equal(kitAllows(ex("dumbbell-bench-press", "dumbbell"), home), false, "needs a pair and a bench");
  assert.equal(kitAllows(ex("lateral-raise", "dumbbell"), home), false, "needs a pair");
  assert.equal(kitAllows(ex("back-squat", "barbell"), home), false, "no squat rack");
  assert.equal(kitAllows(ex("romanian-deadlift", "barbell"), home), true);
  assert.equal(kitAllows(ex("floor-press", "barbell"), home), true);
  assert.equal(kitAllows(ex("pull-up", "bodyweight"), home), false, "no pull-up bar");
  assert.equal(kitAllows(ex("pushups", "bodyweight"), home), true);
  assert.equal(kitAllows(ex("leg-press", "machine"), home), false);
  assert.match(describeKit(home, "imperial"), /single dumbbells only.*barbell loads up to 115 lb.*no bench/);
});

test("what exercises need", () => {
  assert.deepEqual(needsOf(ex("bench-press", "barbell")), ["bench", "rack"]);
  assert.deepEqual(needsOf(ex("conventional-deadlift", "barbell")), []);
  assert.deepEqual(needsOf(ex("chin-up", "bodyweight")), ["pullup_bar"]);
  assert.deepEqual(needsOf(ex("hammer-curls", "dumbbell")), ["two_dumbbells"]);
});

test("marking an exercise missing hides it at that place", () => {
  const gym = { ...kitsOf(profile)[0], missing: ["leg-press"] };
  assert.equal(kitAllows(ex("leg-press", "machine"), gym), false);
  assert.equal(kitAllows(ex("hack-squat", "machine"), gym), true);
});

test("plate calculator with only a few of each plate finds the closest load", () => {
  // Home set in lb: 2x25, 4x10, 2x5 on a 15 lb bar.
  const { bar, plates, pairs } = kitPlates(defaultHomeKit(), "imperial");
  assert.equal(bar, 15);
  assert.deepEqual(plates, [25, 10, 5]);
  assert.deepEqual(pairs, [1, 2, 1]);
  assert.deepEqual(calculatePlates(95, bar, plates, pairs).perSide, [25, 10, 5]);
  const r = calculatePlates(135, bar, plates, pairs);
  assert.equal(r.achieved, 115, "everything you own");
  assert.equal(r.remainder, 20);
  // Greedy would take one 25 and get stuck; with two 20s the exact mix is found.
  assert.deepEqual(calculatePlates(85, 5, [25, 20], [1, 2]).perSide, [20, 20]);
  // Without counts it's the old greedy calculator.
  assert.deepEqual(calculatePlates(225, 45, [45, 25, 10, 5, 2.5]).perSide, [45, 45]);
});

const library = [
  ex("goblet-squat", "kettlebell", "quads"),
  ex("bulgarian-split-squat", "dumbbell", "quads"),
  ex("dumbbell-rear-lunge", "dumbbell", "quads"),
  ex("romanian-deadlift", "barbell", "hamstrings"),
  ex("stiff-legged-dumbbell-deadlift", "dumbbell", "hamstrings"),
  ex("pushups", "bodyweight", "chest"),
  ex("floor-press", "barbell", "triceps"),
  ex("overhead-press", "barbell", "front_delts"),
  ex("dumbbell-one-arm-shoulder-press", "dumbbell", "front_delts"),
  ex("dumbbell-row", "dumbbell", "lats"),
  ex("barbell-row", "barbell", "upper_back"),
  ex("plank", "bodyweight", "abs", { tracking: "time" }),
  ex("dead-bug", "bodyweight", "abs"),
  ex("barbell-curl", "barbell", "biceps"),
  ex("concentration-curls", "dumbbell", "biceps"),
  ex("standing-dumbbell-triceps-extension", "dumbbell", "triceps"),
  ex("back-squat", "barbell", "quads"),
  ex("lateral-raise", "dumbbell", "side_delts"),
  ex("leg-press", "machine", "quads"),
];

test("home workout uses only the kit and fits the time", () => {
  const home = defaultHomeKit();
  for (const minutes of [15, 20, 25]) {
    for (const focus of Object.keys(HOME_FOCUS) as (keyof typeof HOME_FOCUS)[]) {
      const w = buildHomeWorkout(library, home, { minutes, focus }, nightSeed("2026-10-18"));
      assert.ok(w.items.length >= 2, `${minutes} ${focus} has exercises`);
      assert.ok(w.items.every((i) => kitAllows(i.exercise, home)), "everything is doable at home");
      assert.ok(!w.items.some((i) => ["back-squat", "lateral-raise", "leg-press"].includes(i.exercise.slug)));
      assert.ok(w.minutes <= minutes + 1, `${minutes} min ${focus} took ${w.minutes}`);
      assert.equal(new Set(w.items.map((i) => i.exercise.slug)).size, w.items.length, "no repeats");
    }
  }
  const w = buildHomeWorkout(library, home, { minutes: 20, focus: "lower" }, 1);
  const squat = w.items.find((i) => i.exercise.slug === "goblet-squat" || i.exercise.slug === "bulgarian-split-squat");
  if (squat) assert.equal(lbOf(squat.dumbbell_kg!), 40, "legs get the heavy dumbbell");
  assert.ok(w.items.some((i) => i.group != null), "short workouts use supersets");
});

test("same workout all night, a different one tomorrow", () => {
  const home = defaultHomeKit();
  const a = buildHomeWorkout(library, home, { minutes: 25, focus: "full" }, nightSeed("2026-10-18"));
  const b = buildHomeWorkout(library, home, { minutes: 25, focus: "full" }, nightSeed("2026-10-18"));
  assert.deepEqual(a.items.map((i) => i.exercise.slug), b.items.map((i) => i.exercise.slug));
  const nights = new Set(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"].map((d) => buildHomeWorkout(library, home, { minutes: 25, focus: "full" }, nightSeed(d)).items.map((i) => i.exercise.slug).join()));
  assert.ok(nights.size > 1, "it changes across nights");
  const s = surprise(nightSeed("2026-10-18"));
  assert.ok([15, 20, 25].includes(s.minutes) && s.focus in HOME_FOCUS);
  assert.equal(blockMinutes([{ sets: 3, rest: 60 }]), (60 + 120 + 120) / 60);
});

test("swapping a home exercise stays in the kit", () => {
  const home = defaultHomeKit();
  const w = buildHomeWorkout(library, home, { minutes: 20, focus: "full" }, 3);
  const first = w.items[0];
  const next = swapHomeItem(first, library, home, new Set(w.items.map((i) => i.exercise.slug)));
  assert.ok(next && next.exercise.slug !== first.exercise.slug && kitAllows(next.exercise, home));
});

test("smart swaps: same muscles, equipment you have, not already in the workout", () => {
  const cur = { ...ex("leg-press", "machine", "quads"), secondary_muscles: ["glutes"] };
  const all = [
    { ...ex("hack-squat", "machine", "quads"), secondary_muscles: ["glutes"] },
    { ...ex("back-squat", "barbell", "quads"), secondary_muscles: ["glutes", "adductors", "lower_back"] },
    { ...ex("goblet-squat", "kettlebell", "quads"), secondary_muscles: ["glutes"] },
    { ...ex("leg-curl", "machine", "hamstrings"), mechanic: "isolation" },
  ];
  assert.equal(smartSwaps(cur, all)[0].slug, "hack-squat", "closest muscles and same equipment first");
  assert.deepEqual(smartSwaps(cur, all, { exclude: new Set(["hack-squat"]) }).map((e) => e.slug)[0], "back-squat");
  const home = defaultHomeKit();
  assert.deepEqual(smartSwaps(cur, all, { allowed: (e) => kitAllows(e, home) }).map((e) => e.slug), ["goblet-squat"]);
});

const shifts: Shift[] = [
  { date: "2026-10-19", type: "day", start: "07:00", end: "19:30" },
  { date: "2026-10-20", type: "day", start: "07:00", end: "19:30" },
  { date: "2026-10-22", type: "night", start: "19:00", end: "07:30" },
];

test("readiness around shifts", () => {
  assert.equal(readiness("2026-10-18", shifts).kind, "off");
  assert.equal(readiness("2026-10-19", shifts).kind, "day");
  assert.equal(readiness("2026-10-22", shifts).kind, "pre-night");
  assert.equal(readiness("2026-10-23", shifts).kind, "post-night");
});

test("heavy days land on days off, never the morning after a night shift", () => {
  const days = [
    { id: "squat", heaviness: heaviness([{ target_sets: 5, target_reps: 5, equipment: "barbell" }, { target_sets: 3, target_reps: 8, equipment: "machine" }]) },
    { id: "bench", heaviness: heaviness([{ target_sets: 5, target_reps: 5, equipment: "barbell" }]) },
    { id: "arms", heaviness: heaviness([{ target_sets: 3, target_reps: 12, equipment: "dumbbell" }]) },
  ];
  // Sunday 18th: off, Mon/Tue day shifts, Wed off, Thu night, Fri post-night, Sat off.
  const { slots, unplaced } = planWeek(days, shifts, "2026-10-18");
  const on = (id: string) => slots.find((s) => s.dayId === id)!;
  assert.deepEqual(unplaced, []);
  for (const id of ["squat", "bench"]) assert.equal(on(id).readiness.kind, "off", `${id} on a day off`);
  assert.notEqual(on("arms").readiness.kind, "post-night");
  assert.ok(!slots.some((s) => s.dayId && s.readiness.kind === "post-night"));
  assert.ok(on("squat").heavy);
  // Trained today already: nothing goes on today.
  assert.equal(planWeek(days, shifts, "2026-10-18", { skipToday: true }).slots[0].dayId, null);
});

test("old shifts are trimmed and one per day is kept", () => {
  const t = tidyShifts([{ date: "2026-09-01", type: "day", start: "", end: "" }, ...shifts, { ...shifts[0], type: "night" }], "2026-10-18");
  assert.equal(t.length, 3);
  assert.equal(t[0].type, "night");
});

test("calendar: home workouts you said yes to go on; no means no", () => {
  const base = { start_time: "2026-10-18T00:00:00Z", end_time: "2026-10-18T00:20:00Z" };
  assert.equal(isDue({ ...base, at_gym: null, add_to_calendar: true }), true, "20 min home workout, yes");
  assert.equal(isDue({ ...base, at_gym: null, add_to_calendar: false }), false);
  assert.equal(isDue({ ...base, at_gym: true, add_to_calendar: null }), false, "gym but only 20 min");
  assert.equal(isDue({ start_time: base.start_time, end_time: "2026-10-18T01:00:00Z", at_gym: true, add_to_calendar: null }), true);
  assert.equal(isDue({ start_time: base.start_time, end_time: "2026-10-18T01:00:00Z", at_gym: true, add_to_calendar: false }), false);
});
