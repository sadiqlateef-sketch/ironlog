import test from "node:test";
import assert from "node:assert/strict";

// IndexedDB that refuses every write, like a full phone.
class FailingRequest {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: unknown;
}
const failingDb = {
  transaction: () => ({
    objectStore: () => ({
      put: () => {
        const req = new FailingRequest();
        setTimeout(() => req.onerror?.(), 0);
        return req;
      },
      get: () => {
        const req = new FailingRequest();
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
    }),
  }),
};
(globalThis as unknown as { indexedDB: unknown }).indexedDB = {
  open: () => {
    const req = { onupgradeneeded: null, onsuccess: null as null | (() => void), onerror: null, result: failingDb };
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  },
};

const { kvSet } = await import("../src/lib/offline/kv.ts");
const { enqueue, getSyncStatus, clearSyncError, SAVE_FAILED_MESSAGE } = await import("../src/lib/offline/queue.ts");

test("kvSet says so when the phone can't store the value", async () => {
  assert.equal(await kvSet("k", { a: 1 }), false);
});

test("a failed save is shown as a sync error, and can be dismissed", async () => {
  clearSyncError();
  await enqueue({ kind: "delete", table: "workout_sets", ids: ["x"] });
  assert.equal(getSyncStatus().error, SAVE_FAILED_MESSAGE);
  clearSyncError();
  assert.equal(getSyncStatus().error, null);
});
