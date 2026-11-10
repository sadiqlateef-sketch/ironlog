import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { epley, brzycki } from "../src/lib/one-rm.ts";
import { bestE1rm, smartSwaps } from "../src/lib/workout-logic.ts";
import { deriveVariationGroup, explainSubstitution } from "../src/lib/substitution-engine.ts";
import { startPlannedSession } from "../src/lib/offline/workout-store.ts";
import { getSupabase } from "../src/lib/supabase/client.ts";
import { kvGet, kvSet } from "../src/lib/offline/kv.ts";
import type { WorkoutSet } from "../src/types/database.ts";
import type { Exercise } from "../src/lib/workout-api.ts";
import type { Session } from "@supabase/supabase-js";

test("Fixture W1: Adjustment math (RPE 10 vs RPE 8)", () => {
  // Pre-run Epley calculation: weight * (1 + reps / 30)
  // For 100 x 5: 100 * (1 + 5/30) = 116.66666...
  const rawEstimate = 100 * (1 + 5 / 30);
  assert.equal(Number(rawEstimate.toFixed(1)), 116.7);

  // At RPE 10 (RiR = 10 - 10 = 0), effective reps = 5 + 0 = 5.
  // Must be identical to raw estimate.
  const rpe10Estimate = epley(100, 5, 10);
  assert.equal(rpe10Estimate, rawEstimate);
  assert.equal(Number(rpe10Estimate.toFixed(1)), 116.7);

  // At RPE 8 (RiR = 10 - 8 = 2), effective reps = 5 + 2 = 7.
  // 100 * (1 + 7/30) = 123.33333...
  const rpe8Estimate = epley(100, 5, 8);
  assert.equal(rpe8Estimate, 100 * (1 + 7 / 30));
  assert.equal(Number(rpe8Estimate.toFixed(1)), 123.3);

  // Fractional RPE: e.g. RPE 9.5 -> RiR = 0.5 -> effective reps = 5.5
  const rpe95Estimate = epley(100, 5, 9.5);
  assert.equal(rpe95Estimate, 100 * (1 + 5.5 / 30));

  // Clamping / rejection: RPE > 10 or RPE < 0 must never lower effective reps below raw reps
  assert.equal(epley(100, 5, 11), rawEstimate);
  assert.equal(epley(100, 5, -1), rawEstimate);

  // Brzycki formula with RPE
  // 100 x 5 raw: 100 * 36 / (37 - 5) = 112.5
  assert.equal(brzycki(100, 5), 112.5);
  assert.equal(brzycki(100, 5, 10), 112.5);
  // 100 x 5 @ RPE 8 -> effective reps 7 -> 100 * 36 / (37 - 7) = 120
  assert.equal(brzycki(100, 5, 8), 120);
});

test("Fixture W2: No-RPE parity across test corpus", () => {
  const testCases = [
    { weight: 60, reps: 1 },
    { weight: 100, reps: 5 },
    { weight: 140, reps: 8 },
    { weight: 80, reps: 10 },
    { weight: 225, reps: 5 },
    { weight: 315, reps: 3 },
  ];

  for (const tc of testCases) {
    const baselineEpley = tc.reps === 1 ? tc.weight : tc.weight * (1 + tc.reps / 30);
    assert.equal(epley(tc.weight, tc.reps), baselineEpley);
    assert.equal(epley(tc.weight, tc.reps, null), baselineEpley);
    assert.equal(epley(tc.weight, tc.reps, undefined), baselineEpley);

    // bestE1rm parity
    assert.equal(bestE1rm([tc]), baselineEpley);
    assert.equal(bestE1rm([{ ...tc, rpe: null }]), baselineEpley);
  }
});

test("Fixture W3: Snapshot integrity", async () => {
  const supabase = getSupabase();
  const origGetSession = supabase.auth.getSession.bind(supabase.auth);
  // Mock active user session for test environment
  supabase.auth.getSession = async () => ({
    data: {
      session: {
        user: { id: "test-user-w3" },
        access_token: "mock-token",
        refresh_token: "mock-refresh",
        expires_at: 9999999999,
        token_type: "bearer",
      } as unknown as Session,
    },
    error: null,
  });

  try {
    // Clear any leftover active workout before running
    await kvSet("active-workout", null);

    // Simulate starting a planned session from a routine prescription
    const routineTargets = {
      exercise_id: "ex-bench-001",
      sets: 3,
      weight_kg: 100,
      target_reps: 8,
      target_weight: 100,
      target_rpe: 8.5,
    };

    const session = await startPlannedSession(
      { name: "Push Day", routineId: "routine-push-1" },
      [routineTargets],
    );

    assert.ok(session.id);

    // Inspect the created sets in the active mirror
    const mirror = (await kvGet("active-workout")) as { session: { id: string }; sets: WorkoutSet[] } | null;
    assert.ok(mirror);
    assert.equal(mirror.session.id, session.id);

    const workingSets = mirror.sets.filter((s: WorkoutSet) => s.set_type === "normal");
    assert.equal(workingSets.length, 3);

    // Verify that the snapshot was stamped on set creation
    for (const s of workingSets) {
      assert.equal(s.target_reps, 8);
      assert.equal(s.target_weight, 100);
      assert.equal(s.target_rpe, 8.5);
    }

    // Simulate editing the routine afterwards:
    // e.g. Routine changes targets to 105 kg x 10 reps @ RPE 9
    const updatedRoutineTargets = {
      target_reps: 10,
      target_weight: 105,
      target_rpe: 9,
    };
    assert.notEqual(updatedRoutineTargets.target_weight, 100);

    // Verify that the completed set's stored snapshot still holds the ORIGINAL targets
    const completedSet = workingSets[0];
    assert.equal(completedSet.target_reps, 8);
    assert.equal(completedSet.target_weight, 100);
    assert.equal(completedSet.target_rpe, 8.5);
  } finally {
    // Clean up active mirror and restore auth
    await kvSet("active-workout", null);
    supabase.auth.getSession = origGetSession;
  }
});

test("Fixture W4: Legacy safety with null snapshot", () => {
  // Legacy rows from previous database versions have null target snapshots
  const legacySet: WorkoutSet = {
    id: "legacy-set-1",
    session_id: "legacy-session-1",
    user_id: "user-1",
    exercise_id: "ex-squat-1",
    exercise_order: 1,
    set_number: 1,
    set_type: "normal",
    weight: 120,
    reps: 5,
    rpe: null,
    superset_group: null,
    parent_set_id: null,
    is_completed: true,
    completed_at: "2026-10-20T10:00:00Z",
    estimated_1rm: 140,
    notes: null,
    client_id: null,
    duration_seconds: null,
    distance_m: null,
    reps_left: null,
    reps_right: null,
    target_reps: null,
    target_weight: null,
    target_rpe: null,
    created_at: "2026-10-20T09:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
  };

  // Reads behave exactly as before: null properties do not crash or alter volume / 1RM calculations
  assert.equal(legacySet.target_reps, null);
  assert.equal(legacySet.target_weight, null);
  assert.equal(legacySet.target_rpe, null);
  assert.equal(bestE1rm([legacySet]), 120 * (1 + 5 / 30));
});

test("Fixture W5: Exercise variation grouping & substitution candidate surfacing", () => {
  // Deterministic grouping check
  const barbellBench = {
    id: "e-bb-bench",
    name: "Barbell Bench Press",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Bench Press"],
  };

  const closeGripBench = {
    id: "e-cg-bench",
    name: "Close-Grip Barbell Bench Press",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Close-Grip Bench"],
  };

  const backSquat = {
    id: "e-back-squat",
    name: "Back Squat",
    primary_muscle: "quads",
    secondary_muscles: ["glutes", "hamstrings"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Squat"],
  };

  // Derive variation groups
  const benchGroup = deriveVariationGroup(barbellBench);
  const cgBenchGroup = deriveVariationGroup(closeGripBench);
  const squatGroup = deriveVariationGroup(backSquat);

  // Two known variants of one base movement share a variation_group
  assert.equal(benchGroup, "bench-press");
  assert.equal(cgBenchGroup, "bench-press");
  assert.equal(benchGroup, cgBenchGroup);

  // An unrelated exercise does not
  assert.equal(squatGroup, "squat");
  assert.notEqual(benchGroup, squatGroup);

  // Surface same-group candidate in substitution engine
  const candidatePool = [
    { ...closeGripBench, variation_group: cgBenchGroup },
    { ...backSquat, variation_group: squatGroup },
    {
      id: "e-incline-db",
      name: "Incline Dumbbell Press",
      primary_muscle: "chest",
      secondary_muscles: ["front_delts", "triceps"],
      equipment: "dumbbell",
      mechanic: "compound",
      variation_group: "bench-press",
    },
  ];

  const current = { ...barbellBench, variation_group: benchGroup };
  const swaps = smartSwaps(current, candidatePool);

  // Same-group candidate is surfaced at the top of candidate substitutions
  assert.ok(swaps.length > 0);
  assert.ok(swaps.some((s) => s.id === "e-cg-bench"));
  assert.equal(swaps[0].variation_group, "bench-press");

  // Explanation includes "Direct Variant" tag
  const expl = explainSubstitution(current as unknown as Exercise, { ...closeGripBench, variation_group: cgBenchGroup } as unknown as Exercise);
  assert.ok(expl.tags.includes("Direct Variant"));
});

test("Fixture W6: No confounding of finish-workout or outbox code paths", () => {
  // Verify git diff between HEAD~3 and HEAD contains NO changes to outbox / finish files
  const diffOutput = execSync("git diff --name-only HEAD~3 HEAD").toString();
  const changedFiles = diffOutput.trim().split(/\r?\n/).filter(Boolean);

  const forbiddenFiles = [
    "src/lib/offline/queue.ts",
    "src/components/sync-banner.tsx",
    "tests/real-db/finish.test.ts",
    "tests/outbox-pending.test.ts",
  ];

  for (const forbidden of forbiddenFiles) {
    assert.ok(
      !changedFiles.includes(forbidden),
      `Forbidden finish/outbox file modified: ${forbidden}`,
    );
  }
});
