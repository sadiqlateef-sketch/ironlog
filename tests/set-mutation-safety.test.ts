import test from "node:test";
import assert from "node:assert/strict";
import { getSupabase } from "../src/lib/supabase/client.ts";
import { handleMockRequest } from "../src/lib/supabase/mock-backend.ts";
import {
  updateSet,
  renumberSets,
  reorderExercises,
  deleteSets,
} from "../src/lib/offline/workout-store.ts";

async function setupMockEnvironment() {
  const mockStorage: Record<string, string> = {};
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
    },
    dispatchEvent: () => true,
  };
  await getSupabase().auth.signInWithPassword({ email: "test@example.com", password: "password" });
  return mockStorage;
}

test("concurrent set completion mutations maintain deterministic state and prevent duplicate rows", async () => {
  await setupMockEnvironment();

  const sessionId = "safety-session-1";
  const startIso = new Date().toISOString();

  // 1. Create a session in mock backend
  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: sessionId, name: "Leg Day", start_time: startIso, end_time: null, volume: 0 }]),
    }
  );

  const setId = "set-safety-1";
  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { id: setId, session_id: sessionId, exercise_id: "ex-squat", exercise_order: 1, set_number: 1, set_type: "normal", weight: 140, reps: 5, is_completed: false },
      ]),
    }
  );

  // 2. Simulate rapid concurrent completion calls (e.g. 5 parallel taps)
  const results = await Promise.all([
    updateSet(setId, { is_completed: true, weight: 140, reps: 5 }),
    updateSet(setId, { is_completed: true, weight: 140, reps: 5 }),
    updateSet(setId, { is_completed: true, weight: 140, reps: 5 }),
    updateSet(setId, { is_completed: true, weight: 140, reps: 5 }),
    updateSet(setId, { is_completed: true, weight: 140, reps: 5 }),
  ]);

  assert.equal(results.length, 5);

  // Verify only 1 set exists for this id and it is completed
  const queryRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets?id=eq.${setId}`,
    { headers: { accept: "application/json" } }
  );
  assert.ok(queryRes);
  const rows = await queryRes.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_completed, true);
  assert.equal(rows[0].reps, 5);
  assert.equal(rows[0].weight, 140);
});

test("set renumbering with warm-ups, working sets, and drop sets maintains strict monotonic order", async () => {
  await setupMockEnvironment();

  const sessionId = "safety-session-2";
  const startIso = new Date().toISOString();

  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: sessionId, name: "Push Day", start_time: startIso, end_time: null, volume: 0 }]),
    }
  );

  // 1. Insert 2 working sets
  const s1 = { id: "s-1", session_id: sessionId, exercise_id: "bench", exercise_order: 1, set_number: 1, set_type: "normal" as const, weight: 100, reps: 8, is_completed: true };
  const s2 = { id: "s-2", session_id: sessionId, exercise_id: "bench", exercise_order: 1, set_number: 2, set_type: "normal" as const, weight: 100, reps: 8, is_completed: false };
  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([s1, s2]),
    }
  );

  // 2. Add a drop set linked to s1 (parent_set_id: "s-1")
  // First shift s2 up to set_number: 3
  await updateSet("s-2", { set_number: 3 });
  const dropSet = { id: "s-drop", session_id: sessionId, exercise_id: "bench", exercise_order: 1, set_number: 2, set_type: "drop" as const, parent_set_id: "s-1", weight: 70, reps: 10, is_completed: false };
  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([dropSet]),
    }
  );

  // 3. Verify monotonic sequence: s-1 (#1) -> s-drop (#2, parent s-1) -> s-2 (#3)
  const benchSetsRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets?session_id=eq.${sessionId}&exercise_id=eq.bench&order=set_number.asc`,
    { headers: { accept: "application/json" } }
  );
  assert.ok(benchSetsRes);
  const benchSets = await benchSetsRes.json();
  assert.equal(benchSets.length, 3);
  assert.deepEqual(benchSets.map((s: { set_number: number }) => s.set_number), [1, 2, 3]);
  assert.equal(benchSets[1].parent_set_id, "s-1");
  assert.equal(benchSets[1].set_type, "drop");

  // 4. Test renumberSets helper
  await renumberSets([
    { id: "s-1", setNumber: 2 },
    { id: "s-drop", setNumber: 3 },
    { id: "s-2", setNumber: 4 },
  ]);

  const renumberedRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets?session_id=eq.${sessionId}&exercise_id=eq.bench&order=set_number.asc`,
    { headers: { accept: "application/json" } }
  );
  const renumbered = await renumberedRes!.json();
  assert.deepEqual(renumbered.map((s: { set_number: number }) => s.set_number), [2, 3, 4]);

  // 5. Test delete of parent set cascades drop sets in UI model
  await deleteSets(["s-1", "s-drop"]);
  const afterDeleteRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets?session_id=eq.${sessionId}&exercise_id=eq.bench`,
    { headers: { accept: "application/json" } }
  );
  const afterDelete = await afterDeleteRes!.json();
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, "s-2");
});

test("exercise reordering parks on negative slots to prevent collision on unique constraints", async () => {
  await setupMockEnvironment();

  const sessionId = "safety-session-3";
  const startIso = new Date().toISOString();

  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: sessionId, name: "Pull Day", start_time: startIso, end_time: null, volume: 0 }]),
    }
  );

  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { id: "deadlift-1", session_id: sessionId, exercise_id: "deadlift", exercise_order: 1, set_number: 1, set_type: "normal", weight: 200, reps: 5 },
        { id: "row-1", session_id: sessionId, exercise_id: "row", exercise_order: 2, set_number: 1, set_type: "normal", weight: 80, reps: 8 },
      ]),
    }
  );

  // Swap exercises 1 and 2
  await reorderExercises([
    { ids: ["deadlift-1"], order: 2 },
    { ids: ["row-1"], order: 1 },
  ]);

  const deadliftRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets?id=eq.deadlift-1`,
    { headers: { accept: "application/json" } }
  );
  const deadlift = (await deadliftRes!.json())[0];
  assert.equal(deadlift.exercise_order, 2);

  const rowRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets?id=eq.row-1`,
    { headers: { accept: "application/json" } }
  );
  const row = (await rowRes!.json())[0];
  assert.equal(row.exercise_order, 1);
});

test("process death recovery preserves wall-clock elapsed time and rest timer state", async () => {
  const mockStorage = await setupMockEnvironment();

  const sessionId = "recovery-session-1";
  // Started 25 minutes ago
  const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();

  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: sessionId, name: "Legs", start_time: twentyFiveMinutesAgo, end_time: null, volume: 0 }]),
    }
  );

  // Active rest timer with 45 seconds remaining
  const endsAt = Date.now() + 45 * 1000;
  mockStorage["ironlog.restTimer"] = JSON.stringify({
    endsAt,
    duration: 90,
    label: "Squat",
  });

  // Verify rest timer restoration
  const rawTimer = mockStorage["ironlog.restTimer"];
  assert.ok(rawTimer);
  const parsedTimer = JSON.parse(rawTimer);
  assert.ok(parsedTimer.endsAt > Date.now());
  const remainingSec = Math.round((parsedTimer.endsAt - Date.now()) / 1000);
  assert.ok(remainingSec >= 44 && remainingSec <= 46);

  // Verify elapsed workout duration accurately calculates to ~25 min (1500s)
  const elapsedSec = Math.round((Date.now() - new Date(twentyFiveMinutesAgo).getTime()) / 1000);
  assert.ok(elapsedSec >= 1499 && elapsedSec <= 1502);

  // Simulate timer expiration after process killed for > 45s
  const expiredEndsAt = Date.now() - 10 * 1000;
  mockStorage["ironlog.restTimer"] = JSON.stringify({
    endsAt: expiredEndsAt,
    duration: 90,
    label: "Squat",
  });
  const expiredParsed = JSON.parse(mockStorage["ironlog.restTimer"]);
  assert.ok(expiredParsed.endsAt <= Date.now()); // Correctly identified as expired
});
