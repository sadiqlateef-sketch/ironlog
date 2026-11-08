import test from "node:test";
import assert from "node:assert/strict";
import { enqueue, hasPending, pendingFinishIds, discardPending } from "../src/lib/offline/queue.ts";

// Before Nov 2026, hasPending() read the outbox as it was when the app opened,
// so changes queued later were invisible to it. Then the app could read the
// server's stale copy while a Finish was still waiting, and the finished
// workout came back.
test("changes queued after the app opened count as waiting", async () => {
  await discardPending();
  assert.equal(await hasPending(), false);
  // Not signed in, so nothing can be sent: it stays queued.
  await enqueue({ kind: "finish", sessionId: "s1", endTime: new Date().toISOString() });
  assert.equal(await hasPending(), true);
  assert.deepEqual([...(await pendingFinishIds())], ["s1"]);
  await discardPending();
  assert.equal(await hasPending(), false);
});
