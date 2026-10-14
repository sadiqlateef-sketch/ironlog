import { test } from "node:test";
import assert from "node:assert/strict";
import { editProblem, planSessionEdits, type SavedSet } from "../src/lib/session-edit.ts";

const set = (id: string, order: number, n: number, over: Partial<SavedSet> = {}): SavedSet => ({
  id, exercise_id: `ex${order}`, exercise_order: order, set_number: n, set_type: "normal", weight: 100, reps: 5,
  completed_at: `2026-10-14T18:${String(order * 10 + n).padStart(2, "0")}:00Z`, ...over,
});
const before = [set("a1", 1, 1, { set_type: "warmup", weight: 60 }), set("a2", 1, 2), set("a3", 1, 3), set("b1", 2, 1), set("b2", 2, 2)];
const keep = (s: SavedSet) => ({ id: s.id, set_type: s.set_type, weight: s.weight, reps: s.reps });
const END = "2026-10-14T19:00:00Z";

test("nothing changed means nothing to save", () => {
  const blocks = [1, 2].map((o) => ({ order: o, exerciseId: `ex${o}`, sets: before.filter((s) => s.exercise_order === o).map(keep) }));
  assert.deepEqual(planSessionEdits(before, blocks, END), { remove: [], update: [], insert: [] });
});

test("edits, removals, swaps and additions", () => {
  const plan = planSessionEdits(
    before,
    [
      // fix a weight and a set type, drop the last set, add one
      { order: 1, exerciseId: "ex1", sets: [keep(before[0]), { ...keep(before[1]), weight: 102.5, set_type: "failure" }, { id: null, set_type: "normal", weight: 90, reps: 8 }] },
      // swapped exercise, same sets
      { order: 2, exerciseId: "exZ", sets: before.slice(3).map(keep) },
      // a brand new exercise
      { order: null, exerciseId: "ex9", sets: [{ id: null, set_type: "normal", weight: 20, reps: 12 }] },
    ],
    END,
  );
  assert.deepEqual(plan.remove, ["a3"]);
  assert.deepEqual(plan.update, [
    { id: "a2", patch: { set_type: "failure", weight: 102.5 } },
    { id: "b1", patch: { exercise_id: "exZ" } },
    { id: "b2", patch: { exercise_id: "exZ" } },
  ]);
  // New set goes after the highest number ever used in that slot, timed with the set before it.
  assert.deepEqual(plan.insert[0], { exercise_id: "ex1", exercise_order: 1, set_number: 4, set_type: "normal", weight: 90, reps: 8, completed_at: before[1].completed_at });
  // New exercise takes the next slot, timed at the workout's last set.
  assert.deepEqual(plan.insert[1], { exercise_id: "ex9", exercise_order: 3, set_number: 1, set_type: "normal", weight: 20, reps: 12, completed_at: before[4].completed_at });
});

test("removing an exercise removes all its sets", () => {
  const plan = planSessionEdits(before, [{ order: 1, exerciseId: "ex1", sets: before.slice(0, 3).map(keep) }], END);
  assert.deepEqual(plan.remove, ["b1", "b2"]);
});

test("tiny float noise from unit conversion isn't an edit", () => {
  const plan = planSessionEdits(before.slice(1, 2), [{ order: 1, exerciseId: "ex1", sets: [{ ...keep(before[1]), weight: 100.0001 }] }], END);
  assert.deepEqual(plan.update, []);
});

test("can't save an empty workout or a set with no reps", () => {
  assert.match(editProblem([]) ?? "", /Delete workout/);
  assert.match(editProblem([{ order: 1, exerciseId: "x", sets: [{ id: null, set_type: "normal", weight: 50, reps: 0 }] }]) ?? "", /1 rep/);
  assert.equal(editProblem([{ order: 1, exerciseId: "x", sets: [{ id: null, set_type: "normal", weight: 0, reps: 10 }] }]), null);
});
