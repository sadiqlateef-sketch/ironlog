import test from "node:test";
import assert from "node:assert/strict";
import { startPlannedSession } from "../src/lib/offline/workout-store.ts";

test("starting a second workout is refused while one is open", async () => {
  // A phone with one unfinished workout already saved (local test backend).
  const mockStorage: Record<string, string> = {
    ironlog_table_workout_sessions: JSON.stringify([
      {
        id: "open-session-1",
        user_id: "11111111-1111-4111-8111-111111111111",
        name: "Already open",
        start_time: new Date(Date.now() - 3_600_000).toISOString(),
        end_time: null,
        volume: 0,
      },
    ]),
  };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
    },
  };

  await assert.rejects(() => startPlannedSession({ name: "Second one" }, []), /one_active/);
  // Nothing new was saved.
  assert.equal(JSON.parse(mockStorage.ironlog_table_workout_sessions).length, 1);
});
