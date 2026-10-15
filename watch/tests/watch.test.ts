import { test } from "node:test";
import assert from "node:assert/strict";
import { OpQueue, classify, uuid, type Op, type Outcome } from "../src/queue.ts";
import {
  currentPosition, displayWeight, groupSets, hrZone, prefill, restSeconds, snapKg, stepKg, toHrRows, weightStepKg, type WatchSet,
} from "../src/logic.ts";

class MemoryKV {
  data = new Map<string, string>();
  async getItem(k: string) { return this.data.get(k) ?? null; }
  async setItem(k: string, v: string) { this.data.set(k, v); }
}

const op = (n: number): Op => ({ kind: "finish", sessionId: String(n), at: "x" });

test("queue sends in order and keeps everything while offline", async () => {
  const kv = new MemoryKV();
  let online = false;
  const sent: string[] = [];
  const q = new OpQueue(kv, async (o) => {
    if (!online) return "retry";
    sent.push((o as { sessionId: string }).sessionId);
    return "ok";
  });
  assert.equal(await q.push(op(1)), 1);
  assert.equal(await q.push(op(2)), 2);
  // Survives an app restart: a new queue reads the same storage.
  const q2 = new OpQueue(kv, async (o): Promise<Outcome> => {
    sent.push((o as { sessionId: string }).sessionId);
    return "ok";
  });
  online = true;
  assert.equal(await q2.flush(), 0);
  assert.deepEqual(sent, ["1", "2"]);
});

test("queue stops at a retry so order is kept, and drops refused changes", async () => {
  const outcomes: Outcome[] = ["ok", "drop", "retry"];
  const q = new OpQueue(new MemoryKV(), async () => outcomes.shift() ?? "ok");
  for (const n of [1, 2, 3, 4]) await q.push(op(n)).catch(() => {});
  assert.equal(await q.pending(), 0);
});

test("a thrown error counts as offline", async () => {
  const q = new OpQueue(new MemoryKV(), async () => { throw new TypeError("Network request failed"); });
  assert.equal(await q.push(op(1)), 1);
});

test("heart-rate batches merge instead of piling up", async () => {
  const q = new OpQueue(new MemoryKV(), async () => "retry");
  await q.push({ kind: "hr", rows: [{ session_id: "s", recorded_at: "a", bpm: 100 }] });
  await q.push({ kind: "hr", rows: [{ session_id: "s", recorded_at: "b", bpm: 101 }] });
  assert.equal(await q.pending(), 1);
});

test("only one flush runs at a time", async () => {
  let calls = 0;
  const q = new OpQueue(new MemoryKV(), async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return "ok"; });
  await q.push(op(1));
  calls = 0;
  await Promise.all([q.push(op(2)), q.flush(), q.flush()]);
  assert.equal(calls, 1);
});

test("classify: offline and server errors retry, bad requests drop", () => {
  assert.equal(classify(null), "ok");
  assert.equal(classify({ message: "Network request failed" }), "retry");
  assert.equal(classify({ status: 503 }), "retry");
  assert.equal(classify({ status: 401 }), "retry");
  assert.equal(classify({ status: 400 }), "drop");
  assert.equal(classify({ status: 403 }), "drop");
});

test("uuid looks like a v4 uuid and doesn't repeat", () => {
  const a = uuid(), b = uuid();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

const set = (o: number, n: number, p: Partial<WatchSet> = {}): WatchSet => ({
  id: `${o}-${n}`, exercise_id: `e${o}`, exercise_order: o, set_number: n, set_type: "normal",
  weight: 0, reps: 0, is_completed: false, client_id: null, superset_group: null, ...p,
});

test("weights step by 5 lb or 2.5 kg and display rounded", () => {
  assert.equal(displayWeight(weightStepKg("imperial") * 27, "imperial"), "135");
  assert.equal(displayWeight(100, "metric"), "100");
  assert.equal(displayWeight(snapKg(61.3, "imperial"), "imperial"), "135");
  assert.equal(snapKg(61.3, "metric"), 62.5);
  assert.equal(snapKg(-3, "metric"), 0);
});

test("+ / - keeps half-pound weights", () => {
  const lb = (n: number) => n / 2.2046226218;
  const shown = (kg: number) => displayWeight(kg, "imperial");
  assert.equal(shown(stepKg(lb(42.5), weightStepKg("imperial"), "imperial")), "47.5");
  assert.equal(shown(stepKg(lb(42.5), -weightStepKg("imperial"), "imperial")), "37.5");
  assert.equal(shown(stepKg(lb(45), lb(0.5), "imperial")), "45.5");
  assert.equal(stepKg(0.1, -2.5, "metric"), 0);
});

test("current position is the first unfinished set in workout order", () => {
  const groups = groupSets(
    [set(2, 1), set(1, 2), set(1, 1, { is_completed: true })],
    { e1: { name: "Bench", mechanic: "compound" }, e2: { name: "Row", mechanic: "compound" } },
  );
  assert.deepEqual(groups.map((g) => g.name), ["Bench", "Row"]);
  assert.deepEqual(currentPosition(groups), { group: 0, set: 1 });
  groups.forEach((g) => g.sets.forEach((s) => (s.is_completed = true)));
  assert.equal(currentPosition(groups), null);
});

test("prefill carries the weight you just lifted, else the plan's target", () => {
  const [g] = groupSets(
    [
      set(1, 1, { set_type: "warmup", weight: 20, reps: 10, is_completed: true }),
      set(1, 2, { weight: 62.5, reps: 5, is_completed: true }), // planned 60, lifter bumped it
      set(1, 3, { weight: 60 }),
      set(1, 4, { set_type: "warmup" }),
      set(1, 5, { weight: 70, reps: 3 }),
    ],
    {},
  );
  assert.deepEqual(prefill(g, 2), { weight: 62.5, reps: 5 }, "follows the bump, not the plan");
  assert.deepEqual(prefill(g, 3), { weight: 20, reps: 10 }, "warm-ups follow warm-ups");
  const [fresh] = groupSets([set(1, 1, { weight: 60, reps: 5 }), set(1, 2)], {});
  assert.deepEqual(prefill(fresh, 0), { weight: 60, reps: 5 }, "first set uses the plan");
  assert.deepEqual(prefill(fresh, 1), { weight: 0, reps: 0 });
});

test("rest rules match the phone app", () => {
  const base = { type: "normal" as const, mechanic: "compound" as const, routineRest: null, profileDefault: null, supersetGroup: null, order: 1, groups: [] };
  assert.equal(restSeconds(base), 120);
  assert.equal(restSeconds({ ...base, mechanic: "isolation" }), 90);
  assert.equal(restSeconds({ ...base, routineRest: 180 }), 180);
  assert.equal(restSeconds({ ...base, type: "warmup", routineRest: 180 }), 60);
  const groups = [{ order: 1, supersetGroup: 1 }, { order: 2, supersetGroup: 1 }];
  assert.equal(restSeconds({ ...base, supersetGroup: 1, order: 1, groups }), 0, "go straight to B");
  assert.equal(restSeconds({ ...base, supersetGroup: 1, order: 2, groups }), 120, "rest after B");
});

test("heart-rate rows: one per second, junk readings dropped", () => {
  const rows = toHrRows("s", [
    { at: 1000, bpm: 90 }, { at: 1400, bpm: 91 }, { at: 2100, bpm: 92.6 }, { at: 3000, bpm: 0 }, { at: 4000, bpm: 300 },
  ]);
  assert.deepEqual(rows.map((r) => r.bpm), [90, 93]);
  assert.equal(rows[0].recorded_at, "1970-01-01T00:00:01.000Z");
});

test("heart-rate zones", () => {
  assert.equal(hrZone(100, 30), 1);
  assert.equal(hrZone(150, 30), 3);
  assert.equal(hrZone(185, 30), 5);
});
