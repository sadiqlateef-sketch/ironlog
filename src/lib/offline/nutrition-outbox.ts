// The nutrition outbox: food changes waiting to reach the server.
//
// Same idea as queue.ts (apply on the phone first, send in order, keep what the
// server refuses), but a separate list under its own key so food can never
// block or be mixed up with workout syncing. Inserts use ids made on the phone
// and are sent as "insert unless it's already there".

import { getSupabase } from "../supabase/client.ts";
import { kvGet, kvSet } from "./kv.ts";
import { explainRefusal, isAuthError, isNetworkError, SAVE_FAILED_MESSAGE } from "./queue.ts";

type Table = "foods" | "food_entries" | "users";
type Row = Record<string, unknown>;

export type NOp =
  | { kind: "insert"; table: "foods" | "food_entries"; rows: Row[] }
  | { kind: "update"; table: Table; ids: string[]; patch: Row }
  | { kind: "delete"; table: "foods" | "food_entries"; ids: string[] };

interface Entry {
  seq: number;
  op: NOp;
  /** Set when the server said no. Kept (never thrown away) until you retry or discard it. */
  refused?: string;
}

export interface NutritionSyncStatus {
  pending: number;
  /** False when the last attempt couldn't reach the server. */
  online: boolean;
  syncing: boolean;
  error: string | null;
  /** The server refused the next change, so syncing is paused on it. */
  refused: string | null;
}

/** The slice of the Supabase client this file uses. */
export interface DbLike {
  from(table: string): {
    upsert(rows: unknown, opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
    update(patch: unknown): { in(col: string, ids: string[]): PromiseLike<{ error: { message: string } | null }> };
    delete(): { in(col: string, ids: string[]): PromiseLike<{ error: { message: string } | null }> };
  };
}

export interface OutboxDeps {
  store: { get(): Promise<unknown>; set(value: unknown): Promise<boolean> };
  getDb: () => DbLike;
  hasSession: () => Promise<boolean>;
  refreshSession: () => Promise<unknown>;
  isOnline?: () => boolean;
}

export const NUTRITION_OUTBOX_KEY = "nutrition-outbox";

/** The server's reason for a food change, in words you can act on. */
export function explainNutritionRefusal(message: string): string {
  if (/Could not find the table|relation .* does not exist|Could not find the '\w+' column/i.test(message))
    return 'The database hasn\'t been updated for food yet. Run "Deploy database and functions" on GitHub, then tap Retry.';
  if (/violates check constraint/i.test(message)) return "The server rejected an amount or value on this food entry.";
  if (/foreign key/i.test(message) && /food_id/i.test(message))
    return "This entry points at a food that isn't saved on the server yet.";
  return explainRefusal(message);
}

export function createNutritionOutbox(deps: OutboxDeps) {
  const isOnline = deps.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  let status: NutritionSyncStatus = { pending: 0, online: true, syncing: false, error: null, refused: null };
  const listeners = new Set<() => void>();
  let loaded: Promise<unknown> | null = null;
  let entries: Entry[] = [];
  let flushing: Promise<boolean> | null = null;
  // Bumped by reset(): work started for the previous user must not touch the next one's list.
  let generation = 0;

  function emit(patch: Partial<NutritionSyncStatus>) {
    status = { ...status, ...patch };
    listeners.forEach((l) => l());
  }

  async function load() {
    if (!loaded) {
      const gen = generation;
      loaded = Promise.resolve(deps.store.get()).then((e) => {
        if (gen !== generation) return;
        entries = Array.isArray(e) ? (e as Entry[]) : [];
        emit({ pending: entries.length, refused: entries[0]?.refused ?? null });
      });
    }
    await loaded;
  }

  async function save(gen: number) {
    if (gen !== generation) return;
    const ok = await deps.store.set(entries);
    if (gen !== generation) return;
    emit({ pending: entries.length, ...(ok ? {} : { error: SAVE_FAILED_MESSAGE }) });
  }

  const check = (res: { error: { message: string } | null }) => {
    if (res.error) throw new Error(res.error.message);
  };

  async function sendOnce(op: NOp): Promise<void> {
    const db = deps.getDb();
    switch (op.kind) {
      case "insert":
        return check(await db.from(op.table).upsert(op.rows, { onConflict: "id", ignoreDuplicates: true }));
      case "update":
        return check(await db.from(op.table).update(op.patch).in("id", op.ids));
      case "delete":
        return check(await db.from(op.table).delete().in("id", op.ids));
    }
  }

  async function send(op: NOp): Promise<void> {
    try {
      return await sendOnce(op);
    } catch (e) {
      // A food that is already saved (same source and source id) counts as done, so a retry or
      // a second seeding can't wedge the queue. Row by row, so one duplicate can't hide the rest.
      if (op.kind === "insert" && op.table === "foods" && /duplicate key/i.test(String((e as Error).message ?? e))) {
        for (const row of op.rows) {
          try {
            await sendOnce({ ...op, rows: [row] });
          } catch (e2) {
            if (!/duplicate key/i.test(String((e2 as Error).message ?? e2))) throw e2;
          }
        }
        return;
      }
      throw e;
    }
  }

  function flush(): Promise<boolean> {
    if (flushing) return flushing.then((ok) => (ok && entries.length ? flush() : ok));
    const gen = generation;
    flushing = (async () => {
      try {
        await load();
        if (gen !== generation) return false;
        if (!entries.length) {
          emit({ online: true });
          return true;
        }
        if (!isOnline()) {
          emit({ online: false });
          return false;
        }
        if (!(await deps.hasSession())) return false;
        if (gen !== generation) return false;
        emit({ syncing: true });
        while (entries.length) {
          const [next] = entries;
          try {
            await send(next.op);
          } catch (e) {
            if (gen !== generation) return false;
            if (isNetworkError(e)) {
              emit({ online: false });
              return false;
            }
            if (isAuthError(e)) {
              await Promise.resolve(deps.refreshSession()).catch(() => {});
              emit({ online: true });
              return false;
            }
            const reason = explainNutritionRefusal((e as Error).message ?? String(e));
            const first = next.refused == null;
            entries = entries.map((x) => (x.seq === next.seq ? { ...x, refused: reason } : x));
            await save(gen);
            emit({ online: true, refused: reason, ...(first ? { error: reason } : {}) });
            return false;
          }
          if (gen !== generation) return false;
          entries = entries.filter((x) => x.seq !== next.seq);
          await save(gen);
        }
        emit({ online: true, refused: null });
        return true;
      } finally {
        if (status.syncing) emit({ syncing: false });
        flushing = null;
      }
    })();
    return flushing;
  }

  return {
    async enqueue(...ops: NOp[]): Promise<void> {
      await load();
      const gen = generation;
      const last = entries.at(-1)?.seq ?? 0;
      entries = [...entries, ...ops.map((op, i) => ({ seq: last + i + 1, op }))];
      await save(gen);
    },
    flush,
    async hasPending(): Promise<boolean> {
      await load();
      return entries.length > 0;
    },
    async pendingCount(): Promise<number> {
      await load();
      return entries.length;
    },
    getStatus: (): NutritionSyncStatus => status,
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async discardRefused(): Promise<void> {
      await load();
      if (entries[0]?.refused == null) return;
      const gen = generation;
      entries = entries.slice(1);
      await save(gen);
      emit({ refused: null, error: null });
      await flush();
    },
    async discardPending(): Promise<void> {
      await load();
      const gen = generation;
      entries = [];
      await save(gen);
      emit({ refused: null, error: null });
    },
    /** Sign-out: forget the list in memory AND on the phone so the next user can never send it. */
    async reset(): Promise<void> {
      generation++;
      entries = [];
      loaded = Promise.resolve();
      flushing = null;
      status = { pending: 0, online: true, syncing: false, error: null, refused: null };
      await deps.store.set([]);
      listeners.forEach((l) => l());
    },
    /** For listeners: is the head waiting on a retry timer? */
    headRefused: (): boolean => entries[0]?.refused != null,
    isFlushing: (): boolean => flushing !== null,
    hasEntries: (): boolean => entries.length > 0,
  };
}

const instance = createNutritionOutbox({
  store: { get: () => kvGet<unknown>(NUTRITION_OUTBOX_KEY), set: (v) => kvSet(NUTRITION_OUTBOX_KEY, v) },
  getDb: () => getSupabase() as unknown as DbLike,
  hasSession: async () => !!(await getSupabase().auth.getSession()).data.session,
  refreshSession: () => getSupabase().auth.refreshSession(),
});

export const enqueueNutrition = instance.enqueue;
export const flushNutrition = instance.flush;
export const hasNutritionPending = instance.hasPending;
export const nutritionPendingCount = instance.pendingCount;
export const getNutritionSyncStatus = instance.getStatus;
export const subscribeNutritionSync = instance.subscribe;
export const discardRefusedNutrition = instance.discardRefused;
export const discardPendingNutrition = instance.discardPending;
export const resetNutritionOutbox = instance.reset;

// Retry when the connection comes back, the app returns to the screen, and every
// 20 seconds while something is waiting (a refused head waits for Retry instead).
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void instance.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void instance.flush();
  });
  setInterval(() => {
    if (instance.hasEntries() && !instance.isFlushing() && !instance.headRefused()) void instance.flush();
  }, 20_000);
  void instance.hasPending().then((p) => (p ? instance.flush() : true));
}
