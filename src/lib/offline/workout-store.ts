// The workout in progress, kept on the phone so logging never waits on signal.
//
// Each change is applied to the local copy first, queued (see queue.ts), and
// sent straight away when there's signal. While anything is still waiting,
// the local copy is the truth; once everything has synced, the server is.

import { getSupabase, isLocalBackend } from "../supabase/client.ts";
import { kvGet, kvSet } from "./kv.ts";
import { warmupWeightsKg } from "../set-logic.ts";
import { enqueue, flush, hasPending, isNetworkError, type Op } from "./queue.ts";
import type { Database } from "../../types/database.ts";
import type { WorkoutSession, WorkoutSet } from "../workout-api.ts";

type SetInsert = Database["public"]["Tables"]["workout_sets"]["Insert"];
type SetUpdate = Database["public"]["Tables"]["workout_sets"]["Update"];

interface Mirror {
  session: WorkoutSession;
  sets: WorkoutSet[];
}

const KEY = "active-workout";

async function readMirror(): Promise<Mirror | null> {
  return (await kvGet<Mirror | null>(KEY)) ?? null;
}

// Changes to the local copy run one at a time, so two quick taps can't
// each read the old copy and overwrite the other's change.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

/** Fired on window whenever the workout in progress starts, changes or ends (the workout bar listens). */
export const ACTIVE_WORKOUT_EVENT = "ironlog:active-workout";
const changed = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVE_WORKOUT_EVENT));
};

function writeMirror(m: Mirror | null): Promise<void> {
  return locked(() => kvSet(KEY, m)).then(changed);
}

function changeMirror(fn: (m: Mirror) => Mirror | null): Promise<void> {
  return locked(async () => {
    const m = await readMirror();
    if (m) await kvSet(KEY, fn(m));
  }).then(changed);
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function userId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Sign in first");
  return data.session.user.id;
}

/** Queue changes and try to send them now. Never fails just for lack of signal. */
async function commit(...ops: Op[]): Promise<void> {
  await enqueue(...ops);
  await flush();
}

const now = () => new Date().toISOString();

export function isToday(isoDateString: string | null | undefined): boolean {
  if (!isoDateString) return false;
  const d = new Date(isoDateString);
  const cur = new Date();
  return (
    d.getFullYear() === cur.getFullYear() &&
    d.getMonth() === cur.getMonth() &&
    d.getDate() === cur.getDate()
  );
}

export function isSessionCompleted(session: WorkoutSession | null | undefined): boolean {
  if (!session) return false;
  return session.end_time != null || ("completed_at" in session && (session as { completed_at?: unknown }).completed_at != null);
}

/** Workouts stay "in progress" for 12 hours, so one that runs past midnight isn't lost. */
export const OPEN_HOURS = 12;
export function isRecent(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t < OPEN_HOURS * 3_600_000;
}

const RESUMED_KEY = "resumed-session";

/** In progress: not finished, and either recent or one you chose to resume. */
async function isOpen(s: WorkoutSession | null | undefined): Promise<boolean> {
  if (!s || isSessionCompleted(s)) return false;
  return isRecent(s.start_time) || (await kvGet<string>(RESUMED_KEY)) === s.id;
}

// ---------- Reading ----------

/** The workout in progress as this phone last saw it. Instant: no network. */
export async function peekActiveWorkout(): Promise<{ session: WorkoutSession; sets: number; done: number } | null> {
  const m = await readMirror();
  if (!m) return null;
  // If completed, clear mirror and return null
  if (isSessionCompleted(m.session)) {
    await writeMirror(null);
    return null;
  }
  // Guard: an old workout you haven't chosen to resume is stale - never silently show as active
  if (!(await isOpen(m.session))) {
    return null;
  }
  return { session: m.session, sets: m.sets.length, done: m.sets.filter((s) => s.completed_at || s.is_completed).length };
}

/** The unfinished workout, from the server when it's reachable and caught up. */
export async function getActiveSession(): Promise<WorkoutSession | null> {
  await flush();
  if (await hasPending()) {
    const s = (await readMirror())?.session ?? null;
    if (s && !(await isOpen(s))) {
      await writeMirror(null);
      return null;
    }
    return s;
  }
  try {
    const active: WorkoutSession | null = unwrap(
      await getSupabase().from("workout_sessions").select("*").is("end_time", null).maybeSingle()
    );
    const m = await readMirror();
    if (!active || isSessionCompleted(active)) {
      await writeMirror(null);
      return null;
    }
    // Guard: Only restore as active if it is recent or one you chose to resume!
    if (!(await isOpen(active))) {
      if (m?.session.id === active.id) await writeMirror(null);
      return null;
    }
    if (m?.session.id !== active.id) await writeMirror({ session: active, sets: [] });
    else await writeMirror({ sets: m.sets, session: active });
    return active;
  } catch (e) {
    if (isNetworkError(e)) {
      const s = (await readMirror())?.session ?? null;
      if (s && !(await isOpen(s))) {
        await writeMirror(null);
        return null;
      }
      return s;
    }
    throw e;
  }
}

/** Check if there is an unfinished workout session from a prior day (stale). */
export async function getStaleSession(): Promise<WorkoutSession | null> {
  try {
    const m = await readMirror();
    if (m?.session && !isSessionCompleted(m.session) && !(await isOpen(m.session))) {
      return m.session;
    }
    const sessions: WorkoutSession[] = unwrap(
      await getSupabase()
        .from("workout_sessions")
        .select("*")
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
    );
    const s = sessions[0] ?? null;
    if (s && !isSessionCompleted(s) && !(await isOpen(s))) {
      return s;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resumes a stale session, making it the active session. */
export async function resumeStaleSession(session: WorkoutSession): Promise<void> {
  const sets = await listActiveSets(session.id);
  await kvSet(RESUMED_KEY, session.id);
  await writeMirror({ session, sets });
}

/** The active workout's sets (falls back to the phone's copy without signal). */
export async function listActiveSets(sessionId: string): Promise<WorkoutSet[]> {
  const local = async () => {
    const m = await readMirror();
    return m?.session.id === sessionId ? m.sets : [];
  };
  if (await hasPending()) return local();
  try {
    const sets: WorkoutSet[] = unwrap(
      await getSupabase().from("workout_sets").select("*").eq("session_id", sessionId).order("exercise_order").order("set_number"),
    );
    await changeMirror((m) => (m.session.id === sessionId ? { ...m, sets } : m));
    return sets;
  } catch (e) {
    if (isNetworkError(e)) return local();
    throw e;
  }
}

// ---------- Sessions ----------

export interface PlannedExercise {
  exercise_id: string;
  sets: number;
  warmups?: number;
  superset_group?: number | null;
  weight_kg?: number | null;
}

/** Start a workout with these exercises' sets laid out, ready to fill in. Works offline. */
export async function startPlannedSession(
  info: { name: string; routineId?: string | null; kitId?: string | null; addToCalendar?: boolean | null },
  items: PlannedExercise[],
): Promise<WorkoutSession> {
  // One workout at a time: starting a second would make finishing one pop the other open.
  const open = await readMirror();
  if (open && !isSessionCompleted(open.session)) throw new Error("one_active: finish or discard the workout you have open first");
  try {
    const { data } = await getSupabase().from("workout_sessions").select("id").is("end_time", null).limit(1);
    if (data?.length) throw new Error("one_active: finish or discard the workout you have open first");
  } catch (e) {
    if (!isNetworkError(e)) throw e; // no signal: the phone's copy above is the best we know
  }
  const uid = await userId();
  const t = now();
  const session: WorkoutSession = {
    id: crypto.randomUUID(),
    user_id: uid,
    routine_id: info.routineId ?? null,
    name: info.name,
    start_time: t,
    end_time: null,
    volume: 0,
    source: "web",
    avg_hr: null,
    max_hr: null,
    notes: null,
    at_gym: null,
    calendar_event_id: null,
    kit_id: info.kitId ?? null,
    add_to_calendar: info.addToCalendar ?? null,
    import_key: null,
    created_at: t,
    updated_at: t,
  };
  const inserts: SetInsert[] = [];
  items.forEach((item, i) => {
    let n = 1;
    const base = { session_id: session.id, exercise_id: item.exercise_id, exercise_order: i + 1, superset_group: item.superset_group ?? null, reps: 0 };
    const warmupKg = warmupWeightsKg(item.weight_kg ?? 0, item.warmups ?? 0);
    for (let w = 0; w < (item.warmups ?? 0); w++) inserts.push({ ...base, set_number: n++, set_type: "warmup", weight: warmupKg[w] });
    for (let s = 0; s < item.sets; s++) inserts.push({ ...base, set_number: n++, set_type: "normal", weight: item.weight_kg ?? 0 });
  });
  const sets = inserts.map((s) => toRow(s, uid));

  await writeMirror({ session, sets });

  // Direct write to mock local storage if active so session is instantly present
  if (isLocalBackend() && typeof window !== "undefined" && window.localStorage) {
    try {
      const sessKey = "ironlog_table_workout_sessions";
      const raw = window.localStorage.getItem(sessKey);
      const list = raw ? JSON.parse(raw) : [];
      list.push(session);
      window.localStorage.setItem(sessKey, JSON.stringify(list));
      const setsKey = "ironlog_table_workout_sets";
      const rawSets = window.localStorage.getItem(setsKey);
      const sList = rawSets ? JSON.parse(rawSets) : [];
      window.localStorage.setItem(setsKey, JSON.stringify([...sList, ...sets]));
    } catch {}
  }

  const ops: Op[] = [
    {
      kind: "insert",
      table: "workout_sessions",
      rows: [
        {
          id: session.id,
          routine_id: session.routine_id,
          name: session.name,
          source: session.source,
          start_time: t,
          // Only sent when set, so ordinary workouts don't depend on the newer columns.
          ...(info.kitId ? { kit_id: info.kitId } : {}),
          ...(info.addToCalendar != null ? { add_to_calendar: info.addToCalendar } : {}),
        },
      ],
    },
  ];
  if (sets.length) ops.push({ kind: "insert", table: "workout_sets", rows: sets.map(insertable) });
  await commit(...ops);
  return session;
}

export async function finishSession(session: WorkoutSession): Promise<{ synced: boolean }> {
  await kvSet(RESUMED_KEY, null);
  const endTime = now();
  const m = await readMirror();
  const completedSets = (m?.sets ?? []).filter((s) => (s.is_completed || s.completed_at) && s.set_type !== "warmup");
  const volume = completedSets.reduce((sum, s) => sum + ((Number(s.weight) || 0) * (Number(s.reps) || 0)), 0);

  // Clear active workout mirror atomically
  await writeMirror(null);

  // Synchronously update local mock storage if present
  if (isLocalBackend() && typeof window !== "undefined" && window.localStorage) {
    try {
      const sessKey = "ironlog_table_workout_sessions";
      const raw = window.localStorage.getItem(sessKey);
      if (raw) {
        const list = JSON.parse(raw) as Array<{ id?: string; [key: string]: unknown }>;
        const idx = list.findIndex((s) => s.id === session.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], end_time: endTime, volume, updated_at: endTime };
          window.localStorage.setItem(sessKey, JSON.stringify(list));
        }
      }
      const setsKey = "ironlog_table_workout_sets";
      const rawSets = window.localStorage.getItem(setsKey);
      if (rawSets) {
        const setsList = JSON.parse(rawSets) as Array<{ session_id?: string; is_completed?: boolean }>;
        const kept = setsList.filter((s) => !(s.session_id === session.id && !s.is_completed));
        window.localStorage.setItem(setsKey, JSON.stringify(kept));
      }
    } catch {}
  }

  const ops: Op[] = [{ kind: "finish", sessionId: session.id, endTime, volume }];
  if (session.routine_id) ops.push({ kind: "adjust", sessionId: session.id });
  await enqueue(...ops);
  return { synced: await flush() };
}

export async function discardSession(sessionId: string): Promise<void> {
  await kvSet(RESUMED_KEY, null);
  await changeMirror((m) => (m.session.id === sessionId ? null : m));
  await writeMirror(null);

  if (isLocalBackend() && typeof window !== "undefined" && window.localStorage) {
    try {
      const sessKey = "ironlog_table_workout_sessions";
      const raw = window.localStorage.getItem(sessKey);
      if (raw) {
        const list = (JSON.parse(raw) as Array<{ id?: string }>).filter((s) => s.id !== sessionId);
        window.localStorage.setItem(sessKey, JSON.stringify(list));
      }
      const setsKey = "ironlog_table_workout_sets";
      const rawSets = window.localStorage.getItem(setsKey);
      if (rawSets) {
        const list = (JSON.parse(rawSets) as Array<{ session_id?: string }>).filter((s) => s.session_id !== sessionId);
        window.localStorage.setItem(setsKey, JSON.stringify(list));
      }
    } catch {}
  }

  await commit({ kind: "delete", table: "workout_sessions", ids: [sessionId] });
}

/** The "Add to calendar?" answer for a finished home workout. */
export async function setSessionCalendar(sessionId: string, on: boolean): Promise<boolean> {
  await enqueue({ kind: "update", table: "workout_sessions", ids: [sessionId], patch: { add_to_calendar: on } });
  return flush();
}

export async function updateSessionNotes(sessionId: string, notes: string): Promise<void> {
  const value = notes.trim() || null;
  await changeMirror((m) => (m.session.id === sessionId ? { ...m, session: { ...m.session, notes: value } } : m));
  await commit({ kind: "update", table: "workout_sessions", ids: [sessionId], patch: { notes: value } });
}

// ---------- Sets ----------

function toRow(s: SetInsert, uid: string): WorkoutSet {
  const t = now();
  return {
    id: s.id ?? crypto.randomUUID(),
    session_id: s.session_id,
    user_id: uid,
    exercise_id: s.exercise_id,
    exercise_order: s.exercise_order ?? 1,
    set_number: s.set_number,
    set_type: s.set_type ?? "normal",
    weight: s.weight ?? 0,
    reps: s.reps ?? 0,
    rpe: s.rpe ?? null,
    superset_group: s.superset_group ?? null,
    parent_set_id: s.parent_set_id ?? null,
    is_completed: s.is_completed ?? false,
    completed_at: s.is_completed ? t : null,
    estimated_1rm: null,
    notes: s.notes ?? null,
    client_id: null,
    duration_seconds: s.duration_seconds ?? null,
    distance_m: s.distance_m ?? null,
    reps_left: s.reps_left ?? null,
    reps_right: s.reps_right ?? null,
    created_at: t,
    updated_at: t,
  };
}

/**
 * The columns sent to the server (the rest are filled in there). Each side's
 * reps go only when used, so logging still works before the database update.
 */
function insertable(r: WorkoutSet): Record<string, unknown> {
  const { id, session_id, exercise_id, exercise_order, set_number, set_type, weight, reps, rpe, superset_group, parent_set_id, is_completed, notes, duration_seconds, distance_m, reps_left, reps_right } = r;
  return {
    id, session_id, exercise_id, exercise_order, set_number, set_type, weight, reps, rpe, superset_group, parent_set_id, is_completed, notes, duration_seconds, distance_m,
    ...(reps_left != null && { reps_left }),
    ...(reps_right != null && { reps_right }),
  };
}

export async function insertSets(inserts: SetInsert[]): Promise<WorkoutSet[]> {
  const uid = await userId();
  const rows = inserts.map((s) => toRow(s, uid));
  await changeMirror((m) => ({ ...m, sets: [...m.sets, ...rows.filter((r) => r.session_id === m.session.id)] }));
  await commit({ kind: "insert", table: "workout_sets", rows: rows.map(insertable) });
  return rows;
}

export async function updateSets(ids: string[], patch: SetUpdate): Promise<void> {
  if (!ids.length) return;
  const stamp = patch.is_completed === true ? { completed_at: now() } : patch.is_completed === false ? { completed_at: null } : {};
  await changeMirror((m) => ({ ...m, sets: m.sets.map((s) => (ids.includes(s.id) ? { ...s, ...patch, ...stamp } : s)) }));
  await commit({ kind: "update", table: "workout_sets", ids, patch });
}

export const updateSet = (id: string, patch: SetUpdate) => updateSets([id], patch);

/**
 * Give exercises new slots in the workout. Slots are unique per set number,
 * so swapping two would clash halfway: park each moved exercise on a
 * negative slot first, then move it to its real one.
 */
export async function reorderExercises(moves: { ids: string[]; order: number }[]): Promise<void> {
  moves = moves.filter((m) => m.ids.length);
  if (!moves.length) return;
  const slot = new Map(moves.flatMap((m) => m.ids.map((id) => [id, m.order] as const)));
  await changeMirror((m) => ({ ...m, sets: m.sets.map((s) => (slot.has(s.id) ? { ...s, exercise_order: slot.get(s.id)! } : s)) }));
  await commit(
    ...moves.map((m): Op => ({ kind: "update", table: "workout_sets", ids: m.ids, patch: { exercise_order: -m.order } })),
    ...moves.map((m): Op => ({ kind: "update", table: "workout_sets", ids: m.ids, patch: { exercise_order: m.order } })),
  );
}

/**
 * Give sets new numbers within their exercise. Numbers are unique per exercise
 * slot, so move each one well out of the way first, then to its real number.
 */
export async function renumberSets(moves: { id: string; setNumber: number }[]): Promise<void> {
  if (!moves.length) return;
  const num = new Map(moves.map((m) => [m.id, m.setNumber]));
  await changeMirror((m) => ({ ...m, sets: m.sets.map((s) => (num.has(s.id) ? { ...s, set_number: num.get(s.id)! } : s)) }));
  await commit(
    ...moves.map((m): Op => ({ kind: "update", table: "workout_sets", ids: [m.id], patch: { set_number: m.setNumber + 500 } })),
    ...moves.map((m): Op => ({ kind: "update", table: "workout_sets", ids: [m.id], patch: { set_number: m.setNumber } })),
  );
}

export async function deleteSets(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await changeMirror((m) => ({ ...m, sets: m.sets.filter((s) => !ids.includes(s.id)) }));
  await commit({ kind: "delete", table: "workout_sets", ids });
}
