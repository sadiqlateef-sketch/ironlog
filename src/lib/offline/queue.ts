// The outbox: workout changes waiting to reach the server.
//
// Every change made in the logger is applied on the phone first, added here,
// and sent in order. If the phone has no signal the changes wait (in
// IndexedDB, so closing the app doesn't lose them) and are sent when it's
// back online. Inserts use ids made on the phone and are sent as
// "insert unless it's already there", so a retry never makes duplicates.

import { getSupabase } from "../supabase/client.ts";
import { kvGet, kvSet } from "./kv.ts";
import type { Database } from "../../types/database.ts";

type Table = "workout_sessions" | "workout_sets";
type Row = Record<string, unknown>;

export type Op =
  | { kind: "insert"; table: Table; rows: Row[] }
  | { kind: "update"; table: Table; ids: string[]; patch: Row }
  | { kind: "delete"; table: Table; ids: string[] }
  /** Finishing: drop the unchecked sets, then stamp the end time and volume. */
  | { kind: "finish"; sessionId: string; endTime: string; volume?: number }
  /** Ask for "next time" suggestions once a routine workout has synced. */
  | { kind: "adjust"; sessionId: string };

interface Entry {
  seq: number;
  op: Op;
  /** Set when the server said no. The change is kept (never thrown away) until you retry or discard it. */
  refused?: string;
}

export interface SyncStatus {
  pending: number;
  /** False when the last attempt couldn't reach the server. */
  online: boolean;
  syncing: boolean;
  /** A change the server refused (shown once, then the workout reloads). */
  error: string | null;
  /**
   * The server refused the next change, so syncing is paused on it (in order,
   * so nothing later is sent ahead of it). Retry or discard it from the banner.
   */
  refused: string | null;
}

const KEY = "outbox";
let status: SyncStatus = { pending: 0, online: true, syncing: false, error: null, refused: null };
const listeners = new Set<() => void>();
let loaded: Promise<Entry[]> | null = null;
let entries: Entry[] = [];

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function clearSyncError() {
  emit({ error: null });
}

async function load(): Promise<Entry[]> {
  if (!loaded) {
    loaded = kvGet<Entry[]>(KEY).then((e) => {
      entries = e ?? [];
      emit({ pending: entries.length, refused: entries[0]?.refused ?? null });
      return entries;
    });
  }
  return loaded;
}

export const SAVE_FAILED_MESSAGE = "Couldn't save on this phone (storage full?). Keep the app open until it syncs.";

async function save() {
  const saved = await kvSet(KEY, entries);
  emit({ pending: entries.length, ...(saved ? {} : { error: SAVE_FAILED_MESSAGE }) });
}

/** The sign-in needs refreshing: wait and try again, it isn't the change's fault. */
export function isAuthError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e);
  return /jwt|invalid claim|not authenticated|refresh token|401|unauthori[sz]ed/i.test(msg);
}

/** The server's reason, in words you can act on. */
export function explainRefusal(message: string): string {
  if (/one_active_per_user|duplicate key.*end_time/i.test(message))
    return "Another workout is still open on the server. Finish or delete it, then tap Retry.";
  if (/finish_missing/.test(message)) return "This workout isn't on the server, so it couldn't be marked finished.";
  if (/foreign key/i.test(message)) return "A set couldn't be saved because its workout isn't on the server yet.";
  if (/row-level security/i.test(message)) return "The server wouldn't accept this change for your account.";
  return message;
}

/** Errors that mean "no signal", as opposed to the server saying no. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if ((e as { name?: string })?.name === "TimeoutError") return true;
  const msg = String((e as { message?: string })?.message ?? e);
  return /signal timed out|aborted|failed to fetch|network ?request failed|networkerror|load failed|fetch failed|timed? ?out|ERR_INTERNET|ERR_NAME_NOT_RESOLVED/i.test(msg);
}

export async function hasPending(): Promise<boolean> {
  // Read `entries`, not load()'s result: that's the list as it was at app start.
  await load();
  return entries.length > 0;
}

/** Workouts you've finished on this phone whose Finish hasn't reached the server yet. */
export async function pendingFinishIds(): Promise<Set<string>> {
  await load();
  return new Set(entries.flatMap((e) => (e.op.kind === "finish" ? [e.op.sessionId] : [])));
}

export async function enqueue(...ops: Op[]): Promise<void> {
  await load();
  const last = entries.at(-1)?.seq ?? 0;
  entries = [...entries, ...ops.map((op, i) => ({ seq: last + i + 1, op }))];
  await save();
}

/** Session columns added lately. If the live database doesn't have them yet, send the change without them. */
const NEWER_COLUMNS = ["kit_id", "add_to_calendar"];

async function send(op: Op): Promise<void> {
  try {
    return await sendOnce(op);
  } catch (e) {
    const col = (e as Error).message?.match(/Could not find the '(\w+)' column/)?.[1];
    if (!col || !NEWER_COLUMNS.includes(col) || (op.kind !== "insert" && op.kind !== "update")) throw e;
    const strip = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => !NEWER_COLUMNS.includes(k)));
    if (op.kind === "insert") return sendOnce({ ...op, rows: op.rows.map(strip) });
    const patch = strip(op.patch);
    if (Object.keys(patch).length) return sendOnce({ ...op, patch });
  }
}

async function sendOnce(op: Op): Promise<void> {
  const db = getSupabase();
  const check = (res: { error: { message: string } | null }) => {
    if (res.error) throw new Error(res.error.message);
  };
  switch (op.kind) {
    case "insert":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return check(await db.from(op.table).upsert(op.rows as any, { onConflict: "id", ignoreDuplicates: true }));
    case "update":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return check(await db.from(op.table).update(op.patch as any).in("id", op.ids));
    case "delete":
      return check(await db.from(op.table).delete().in("id", op.ids));
    case "finish": {
      check(await db.from("workout_sets").delete().eq("session_id", op.sessionId).eq("is_completed", false));
      const patch = {
        end_time: op.endTime,
        ...(op.volume != null ? { volume: op.volume } : {}),
      };
      const res = await db
        .from("workout_sessions")
        .update(patch as unknown as Database["public"]["Tables"]["workout_sessions"]["Update"])
        .eq("id", op.sessionId)
        .is("end_time", null)
        .select("id");
      check(res);
      if (res.data?.length) return;
      // Nothing was updated. Fine if it was already finished (a retry); otherwise the
      // workout never reached the server, and saying "done" would be a lie.
      const after = await db.from("workout_sessions").select("id, end_time").eq("id", op.sessionId).maybeSingle();
      check(after);
      if (!after.data?.end_time) throw new Error("finish_missing: workout not on the server");
      return;
    }
    case "adjust": {
      const { error } = await db.functions.invoke("suggest-adjustments", { body: { session_id: op.sessionId } });
      // Suggestions are a bonus: only "no signal" is worth retrying.
      if (error && isNetworkError(error)) throw error;
      return;
    }
  }
}

let flushing: Promise<boolean> | null = null;

/**
 * Send everything waiting, in order. Resolves true once nothing is left.
 * A change the server refuses is kept and syncing pauses on it, with a banner
 * to retry or discard it. Nothing is ever thrown away without you choosing to.
 */
export function flush(): Promise<boolean> {
  // Already sending: wait for it, then pick up anything added meanwhile.
  if (flushing) return flushing.then((ok) => (ok && entries.length ? flush() : ok));
  flushing = (async () => {
    try {
      await load();
      if (!entries.length) {
        emit({ online: true });
        return true;
      }
      // Signed out (or the sign-in can't be restored yet): keep everything for later.
      const { data } = await getSupabase().auth.getSession();
      if (!data.session) return false;
      emit({ syncing: true });
      while (entries.length) {
        const [next] = entries;
        try {
          await send(next.op);
        } catch (e) {
          if (isNetworkError(e)) {
            emit({ online: false });
            return false;
          }
          if (isAuthError(e)) {
            // Supabase refreshes the sign-in on its own; try again shortly.
            await getSupabase().auth.refreshSession().catch(() => {});
            emit({ online: true });
            return false;
          }
          const reason = explainRefusal((e as Error).message ?? String(e));
          const first = next.refused == null;
          entries = entries.map((x) => (x.seq === next.seq ? { ...x, refused: reason } : x));
          await save();
          emit({ online: true, refused: reason, ...(first ? { error: reason } : {}) });
          return false;
        }
        entries = entries.filter((x) => x.seq !== next.seq);
        await save();
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

/** Throw away the one change the server refused, then carry on syncing the rest. */
export async function discardRefused(): Promise<void> {
  await load();
  if (entries[0]?.refused == null) return;
  entries = entries.slice(1);
  await save();
  emit({ refused: null, error: null });
  await flush();
}

/** Drop everything waiting (only when signing out). */
export async function discardPending(): Promise<void> {
  await load();
  entries = [];
  await save();
  emit({ refused: null, error: null });
}

// Retry when the connection comes back, the app returns to the screen, and
// every 20 seconds while something is waiting.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  // A refused change isn't retried on the timer (it would just be refused again);
  // it is retried when the app opens, comes back on screen, or you tap Retry.
  setInterval(() => {
    if (entries.length && !flushing && entries[0].refused == null) void flush();
  }, 20_000);
  void load().then(() => (entries.length ? flush() : true));
}
