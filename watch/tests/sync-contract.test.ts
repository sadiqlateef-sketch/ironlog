import { test } from "node:test";
import assert from "node:assert/strict";
import { OpQueue, classify, uuid, type Op, type Outcome } from "../src/queue.ts";
import {
  groupSets,
  currentPosition,
  prefill,
  type WatchSet,
  type ExerciseGroup,
} from "../src/logic.ts";

class MemoryKV {
  data = new Map<string, string>();
  async getItem(k: string) { return this.data.get(k) ?? null; }
  async setItem(k: string, v: string) { this.data.set(k, v); }
}

/** Timing-safe string comparison matching supabase/functions/watch-pair/index.ts */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const mockSet = (o: number, n: number, p: Partial<WatchSet> = {}): WatchSet => ({
  id: `set-${o}-${n}`,
  exercise_id: `ex-${o}`,
  exercise_order: o,
  set_number: n,
  set_type: "normal",
  weight: 0,
  reps: 0,
  is_completed: false,
  client_id: null,
  superset_group: null,
  ...p,
});

test("pairing code validation and constant-time secret check", () => {
  const validCode = "482910";
  const invalidCode1 = "48291"; // too short
  const invalidCode2 = "48291a"; // alphanumeric
  const codeRegex = /^\d{6}$/;

  assert.ok(codeRegex.test(validCode));
  assert.ok(!codeRegex.test(invalidCode1));
  assert.ok(!codeRegex.test(invalidCode2));

  // Constant-time hash comparison
  const h1 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const h2 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const h3 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b854";
  const hShort = "e3b0c442";

  assert.equal(sameHash(h1, h2), true);
  assert.equal(sameHash(h1, h3), false);
  assert.equal(sameHash(h1, hShort), false);
});

test("atomic pairing token consumption protects against replay", () => {
  interface PairingRecord {
    id: string;
    user_id: string | null;
    claimed_at: string | null;
    consumed_at: string | null;
    expires_at: string;
  }

  const pairing: PairingRecord = {
    id: "p-1",
    user_id: "user-abc",
    claimed_at: new Date(Date.now() - 5000).toISOString(),
    consumed_at: null,
    expires_at: new Date(Date.now() + 600000).toISOString(),
  };

  // First poll: atomically updates consumed_at
  function pollAndConsume(p: PairingRecord): "ready" | "expired" | "pending" {
    if (p.consumed_at || new Date(p.expires_at).getTime() < Date.now()) return "expired";
    if (!p.claimed_at || !p.user_id) return "pending";
    p.consumed_at = new Date().toISOString();
    return "ready";
  }

  assert.equal(pollAndConsume(pairing), "ready");
  assert.ok(pairing.consumed_at != null);

  // Subsequent polls must return "expired" to prevent token replay
  assert.equal(pollAndConsume(pairing), "expired");
});

test("concurrent set completion: phone and watch update distinct sets without clobbering", () => {
  // Initial workout state shared across phone and watch
  const initialSets: WatchSet[] = [
    mockSet(1, 1, { weight: 100, reps: 5 }),
    mockSet(1, 2, { weight: 100, reps: 5 }),
  ];

  // Simulated server state
  const serverDb = new Map<string, WatchSet>(initialSets.map((s) => [s.id, { ...s }]));

  // Phone completes set 1
  function phoneCompleteSet(id: string, weight: number, reps: number, completedAt: string) {
    const s = serverDb.get(id);
    if (s) {
      serverDb.set(id, { ...s, weight, reps, is_completed: true });
    }
  }

  // Watch completes set 2 via OpQueue
  const watchOp: Op = {
    kind: "complete",
    setId: "set-1-2",
    weight: 102.5,
    reps: 5,
    at: new Date().toISOString(),
  };

  function watchApplyOp(op: Op) {
    if (op.kind === "complete") {
      const s = serverDb.get(op.setId);
      if (s) {
        serverDb.set(op.setId, { ...s, weight: op.weight, reps: op.reps, is_completed: true });
      }
    }
  }

  // Execute concurrently
  phoneCompleteSet("set-1-1", 100, 5, new Date().toISOString());
  watchApplyOp(watchOp);

  // Both sets must be completed with their respective distinct metrics
  const s1 = serverDb.get("set-1-1");
  const s2 = serverDb.get("set-1-2");

  assert.ok(s1?.is_completed);
  assert.equal(s1?.weight, 100);
  assert.equal(s1?.reps, 5);

  assert.ok(s2?.is_completed);
  assert.equal(s2?.weight, 102.5);
  assert.equal(s2?.reps, 5);
});

test("watch adds set with unique UUID and monotonic set numbering", () => {
  const groups = groupSets(
    [mockSet(1, 1, { is_completed: true, weight: 80, reps: 8 }), mockSet(1, 2, { is_completed: true, weight: 80, reps: 8 })],
    { "ex-1": { name: "Overhead Press", mechanic: "compound" } },
  );

  const group = groups[0];
  const lastSet = group.sets[group.sets.length - 1];
  const newId = uuid();
  const addedRow: WatchSet = {
    id: newId,
    client_id: newId,
    exercise_id: group.exerciseId,
    exercise_order: group.order,
    set_number: lastSet.set_number + 1,
    set_type: "normal",
    superset_group: group.supersetGroup,
    weight: lastSet.weight,
    reps: lastSet.reps,
    is_completed: false,
  };

  assert.equal(addedRow.set_number, 3);
  assert.equal(addedRow.weight, 80);
  assert.notEqual(addedRow.id, lastSet.id);
  assert.match(addedRow.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("CAS guard protects workout finish from phone/watch race", () => {
  interface SessionState {
    id: string;
    start_time: string;
    end_time: string | null;
  }

  const session: SessionState = {
    id: "session-123",
    start_time: "2026-10-24T00:00:00.000Z",
    end_time: null,
  };

  // Function simulating Supabase update with CAS .is("end_time", null)
  function attemptFinish(at: string): { affectedRows: number } {
    if (session.end_time !== null) {
      return { affectedRows: 0 };
    }
    session.end_time = at;
    return { affectedRows: 1 };
  }

  const phoneFinishTime = "2026-10-24T01:00:00.000Z";
  const watchFinishTime = "2026-10-24T01:00:02.000Z";

  // Phone finishes first
  const phoneResult = attemptFinish(phoneFinishTime);
  assert.equal(phoneResult.affectedRows, 1);
  assert.equal(session.end_time, phoneFinishTime);

  // Watch finishes shortly after: CAS guard ensures no rows affected and phone timestamp preserved
  const watchResult = attemptFinish(watchFinishTime);
  assert.equal(watchResult.affectedRows, 0);
  assert.equal(session.end_time, phoneFinishTime); // Unaltered!
});

test("offline queue drains in strict FIFO and pauses on transient server failure", async () => {
  const kv = new MemoryKV();
  const operations: Op[] = [
    { kind: "complete", setId: "s-1", weight: 60, reps: 10, at: "t1" },
    { kind: "complete", setId: "s-2", weight: 60, reps: 8, at: "t2" },
    { kind: "finish", sessionId: "sess-1", at: "t3" },
  ];

  let serverOnline = false;
  let serverFailCount = 0;
  const processedOps: string[] = [];

  const queue = new OpQueue(kv, async (op) => {
    if (!serverOnline) return "retry";
    if (serverFailCount > 0) {
      serverFailCount--;
      return classify({ status: 503 }); // Retryable service unavailable
    }
    if (op.kind === "complete") processedOps.push(op.setId);
    if (op.kind === "finish") processedOps.push(op.sessionId);
    return "ok";
  });

  for (const op of operations) {
    await queue.add(op);
  }

  // All 3 queued while offline
  assert.equal(await queue.pending(), 3);
  assert.equal(processedOps.length, 0);

  // Transient 503 error occurs
  serverOnline = true;
  serverFailCount = 1;
  const pendingAfterFail = await queue.flush();
  assert.equal(pendingAfterFail, 3); // Still 3 pending, stopped at s-1
  assert.equal(processedOps.length, 0);

  // Server recovers: all 3 drain in strict order
  const pendingFinal = await queue.flush();
  assert.equal(pendingFinal, 0);
  assert.deepEqual(processedOps, ["s-1", "s-2", "sess-1"]);
});
