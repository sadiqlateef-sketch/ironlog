// Finishing a workout, against a real Supabase database (not the mock).
//
// The mock backend doesn't have the database's rules (one open workout per
// person, row security, foreign keys), so bugs that need those rules only
// show up here. Run with a local Supabase:
//   npx supabase start
//   npm run test:db
// It skips itself when no database is set.

import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_KEY;
const skip = !url || !key ? "set SUPABASE_TEST_URL and SUPABASE_TEST_KEY (see npx supabase status)" : false;

if (!skip) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
}

const { getSupabase } = await import("../../src/lib/supabase/client.ts");
const store = await import("../../src/lib/offline/workout-store.ts");
const queue = await import("../../src/lib/offline/queue.ts");

async function signIn() {
  const db = getSupabase();
  const email = `finish-${crypto.randomUUID()}@test.local`;
  const { data, error } = await db.auth.signUp({ email, password: "test-password-123" });
  assert.ifError(error);
  assert.ok(data.session, "local Supabase should sign new users straight in");
  const { data: ex } = await db.from("exercises").select("id").is("created_by", null).limit(1).single();
  assert.ok(ex, "the seeded exercise library should be there");
  return { userId: data.session.user.id, exerciseId: ex.id as string };
}

async function openOnServer() {
  const { data } = await getSupabase().from("workout_sessions").select("id, end_time").is("end_time", null);
  return data ?? [];
}

test("start, log a set, finish: closed on the server and doesn't come back", { skip }, async () => {
  const { exerciseId } = await signIn();
  const session = await store.startPlannedSession({ name: "Real DB finish" }, [{ exercise_id: exerciseId, sets: 2, weight_kg: 60 }]);
  const sets = await store.listActiveSets(session.id);
  assert.equal(sets.length, 2);
  await store.updateSets([sets[0].id], { reps: 5, is_completed: true, completed_at: new Date().toISOString() });

  const { synced } = await store.finishSession(session);
  assert.equal(synced, true);
  assert.equal(queue.getSyncStatus().pending, 0);

  const { data: row } = await getSupabase().from("workout_sessions").select("end_time, volume").eq("id", session.id).single();
  assert.ok(row?.end_time, "end_time is set on the server");
  assert.equal(Number(row?.volume), 300, "volume is the one ticked set (60 kg x 5)");
  const { count } = await getSupabase().from("workout_sets").select("id", { count: "exact", head: true }).eq("session_id", session.id);
  assert.equal(count, 1, "the unticked set is cleared");

  assert.deepEqual(await openOnServer(), []);
  assert.equal(await store.getActiveSession(), null, "reopening the app shows no workout");
  assert.equal(await store.getStaleSession(), null);
});

test("a change the server refuses is kept, not thrown away, and goes through on retry", { skip }, async () => {
  await signIn();
  const db = getSupabase();
  // Another workout already open on the server (say, started on the watch).
  const other = crypto.randomUUID();
  assert.ifError((await db.from("workout_sessions").insert({ id: other, name: "Open elsewhere", start_time: new Date().toISOString() })).error);

  // This phone started one offline, so it didn't know: the server's one-open rule refuses it.
  const mine = crypto.randomUUID();
  await queue.enqueue(
    { kind: "insert", table: "workout_sessions", rows: [{ id: mine, name: "Started offline", start_time: new Date().toISOString() }] },
    { kind: "finish", sessionId: mine, endTime: new Date().toISOString() },
  );
  assert.equal(await queue.flush(), false);
  let s = queue.getSyncStatus();
  assert.equal(s.pending, 2, "both changes are still waiting");
  assert.match(s.refused ?? "", /Another workout is still open/);

  // Finish the other one, then Retry: everything goes through in order.
  assert.ifError((await db.from("workout_sessions").update({ end_time: new Date().toISOString() }).eq("id", other)).error);
  queue.clearSyncError();
  assert.equal(await queue.flush(), true);
  s = queue.getSyncStatus();
  assert.equal(s.pending, 0);
  assert.equal(s.refused, null);
  const { data: row } = await db.from("workout_sessions").select("end_time").eq("id", mine).single();
  assert.ok(row?.end_time, "the offline workout reached the server, finished");
});

test("finishing a workout the server never got is not reported as done", { skip }, async () => {
  await signIn();
  await queue.enqueue({ kind: "finish", sessionId: crypto.randomUUID(), endTime: new Date().toISOString() });
  assert.equal(await queue.flush(), false);
  assert.match(queue.getSyncStatus().refused ?? "", /isn't on the server/);
  assert.equal(queue.getSyncStatus().pending, 1);

  await queue.discardRefused();
  assert.equal(queue.getSyncStatus().pending, 0);
  assert.equal(queue.getSyncStatus().refused, null);
});

test("a workout finished here but not synced isn't offered as 'unfinished from earlier'", { skip }, async () => {
  const { exerciseId } = await signIn();
  const db = getSupabase();
  const old = crypto.randomUUID();
  const start = new Date(Date.now() - 20 * 3_600_000).toISOString();
  assert.ifError((await db.from("workout_sessions").insert({ id: old, name: "Yesterday", start_time: start })).error);
  assert.equal((await store.getStaleSession())?.id, old, "an open old workout is offered");

  // Finished on the phone, but a refused change ahead of it holds the Finish back.
  await queue.enqueue(
    { kind: "insert", table: "workout_sets", rows: [{ id: crypto.randomUUID(), session_id: crypto.randomUUID(), exercise_id: exerciseId, set_number: 1, reps: 1, weight: 1 }] },
    { kind: "finish", sessionId: old, endTime: new Date().toISOString() },
  );
  assert.equal(await queue.flush(), false);
  assert.equal(await store.getStaleSession(), null);
  await queue.discardRefused();
  assert.equal(queue.getSyncStatus().pending, 0);
});
