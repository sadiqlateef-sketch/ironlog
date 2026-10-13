// Every database call the workout screens make, in one place.
// Row Level Security makes sure each query only ever touches the signed-in
// user's rows, so there is no user_id filtering to forget here.

import { getSupabase } from "@/lib/supabase/client";
import type { Database, Tables } from "@/types/database";

export type Exercise = Tables<"exercises">;
export type WorkoutSet = Tables<"workout_sets">;
export type WorkoutSession = Tables<"workout_sessions">;
export type Routine = Tables<"routines">;
export type LastPerformance = Database["public"]["Functions"]["get_last_performance"]["Returns"];
type SetInsert = Database["public"]["Tables"]["workout_sets"]["Insert"];
type SetUpdate = Database["public"]["Tables"]["workout_sets"]["Update"];

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------- Exercises ----------

export async function listExercises(): Promise<Exercise[]> {
  return unwrap(await getSupabase().from("exercises").select("*").order("name"));
}

export async function createExercise(input: {
  name: string;
  primary_muscle: Exercise["primary_muscle"];
  secondary_muscles: Exercise["secondary_muscles"];
  equipment: Exercise["equipment"];
  mechanic: Exercise["mechanic"];
  userId: string;
}): Promise<Exercise> {
  const slug = input.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const { userId, ...rest } = input;
  return unwrap(
    await getSupabase()
      .from("exercises")
      .insert({ ...rest, slug, created_by: userId })
      .select()
      .single(),
  );
}

export async function getLastPerformance(exerciseId: string): Promise<LastPerformance> {
  return unwrap(await getSupabase().rpc("get_last_performance", { p_exercise_id: exerciseId })) ?? [];
}

// ---------- Sessions ----------

export async function getActiveSession(): Promise<WorkoutSession | null> {
  return unwrap(
    await getSupabase().from("workout_sessions").select("*").is("end_time", null).maybeSingle(),
  );
}

export async function listRecentSessions(limit = 5): Promise<WorkoutSession[]> {
  return unwrap(
    await getSupabase()
      .from("workout_sessions")
      .select("*")
      .not("end_time", "is", null)
      .order("start_time", { ascending: false })
      .limit(limit),
  );
}

export async function listRoutines(): Promise<Routine[]> {
  return unwrap(
    await getSupabase().from("routines").select("*").eq("archived", false).order("position"),
  );
}

/**
 * Start a workout. From a routine, the sets are created up front with the
 * routine's targets so logging is just "check, check, check".
 */
export async function startSession(routine?: Routine): Promise<WorkoutSession> {
  const supabase = getSupabase();
  const session: WorkoutSession = unwrap(
    await supabase
      .from("workout_sessions")
      .insert({ routine_id: routine?.id ?? null, name: routine?.name ?? "Workout", source: "web" })
      .select()
      .single(),
  );

  if (routine) {
    const items = unwrap(
      await supabase.from("routine_exercises").select("*").eq("routine_id", routine.id).order("position"),
    );
    // Every row spells out weight and reps: in a bulk insert, a key missing
    // from one row is sent as null rather than the column default.
    const sets: SetInsert[] = [];
    items.forEach((item, i) => {
      let n = 1;
      for (let w = 0; w < item.warmup_sets; w++) {
        sets.push({ session_id: session.id, exercise_id: item.exercise_id, exercise_order: i + 1, set_number: n++, set_type: "warmup", superset_group: item.superset_group, weight: 0, reps: 0 });
      }
      for (let s = 0; s < item.target_sets; s++) {
        sets.push({ session_id: session.id, exercise_id: item.exercise_id, exercise_order: i + 1, set_number: n++, set_type: "normal", superset_group: item.superset_group, weight: item.target_weight_kg ?? 0, reps: 0 });
      }
    });
    if (sets.length) unwrap(await supabase.from("workout_sets").insert(sets).select("id"));
  }
  return session;
}

export async function finishSession(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  // Unchecked sets were never done, so they don't belong in your history.
  unwrap(await supabase.from("workout_sets").delete().eq("session_id", sessionId).eq("is_completed", false).select("id"));
  unwrap(await supabase.from("workout_sessions").update({ end_time: new Date().toISOString() }).eq("id", sessionId).select("id"));
}

export async function discardSession(sessionId: string): Promise<void> {
  unwrap(await getSupabase().from("workout_sessions").delete().eq("id", sessionId).select("id"));
}

/** Routine targets (rest time, rep range) for the exercises in a session. */
export async function getRoutineTargets(routineId: string) {
  return unwrap(
    await getSupabase().from("routine_exercises").select("*").eq("routine_id", routineId).order("position"),
  );
}

// ---------- Sets ----------

export async function listSessionSets(sessionId: string): Promise<WorkoutSet[]> {
  return unwrap(
    await getSupabase()
      .from("workout_sets")
      .select("*")
      .eq("session_id", sessionId)
      .order("exercise_order")
      .order("set_number"),
  );
}

export async function insertSets(sets: SetInsert[]): Promise<WorkoutSet[]> {
  return unwrap(await getSupabase().from("workout_sets").insert(sets).select());
}

export async function updateSet(id: string, patch: SetUpdate): Promise<void> {
  unwrap(await getSupabase().from("workout_sets").update(patch).eq("id", id).select("id"));
}

export async function deleteSets(ids: string[]): Promise<void> {
  if (ids.length) unwrap(await getSupabase().from("workout_sets").delete().in("id", ids).select("id"));
}

// ---------- Analytics (Phase 3) ----------

export type LoggedExercise = Database["public"]["Functions"]["get_logged_exercises"]["Returns"][number];
export type E1rmPoint = Database["public"]["Functions"]["get_e1rm_history"]["Returns"][number];

export async function listSessionsSince(since: Date): Promise<WorkoutSession[]> {
  return unwrap(
    await getSupabase()
      .from("workout_sessions")
      .select("*")
      .not("end_time", "is", null)
      .gte("start_time", since.toISOString())
      .order("start_time"),
  );
}

export async function getLoggedExercises(): Promise<LoggedExercise[]> {
  return unwrap(await getSupabase().rpc("get_logged_exercises")) ?? [];
}

export async function getE1rmHistory(exerciseId: string, since: Date): Promise<E1rmPoint[]> {
  const rows: E1rmPoint[] =
    unwrap(await getSupabase().rpc("get_e1rm_history", { p_exercise_id: exerciseId, p_since: since.toISOString() })) ?? [];
  return rows.sort((a, b) => a.performed_at.localeCompare(b.performed_at));
}

export async function getMuscleSets(since: Date) {
  return unwrap(await getSupabase().rpc("get_muscle_sets", { p_since: since.toISOString() })) ?? [];
}

// ---------- AI programs & adjustments (Phase 4) ----------

export type RoutineExercise = Tables<"routine_exercises">;
export type Adjustment = Tables<"routine_adjustments">;

export interface PlanInput {
  goal: "strength" | "hypertrophy" | "powerbuilding" | "general";
  methodology: "auto" | "531" | "sheiko" | "rp" | "linear";
  days_per_week: number;
  session_minutes: number;
  experience: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  notes: string;
}

export interface ProgramMeta {
  program_id: string;
  program_name: string;
  methodology: string;
  summary: string;
  progression_rule: string;
  day_index: number;
  generated_at: string;
}

export type RoutineWithExercises = Routine & {
  routine_exercises: (RoutineExercise & { exercises: Pick<Exercise, "name" | "equipment"> | null })[];
};

/** Turn an Edge Function failure into the message it sent back. */
async function functionError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.json();
      if (body?.error) return new Error(body.error);
    } catch {}
  }
  return new Error((error as Error)?.message ?? "Request failed");
}

export async function generatePlan(input: PlanInput): Promise<{ program_id: string; program_name: string }> {
  const { data, error } = await getSupabase().functions.invoke("generate-plan", { body: input });
  if (error) throw await functionError(error);
  return data;
}

export async function listRoutinesWithExercises(): Promise<RoutineWithExercises[]> {
  return unwrap(
    await getSupabase()
      .from("routines")
      .select("*, routine_exercises(*, exercises(name, equipment))")
      .eq("archived", false)
      .order("position")
      .order("position", { referencedTable: "routine_exercises" }),
  ) as unknown as RoutineWithExercises[];
}

export async function deleteRoutines(ids: string[]): Promise<void> {
  unwrap(await getSupabase().from("routines").delete().in("id", ids).select("id"));
}

export type AdjustmentWithContext = Adjustment & {
  routine_exercises: { target_reps: number; target_reps_max: number | null; exercises: { name: string } | null; routines: { name: string } | null } | null;
};

export async function requestAdjustments(sessionId: string): Promise<void> {
  const { error } = await getSupabase().functions.invoke("suggest-adjustments", { body: { session_id: sessionId } });
  if (error) throw await functionError(error);
}

export async function listPendingAdjustments(sessionId?: string): Promise<AdjustmentWithContext[]> {
  let q = getSupabase()
    .from("routine_adjustments")
    .select("*, routine_exercises(target_reps, target_reps_max, exercises(name), routines(name))")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (sessionId) q = q.eq("session_id", sessionId);
  return unwrap(await q) as unknown as AdjustmentWithContext[];
}

export async function applyAdjustment(id: string): Promise<void> {
  unwrap(await getSupabase().rpc("apply_routine_adjustment", { p_id: id }));
}

export async function dismissAdjustment(id: string): Promise<void> {
  unwrap(await getSupabase().from("routine_adjustments").update({ status: "dismissed" }).eq("id", id).select("id"));
}
