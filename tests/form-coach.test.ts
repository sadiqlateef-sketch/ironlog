import { test } from "node:test";
import assert from "node:assert/strict";
import { getFormCues } from "../src/lib/form-coach.ts";

test("getFormCues identifies squat pattern and returns depth checklist", () => {
  const cues = getFormCues({ name: "Barbell Back Squat", slug: "barbell-back-squat" });
  assert.equal(cues.category, "squat");
  assert.equal(cues.recommendedTempo, "3-1-1-0");
  assert.ok(cues.targetDepthOrRom.includes("below parallel"));
  assert.ok(cues.checkpoints.length >= 3);
  assert.ok(cues.commonFaults.some((f) => f.fault.includes("Knee Cave")));
});

test("getFormCues identifies bench press pattern and returns scapular retraction cues", () => {
  const cues = getFormCues({ name: "Incline Dumbbell Bench Press", slug: "incline-db-bench" });
  assert.equal(cues.category, "bench");
  assert.equal(cues.recommendedTempo, "2-1-1-0");
  assert.ok(cues.checkpoints.some((c) => c.title.includes("Scapular Retraction")));
});

test("getFormCues identifies deadlift and overhead press patterns", () => {
  const dl = getFormCues({ name: "Romanian Deadlift", slug: "rdl" });
  assert.equal(dl.category, "deadlift");

  const ohp = getFormCues({ name: "Standing Overhead Press", slug: "overhead-press" });
  assert.equal(ohp.category, "overhead_press");
});

test("getFormCues falls back gracefully to generic cues for unlisted accessories", () => {
  const cues = getFormCues({ name: "Standing Calf Raise", slug: "standing-calf-raise" });
  assert.equal(cues.category, "generic");
  assert.ok(cues.checkpoints.length > 0);
  assert.ok(cues.commonFaults.length > 0);
});
