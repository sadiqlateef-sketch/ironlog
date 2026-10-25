// Workouts logged while the app ran on the local test backend (the Oct 23-25
// builds) live only in this phone's localStorage. This sends the finished ones
// to your account once. Nothing on the phone is deleted.

import { getSupabase, isLocalBackend } from "./supabase/client.ts";
import { LOCAL_EXERCISES } from "./supabase/mock-backend.ts";

const DONE_KEY = "ironlog.legacy-upload.done";
type Row = Record<string, unknown>;
type LocalExercise = { slug: string; name: string };
type LibraryExercise = { id: string; slug: string; name: string };

function read(key: string): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const finished = () => read("ironlog_table_workout_sessions").filter((s) => s.end_time && s.id);

/** How many saved-on-phone workouts are waiting to be uploaded (0 when done or not applicable). */
export function legacyWorkoutCount(): number {
  if (typeof window === "undefined" || isLocalBackend()) return 0;
  try {
    if (localStorage.getItem(DONE_KEY)) return 0;
  } catch {
    return 0;
  }
  return finished().length;
}

/** "Not now": don't ask again on this phone. */
export function skipLegacyUpload() {
  try {
    localStorage.setItem(DONE_KEY, "skipped");
  } catch {}
}

/**
 * Finds the real library id for an exercise saved by the local backend.
 * Matches by slug first, then by name. Ids the real library already knows pass through.
 */
export function matchExercise(
  localId: string,
  localIndex: Map<string, LocalExercise>,
  library: LibraryExercise[],
): string | null {
  const e = localIndex.get(localId);
  if (!e) return library.some((x) => x.id === localId) ? localId : null;
  const bySlug = new Map(library.map((x) => [x.slug, x.id]));
  const byName = new Map(library.map((x) => [x.name.toLowerCase(), x.id]));
  return bySlug.get(e.slug) ?? byName.get(e.name.toLowerCase()) ?? null;
}

export interface UploadResult {
  workouts: number;
  sets: number;
  /** Exercises that couldn't be matched to your library (their sets weren't sent). */
  unmatched: string[];
  /** Workouts the server refused, with its message. */
  failed: string[];
}

export async function uploadLegacyWorkouts(): Promise<UploadResult> {
  const db = getSupabase();
  const sessions = finished();
  const sets = read("ironlog_table_workout_sets").filter((s) => s.session_id && (s.is_completed || s.completed_at));

  // The local backend used its own exercise ids: match them to your real library by slug, then by name.
  const local = new Map<string, LocalExercise>();
  for (const e of [...LOCAL_EXERCISES, ...read("ironlog_custom_exercises")] as Row[])
    local.set(String(e.id), { slug: String(e.slug ?? ""), name: String(e.name ?? "") });
  const { data, error: libErr } = await db.from("exercises").select("id, slug, name");
  if (libErr) throw new Error(libErr.message);
  const library: LibraryExercise[] = data ?? [];

  const result: UploadResult = { workouts: 0, sets: 0, unmatched: [], failed: [] };
  for (const s of sessions) {
    const { error } = await db.from("workout_sessions").upsert(
      [{ id: String(s.id), name: (s.name as string) ?? "Workout", start_time: String(s.start_time), end_time: String(s.end_time), source: "web", notes: (s.notes as string) ?? null }],
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) {
      result.failed.push(`${s.name ?? "Workout"} (${String(s.start_time).slice(0, 10)}): ${error.message}`);
      continue;
    }
    const rows = [];
    for (const x of sets.filter((x) => x.session_id === s.id)) {
      const exercise_id = matchExercise(String(x.exercise_id), local, library);
      if (!exercise_id) {
        const name = local.get(String(x.exercise_id))?.name ?? String(x.exercise_id);
        if (!result.unmatched.includes(name)) result.unmatched.push(name);
        continue;
      }
      rows.push({
        id: String(x.id), session_id: String(s.id), exercise_id,
        exercise_order: Number(x.exercise_order) || 1, set_number: Number(x.set_number) || 1,
        set_type: (x.set_type as string) ?? "normal", weight: Number(x.weight) || 0, reps: Number(x.reps) || 0,
        rpe: x.rpe == null ? null : Number(x.rpe), is_completed: true, notes: (x.notes as string) ?? null,
        duration_seconds: x.duration_seconds == null ? null : Number(x.duration_seconds),
        distance_m: x.distance_m == null ? null : Number(x.distance_m),
      });
    }
    if (rows.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: setErr } = await db.from("workout_sets").upsert(rows as any, { onConflict: "id", ignoreDuplicates: true });
      if (setErr) {
        result.failed.push(`${s.name ?? "Workout"} sets: ${setErr.message}`);
        continue;
      }
    }
    result.workouts++;
    result.sets += rows.length;
  }
  if (!result.failed.length) {
    try {
      localStorage.setItem(DONE_KEY, new Date().toISOString());
    } catch {}
  }
  return result;
}
