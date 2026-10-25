import test from "node:test";
import assert from "node:assert/strict";
import { legacyWorkoutCount, matchExercise } from "../src/lib/legacy-upload.ts";
import { isLocalBackend } from "../src/lib/supabase/client.ts";
import { LOCAL_EXERCISES } from "../src/lib/supabase/mock-backend.ts";

test("no upload is offered when the app runs on the local test backend", () => {
  assert.equal(isLocalBackend(), true);
  assert.equal(legacyWorkoutCount(), 0);
});

test("a local exercise id matches the real library row by slug", () => {
  const localIndex = new Map(
    (LOCAL_EXERCISES as { id: string; slug: string; name: string }[]).map((e) => [e.id, { slug: e.slug, name: e.name }]),
  );
  const library = [
    { id: "real-back-squat", slug: "back-squat", name: "Back Squat" },
    { id: "real-bench", slug: "barbell-bench-press", name: "Barbell Bench Press" },
  ];
  assert.equal(matchExercise("e1000000-0000-0000-0000-000000000001", localIndex, library), "real-back-squat");
});

test("unknown exercises don't match, and real library ids pass through", () => {
  const localIndex = new Map<string, { slug: string; name: string }>();
  const library = [{ id: "real-bench", slug: "barbell-bench-press", name: "Barbell Bench Press" }];
  assert.equal(matchExercise("not-a-real-id", localIndex, library), null);
  assert.equal(matchExercise("real-bench", localIndex, library), "real-bench");
});
