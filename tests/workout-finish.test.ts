import test from "node:test";
import assert from "node:assert/strict";
import { isToday, isSessionCompleted } from "../src/lib/offline/workout-store.ts";
import { handleMockRequest } from "../src/lib/supabase/mock-backend.ts";

test("isToday correctly identifies today vs previous days", () => {
  const now = new Date();
  assert.equal(isToday(now.toISOString()), true);

  const yesterday = new Date(Date.now() - 24 * 3600 * 1000 * 2);
  assert.equal(isToday(yesterday.toISOString()), false);

  assert.equal(isToday(null), false);
  assert.equal(isToday(undefined), false);
});

test("isSessionCompleted identifies completed workouts", () => {
  assert.equal(isSessionCompleted({ end_time: "2026-10-23T01:00:00Z" } as unknown as Parameters<typeof isSessionCompleted>[0]), true);
  assert.equal(isSessionCompleted({ end_time: null, completed_at: "2026-10-23T01:00:00Z" } as unknown as Parameters<typeof isSessionCompleted>[0]), true);
  assert.equal(isSessionCompleted({ end_time: null } as unknown as Parameters<typeof isSessionCompleted>[0]), false);
  assert.equal(isSessionCompleted(null), false);
});

test("mock backend filters workout_sessions by end_time and handles PATCH and DELETE", async () => {
  // Setup a mock storage environment
  const mockStorage: Record<string, string> = {};
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
    },
  };

  const sessionId = "test-session-123";
  const startIso = new Date().toISOString();

  // 1. Insert an active session
  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: sessionId, name: "Leg Day", start_time: startIso, end_time: null, volume: 0 }]),
    }
  );

  // 2. Query active session (end_time=is.null)
  const activeRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions?select=*&end_time=is.null`,
    { headers: { accept: "application/vnd.pgrst.object+json" } }
  );
  assert.ok(activeRes);
  const activeData = await activeRes.json();
  assert.equal(activeData.id, sessionId);
  assert.equal(activeData.end_time, null);

  // 3. Log a set and complete it
  await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { id: "set-1", session_id: sessionId, exercise_id: "ex-1", set_number: 1, set_type: "normal", weight: 100, reps: 5, is_completed: true },
        { id: "set-2", session_id: sessionId, exercise_id: "ex-1", set_number: 2, set_type: "warmup", weight: 50, reps: 10, is_completed: true },
        { id: "set-3", session_id: sessionId, exercise_id: "ex-1", set_number: 3, set_type: "normal", weight: 100, reps: 0, is_completed: false },
      ]),
    }
  );

  // 4. Finish session: PATCH end_time
  const finishIso = new Date().toISOString();
  const patchRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions?id=eq.${sessionId}&end_time=is.null`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", accept: "application/vnd.pgrst.object+json" },
      body: JSON.stringify({ end_time: finishIso, volume: 500 }),
    }
  );
  assert.ok(patchRes);

  // 5. Query active sessions again: MUST be null!
  const activeAfterFinishRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions?select=*&end_time=is.null`,
    { headers: { accept: "application/vnd.pgrst.object+json" } }
  );
  assert.ok(activeAfterFinishRes);
  const activeAfterFinish = await activeAfterFinishRes.json();
  assert.equal(activeAfterFinish, null);

  // 6. Query finished sessions (end_time=not.is.null)
  const historyRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions?select=*&end_time=not.is.null&order=start_time.desc&limit=5`
  );
  assert.ok(historyRes);
  const historyData = await historyRes.json();
  assert.equal(historyData.length, 1);
  assert.equal(historyData[0].id, sessionId);
  assert.equal(historyData[0].end_time, finishIso);
  assert.equal(historyData[0].volume, 500);

  // 7. Test delete / discard
  const deleteRes = await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions?id=in.(${sessionId})`,
    { method: "DELETE" }
  );
  assert.ok(deleteRes);

  const historyAfterDelete = await (await handleMockRequest(
    `https://ironlog.supabase.co/rest/v1/workout_sessions?select=*&end_time=not.is.null`
  ))!.json();
  assert.equal(historyAfterDelete.length, 0);
});
