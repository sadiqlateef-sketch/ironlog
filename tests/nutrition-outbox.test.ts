import test from "node:test";
import assert from "node:assert/strict";
import { createNutritionOutbox, explainNutritionRefusal, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

type Call = { table: string; kind: string; arg?: unknown; opts?: unknown; ids?: string[] };

function setup(opts: { online?: boolean; session?: boolean; fail?: (c: Call) => string | null | Error } = {}) {
  const state = { value: undefined as unknown, online: opts.online ?? true, session: opts.session ?? true, refreshed: 0 };
  const calls: Call[] = [];
  const respond = (c: Call) => {
    calls.push(c);
    const f = opts.fail?.(c);
    if (f instanceof Error) throw f;
    return Promise.resolve({ error: f ? { message: f } : null });
  };
  const db: DbLike = {
    from: (table) => ({
      upsert: (rows, o) => respond({ table, kind: "upsert", arg: rows, opts: o }),
      update: (patch) => ({ in: (_c, ids) => respond({ table, kind: "update", arg: patch, ids }) }),
      delete: () => ({ in: (_c, ids) => respond({ table, kind: "delete", ids }) }),
    }),
  };
  const make = () =>
    createNutritionOutbox({
      store: { get: async () => state.value, set: async (v) => ((state.value = v), true) },
      getDb: () => db,
      hasSession: async () => state.session,
      refreshSession: async () => void state.refreshed++,
      isOnline: () => state.online,
    });
  return { state, calls, make };
}

const ins = (id: string, table: "foods" | "food_entries" = "food_entries"): NOp => ({ kind: "insert", table, rows: [{ id }] });
const firstId = (c: Call) => (c.arg as { id: string }[])[0].id;

test("offline keeps entries, flags online:false and never calls the db", async () => {
  const t = setup({ online: false });
  const o = t.make();
  await o.enqueue(ins("a"));
  assert.equal(await o.flush(), false);
  assert.equal(o.getStatus().online, false);
  assert.equal(o.getStatus().pending, 1);
  assert.equal(t.calls.length, 0);
});

test("a network error keeps entries and sets online:false", async () => {
  const t = setup({ fail: () => new Error("Failed to fetch") });
  const o = t.make();
  await o.enqueue(ins("a"));
  assert.equal(await o.flush(), false);
  assert.equal(o.getStatus().online, false);
  assert.equal(await o.pendingCount(), 1);
});

test("reconnect sends in order, upsert ignores duplicates, and empties the store", async () => {
  const t = setup({ online: false });
  const o = t.make();
  await o.enqueue(
    ins("f1", "foods"),
    ins("e1"),
    { kind: "update", table: "food_entries", ids: ["e1"], patch: { note: "x" } },
    { kind: "delete", table: "food_entries", ids: ["e1"] },
  );
  await o.flush();
  t.state.online = true;
  assert.equal(await o.flush(), true);
  assert.deepEqual(t.calls.map((c) => `${c.table}:${c.kind}`), ["foods:upsert", "food_entries:upsert", "food_entries:update", "food_entries:delete"]);
  assert.deepEqual(t.calls[0].opts, { onConflict: "id", ignoreDuplicates: true });
  assert.deepEqual(t.state.value, []);
  assert.equal(o.getStatus().pending, 0);
});

test("a retry after a half-sent batch sends only what is left", async () => {
  let n = 0;
  const t = setup({ fail: () => (++n === 2 ? new Error("Failed to fetch") : null) });
  const o = t.make();
  await o.enqueue(ins("a"), ins("b"), ins("c"));
  assert.equal(await o.flush(), false);
  assert.equal(await o.pendingCount(), 2);
  assert.equal(await o.flush(), true);
  assert.deepEqual(t.calls.filter((c) => c.kind === "upsert").map(firstId), ["a", "b", "b", "c"]);
  assert.equal(await o.pendingCount(), 0);
});

test("a refused head is kept with the reason, nothing after it is sent, discardRefused drops only it", async () => {
  const t = setup({ fail: (c) => (firstId(c) === "a" ? 'new row violates check constraint "x"' : null) });
  const o = t.make();
  await o.enqueue(ins("a"), ins("b"));
  assert.equal(await o.flush(), false);
  assert.equal(o.getStatus().refused, "The server rejected an amount or value on this food entry.");
  assert.equal(await o.pendingCount(), 2);
  assert.equal(t.calls.length, 1);
  await o.discardRefused();
  assert.equal(await o.pendingCount(), 0);
  assert.equal(o.getStatus().refused, null);
  assert.equal(t.calls.length, 2);
});

test("an auth error refreshes the session, stops, and is not marked refused", async () => {
  const t = setup({ fail: () => "JWT expired" });
  const o = t.make();
  await o.enqueue(ins("a"));
  assert.equal(await o.flush(), false);
  assert.equal(t.state.refreshed, 1);
  assert.equal(o.getStatus().refused, null);
  assert.equal(await o.pendingCount(), 1);
  assert.equal((t.state.value as { refused?: string }[])[0].refused, undefined);
});

test("no session keeps everything and does not call the db", async () => {
  const t = setup({ session: false });
  const o = t.make();
  await o.enqueue(ins("a"));
  assert.equal(await o.flush(), false);
  assert.equal(t.calls.length, 0);
  assert.equal(await o.pendingCount(), 1);
});

test("a second outbox on the same store sees the same entries", async () => {
  const t = setup({ session: false });
  await t.make().enqueue(ins("a"), ins("b"));
  const again = t.make();
  assert.equal(await again.pendingCount(), 2);
  assert.equal(again.getStatus().pending, 2);
});

test("reset empties memory and the store, and the next user cannot send the old entries", async () => {
  const t = setup({ session: false });
  const o = t.make();
  await o.enqueue(ins("previous-users-food", "foods"));
  assert.equal(await o.pendingCount(), 1);
  await o.reset();
  assert.deepEqual(t.state.value, []);
  assert.equal(await o.hasPending(), false);
  assert.equal(o.getStatus().pending, 0);
  // A different user signs in on the same page: nothing from before is sent.
  t.state.session = true;
  assert.equal(await o.flush(), true);
  assert.equal(t.calls.length, 0);
});

test("reset during an in-flight send cannot resurrect the old list", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const state = { value: undefined as unknown };
  let upserts = 0;
  const db: DbLike = {
    from: () => ({
      upsert: async () => {
        upserts++;
        await gate;
        return { error: null };
      },
      update: () => ({ in: async () => ({ error: null }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  const o = createNutritionOutbox({
    store: { get: async () => state.value, set: async (v) => ((state.value = v), true) },
    getDb: () => db,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => true,
  });
  await o.enqueue(ins("a"), ins("b"));
  const sending = o.flush();
  await new Promise((r) => setTimeout(r, 10));
  await o.reset();
  release();
  await sending;
  assert.deepEqual(state.value, []);
  assert.equal(await o.pendingCount(), 0);
  assert.equal(upserts, 1);
});

test("a duplicate-key insert into foods counts as saved, row by row", async () => {
  const t = setup({
    fail: (c) => {
      const rows = c.arg as { id: string }[];
      return c.table === "foods" && (rows.length > 1 || rows[0].id === "dup") ? 'duplicate key value violates unique constraint "foods_user_source_key"' : null;
    },
  });
  const o = t.make();
  await o.enqueue({ kind: "insert", table: "foods", rows: [{ id: "dup" }, { id: "new" }] });
  assert.equal(await o.flush(), true);
  assert.equal(await o.pendingCount(), 0);
  const singles = t.calls.filter((c) => (c.arg as unknown[]).length === 1).map(firstId);
  assert.deepEqual(singles, ["dup", "new"]);
});

test("a duplicate-key error on food_entries is a refusal, not success", async () => {
  const t = setup({ fail: () => "duplicate key value violates unique constraint" });
  const o = t.make();
  await o.enqueue(ins("a"));
  assert.equal(await o.flush(), false);
  assert.ok(o.getStatus().refused);
});

test("missing table and foreign key wording", () => {
  assert.equal(
    explainNutritionRefusal("Could not find the table 'public.foods' in the schema cache"),
    'The database hasn\'t been updated for food yet. Run "Deploy database and functions" on GitHub, then tap Retry.',
  );
  assert.equal(explainNutritionRefusal("Could not find the 'nutrition_prefs' column of 'users'"), explainNutritionRefusal('relation "foods" does not exist'));
  assert.equal(
    explainNutritionRefusal('insert violates foreign key constraint "food_entries_food_id_fkey" (food_id)'),
    "This entry points at a food that isn't saved on the server yet.",
  );
  assert.match(explainNutritionRefusal("new row violates row-level security policy"), /wouldn't accept/);
});

test("prefs save is an update on users by id, stored under the nutrition key only", async () => {
  const t = setup({ session: false });
  const o = t.make();
  const op: NOp = { kind: "update", table: "users", ids: ["u1"], patch: { nutrition_prefs: { day_start: "04:00" } } };
  await o.enqueue(op);
  assert.deepEqual((t.state.value as { op: NOp }[])[0].op, op);
});

test("the workout outbox key is never read or written", async () => {
  const keys: string[] = [];
  const o = createNutritionOutbox({
    store: { get: async () => (keys.push("get"), undefined), set: async () => (keys.push("set"), true) },
    getDb: () => ({}) as DbLike,
    hasSession: async () => false,
    refreshSession: async () => {},
  });
  await o.enqueue(ins("a"));
  const src = (await import("node:fs")).readFileSync(new URL("../src/lib/offline/nutrition-outbox.ts", import.meta.url), "utf8");
  assert.ok(!/["']outbox["']/.test(src));
  assert.match(src, /NUTRITION_OUTBOX_KEY = "nutrition-outbox"/);
  assert.ok(keys.length > 0);
});
