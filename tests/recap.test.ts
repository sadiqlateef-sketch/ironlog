import { test } from "node:test";
import assert from "node:assert/strict";
import { factsPrompt, RecapRequest, recapFacts, rulesRecap, tidyRecap, weekStartInstant } from "../supabase/functions/_shared/recap.ts";

const DAY = 86_400_000;
// Monday 12 Oct 2026, Eastern time (UTC-4 => getTimezoneOffset() = 240)
const START = weekStartInstant("2026-10-12", 240);
const sess = (id: string, dayOffset: number, volume = 2000) => ({
  id, name: "W", start: START + dayOffset * DAY + 18 * 3600_000, end: START + dayOffset * DAY + 19 * 3600_000, volume_kg: volume,
});
const set = (session_id: string, exercise: string, muscle: string, weight_kg: number, reps: number, rpe: number | null = null, set_type = "normal") => ({
  session_id, exercise, muscle, weight_kg, reps, rpe, set_type,
});

test("week start is local midnight Monday", () => {
  assert.equal(new Date(START).toISOString(), "2026-10-12T04:00:00.000Z");
  assert.equal(RecapRequest.safeParse({ week_start: "2026-10-12", tz_offset_min: 240 }).success, true);
  assert.equal(RecapRequest.safeParse({ week_start: "Oct 12", tz_offset_min: 240 }).success, false);
});

test("recap facts: this week, last week, records, missing areas", () => {
  const sessions = [sess("old", -14), sess("prev", -5, 1500), sess("mon", 0), sess("thu", 3, 3000)];
  const sets = [
    set("old", "Bench Press", "chest", 100, 5),
    set("prev", "Bench Press", "chest", 100, 5),
    set("mon", "Bench Press", "chest", 105, 5, 8),
    set("mon", "Bench Press", "chest", 60, 5, null, "warmup"),
    set("thu", "Back Squat", "quads", 140, 5, 9),
    set("thu", "Barbell Row", "upper_back", 80, 8),
  ];
  const f = recapFacts(sessions, sets, START, "imperial");
  assert.equal(f.workouts, 2);
  assert.equal(f.sets, 3);
  assert.equal(f.minutes, 120);
  assert.equal(f.volume_kg, 5000);
  assert.equal(f.prev_workouts, 1);
  assert.equal(f.avg_workouts_4w, 0.5);
  assert.equal(f.avg_rpe, 8.5);
  assert.deepEqual(f.days, ["Monday", "Thursday"]);
  assert.deepEqual(f.missing_groups, ["Shoulders", "Arms"]);
  assert.deepEqual(f.records.map((r) => r.exercise), ["Bench Press"], "first-ever lifts aren't records");
  assert.equal(f.top_lifts[0].exercise, "Back Squat");
  const p = factsPrompt(f);
  assert.match(p, /Bench Press 231.5 lb x 5/);
  assert.match(p, /No sets this week for: Shoulders, Arms/);
});

test("rule-based recap covers rest weeks and normal weeks", () => {
  const rest = rulesRecap(recapFacts([sess("prev", -5)], [], START, "metric"));
  assert.match(rest.headline, /rest week/i);
  assert.ok(rest.next_week.length >= 1);

  const f = recapFacts([sess("prev", -5), sess("mon", 0)], [set("prev", "Bench Press", "chest", 100, 5), set("mon", "Bench Press", "chest", 102.5, 5)], START, "metric");
  const r = rulesRecap(f);
  assert.match(r.headline, /1 new record/);
  assert.equal(r.wins[0], "New best on Bench Press: 102.5 kg × 5.");
  assert.ok(r.next_week.length <= 3);
});

test("tidyRecap trims Claude's lists", () => {
  const t = tidyRecap({ headline: " Hi ", wins: ["a", "b", "c", "d"], watch_outs: ["", "x", "y", "z"], next_week: ["n"] });
  assert.equal(t.headline, "Hi");
  assert.equal(t.wins.length, 3);
  assert.deepEqual(t.watch_outs, ["x", "y"]);
});
