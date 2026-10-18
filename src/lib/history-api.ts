// Saving a whole history file (JEFIT, Strong, Hevy...) and the full backup
// download. The reading and matching is in history-import.ts and backup.ts.

import { getSupabase } from "@/lib/supabase/client";
import type { SessionToSave } from "@/lib/history-import";
import type { Database } from "@/types/database";

type SetInsert = Database["public"]["Tables"]["workout_sets"]["Insert"];

const NOT_DEPLOYED = "The database needs an update before importing. Run \"Deploy database and functions\" on GitHub (Actions tab), then try again.";

function friendly(message: string): Error {
  return new Error(/import_key/.test(message) ? NOT_DEPLOYED : message);
}

/** Local YYYY-MM-DD of a timestamp. */
function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * What's already in Ironlog: fingerprints of workouts imported from files
 * before (so they're skipped), and the days you logged a workout in Ironlog
 * itself (so the import can skip days you logged in both apps).
 */
export async function existingHistory(): Promise<{ keys: Set<string>; loggedDays: Set<string> }> {
  const keys = new Set<string>();
  const loggedDays = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await getSupabase()
      .from("workout_sessions")
      .select("start_time, import_key")
      .not("end_time", "is", null)
      .order("start_time")
      .range(from, from + page - 1);
    if (error) throw friendly(error.message);
    for (const r of data ?? []) {
      if (r.import_key) keys.add(r.import_key);
      else loggedDays.add(localDay(r.start_time));
    }
    if (!data || data.length < page) break;
  }
  return { keys, loggedDays };
}

/**
 * Save imported workouts as finished sessions (source "import"), a batch at
 * a time. A batch whose sets fail is removed again, so nothing is left half
 * saved. Calls onProgress with how many are saved so far.
 */
export async function saveHistory(sessions: SessionToSave[], onProgress: (saved: number) => void): Promise<number> {
  const supabase = getSupabase();
  const batch = 40;
  let saved = 0;
  for (let i = 0; i < sessions.length; i += batch) {
    const chunk = sessions.slice(i, i + batch);
    const { data: rows, error } = await supabase
      .from("workout_sessions")
      .insert(
        chunk.map((s) => ({
          name: s.name.slice(0, 80),
          start_time: s.start.toISOString(),
          end_time: new Date(s.start.getTime() + Math.max(1, s.minutes) * 60_000).toISOString(),
          source: "import" as const,
          import_key: s.import_key,
        })),
      )
      .select("id, import_key");
    if (error) {
      // Imported by another phone in the meantime: fall back to one at a time so the rest still go in.
      if (/duplicate key|unique/i.test(error.message) && chunk.length > 1) {
        for (const one of chunk) {
          try {
            saved += await saveHistory([one], () => {});
          } catch (e) {
            if (!/duplicate key|unique/i.test((e as Error).message)) throw e;
          }
          onProgress(saved);
        }
        continue;
      }
      throw friendly(error.message);
    }
    const idByKey = new Map((rows ?? []).map((r) => [r.import_key, r.id]));
    const sets: SetInsert[] = chunk.flatMap((s) => {
      const id = idByKey.get(s.import_key)!;
      const startMs = s.start.getTime();
      const span = Math.max(1, s.minutes) * 60_000;
      const total = s.exercises.reduce((n, x) => n + x.sets.length, 0);
      let k = 0;
      // Set times spread across the workout, like a workout logged live.
      return s.exercises.flatMap((x, order) =>
        x.sets.map((set, j) => ({
          session_id: id,
          exercise_id: x.exercise_id,
          exercise_order: order + 1,
          set_number: j + 1,
          set_type: set.set_type,
          weight: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe,
          duration_seconds: set.duration_seconds,
          is_completed: true,
          completed_at: new Date(startMs + (++k / (total + 1)) * span).toISOString(),
        })),
      );
    });
    try {
      for (let j = 0; j < sets.length; j += 1000) {
        const { error: setError } = await supabase.from("workout_sets").insert(sets.slice(j, j + 1000));
        if (setError) throw new Error(setError.message);
      }
    } catch (e) {
      await supabase.from("workout_sessions").delete().in("id", [...idByKey.values()]);
      throw friendly((e as Error).message);
    }
    saved += chunk.length;
    onProgress(saved);
  }
  return saved;
}

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];
type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];

/**
 * Add an exercise from the file that Ironlog doesn't have, as one of your own.
 * The name in the file is kept as another name for it, so the next import
 * (and Claude) find it.
 */
export async function createImportedExercise(
  userId: string,
  input: Pick<ExerciseInsert, "name" | "primary_muscle" | "equipment" | "mechanic" | "tracking">,
): Promise<ExerciseRow> {
  const base = input.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "exercise";
  for (let n = 1; n <= 5; n++) {
    const { data, error } = await getSupabase()
      .from("exercises")
      .insert({ ...input, name: input.name.trim().slice(0, 80), slug: n === 1 ? base : `${base}-${n}`, created_by: userId, aliases: [input.name.trim()] })
      .select()
      .single();
    if (!error) return data;
    if (!/duplicate key|unique/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error(`Couldn't add ${input.name}: you already have exercises with that name.`);
}
