// Every database call the workout screens make, in one place.
// Row Level Security makes sure each query only ever touches the signed-in
// user's rows, so there is no user_id filtering to forget here.

import { getSupabase } from "@/lib/supabase/client";
import { cachedRead } from "@/lib/offline/cache";
import { kvGet } from "@/lib/offline/kv";
import { isNetworkError } from "@/lib/offline/queue";
import { startPlannedSession, type PlannedExercise } from "@/lib/offline/workout-store";
import type { ExportSet } from "@/lib/export-csv";
import type { EditPlan } from "@/lib/session-edit";
import { bestE1rm } from "@/lib/workout-logic";
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
  return cachedRead("exercises", async () => unwrap(await getSupabase().from("exercises").select("*").order("name")));
}

export async function getExercise(id: string): Promise<Exercise> {
  return unwrap(await getSupabase().from("exercises").select("*").eq("id", id).single());
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
  return cachedRead(`last:${exerciseId}`, async () =>
    unwrap(await getSupabase().rpc("get_last_performance", { p_exercise_id: exerciseId })) ?? [],
    [],
  );
}

export type ExercisePrefs = Tables<"exercise_prefs">;

export async function getExercisePrefs(exerciseId: string): Promise<ExercisePrefs | null> {
  return unwrap(await getSupabase().from("exercise_prefs").select("*").eq("exercise_id", exerciseId).maybeSingle());
}

export async function saveExercisePrefs(
  exerciseId: string,
  patch: Partial<Pick<ExercisePrefs, "goal_weight_kg" | "favorite" | "notes">>,
): Promise<ExercisePrefs> {
  return unwrap(
    await getSupabase()
      .from("exercise_prefs")
      .upsert({ exercise_id: exerciseId, ...patch }, { onConflict: "user_id,exercise_id" })
      .select()
      .single(),
  );
}

export async function listFavoriteExerciseIds(): Promise<string[]> {
  const rows = unwrap(await getSupabase().from("exercise_prefs").select("exercise_id").eq("favorite", true));
  return rows.map((r) => r.exercise_id);
}

/** Every finished set of one exercise, with the workouts they came from. */
export async function getExerciseHistory(exerciseId: string) {
  const sets = unwrap(
    await getSupabase()
      .from("workout_sets")
      .select("session_id, set_number, set_type, weight, reps, completed_at, duration_seconds, distance_m")
      .eq("exercise_id", exerciseId)
      .eq("is_completed", true)
      .order("completed_at", { ascending: false })
      .limit(1000),
  );
  const ids = [...new Set(sets.map((s) => s.session_id))];
  const sessions = ids.length
    ? unwrap(
        await getSupabase()
          .from("workout_sessions")
          .select("id, start_time, name")
          .in("id", ids)
          .not("end_time", "is", null),
      )
    : [];
  return { sets, sessions };
}

// ---------- Sessions ----------

// The workout in progress lives in the offline store (works without signal).
export { getActiveSession, startPlannedSession, type PlannedExercise } from "@/lib/offline/workout-store";

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

/** Your own routines. Program workouts are reached through their program. */
export async function listRoutines(): Promise<Routine[]> {
  return cachedRead("routines", async () =>
    unwrap(await getSupabase().from("routines").select("*").eq("archived", false).is("program_id", null).order("position")),
  );
}

/**
 * Start a workout. From a routine, the sets are created up front with the
 * routine's targets so logging is just "check, check, check".
 */
export async function startSession(routine?: Routine): Promise<WorkoutSession> {
  const items = routine
    ? (await getRoutineTargets(routine.id)).map(
        (x): PlannedExercise => ({
          exercise_id: x.exercise_id,
          sets: x.target_sets,
          warmups: x.warmup_sets,
          superset_group: x.superset_group,
          weight_kg: x.target_weight_kg,
        }),
      )
    : [];
  return startPlannedSession({ name: routine?.name ?? "Workout", routineId: routine?.id ?? null }, items);
}

export async function discardSession(sessionId: string): Promise<void> {
  unwrap(await getSupabase().from("workout_sessions").delete().eq("id", sessionId).select("id"));
}

/** Routine targets (rest time, rep range) for the exercises in a session. */
export async function getRoutineTargets(routineId: string): Promise<RoutineExercise[]> {
  try {
    return await cachedRead(`targets:${routineId}`, async () =>
      unwrap(await getSupabase().from("routine_exercises").select("*").eq("routine_id", routineId).order("position")),
    );
  } catch (e) {
    // Offline and never opened this one: the saved program/routine lists have it too.
    if (!isNetworkError(e)) throw e;
    const [programs, routines] = await Promise.all([
      kvGet<ProgramWithWorkouts[]>("cache:programs"),
      kvGet<RoutineWithExercises[]>("cache:routines-full"),
    ]);
    const found = [...(programs ?? []).flatMap((p) => p.routines), ...(routines ?? [])].find((r) => r.id === routineId);
    if (!found) throw e;
    return [...found.routine_exercises].sort((a, b) => a.position - b.position);
  }
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

/** Swap: move these sets onto another exercise. */
export async function moveSetsToExercise(ids: string[], exerciseId: string): Promise<void> {
  if (ids.length) unwrap(await getSupabase().from("workout_sets").update({ exercise_id: exerciseId }).in("id", ids).select("id"));
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
  weeks: number;
  session_minutes: number;
  experience: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  notes: string;
  /** Planned lighter weeks every few weeks ("auto") or none. */
  deload?: "auto" | "off";
}

export type RoutineWithExercises = Routine & {
  routine_exercises: (RoutineExercise & { exercises: Pick<Exercise, "name" | "equipment" | "primary_muscle" | "image_urls"> | null })[];
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

/** Phase 6: link a watch by entering the 6-digit code it shows. */
export async function claimWatchCode(code: string): Promise<void> {
  const { error } = await getSupabase().functions.invoke("watch-pair", { body: { action: "claim", code } });
  if (error) throw await functionError(error);
}

export async function listRoutinesWithExercises(): Promise<RoutineWithExercises[]> {
  return cachedRead("routines-full", async () => unwrap(
    await getSupabase()
      .from("routines")
      .select("*, routine_exercises(*, exercises(name, equipment, primary_muscle, image_urls))")
      .eq("archived", false)
      .is("program_id", null)
      .order("position")
      .order("position", { referencedTable: "routine_exercises" }),
  ) as unknown as RoutineWithExercises[]);
}

// ---------- Programs ----------

export type Program = Tables<"programs">;
export type ProgramWithWorkouts = Program & { routines: RoutineWithExercises[] };
export type ProgramProgress = Database["public"]["Functions"]["program_progress"]["Returns"][number];

export async function listPrograms(): Promise<ProgramWithWorkouts[]> {
  return cachedRead("programs", async () => unwrap(
    await getSupabase()
      .from("programs")
      .select("*, routines(*, routine_exercises(*, exercises(name, equipment, primary_muscle, image_urls)))")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .order("program_week", { referencedTable: "routines" })
      .order("program_day", { referencedTable: "routines" }),
  ) as unknown as ProgramWithWorkouts[]);
}

/** Where you are in a program (your active one when no id is given). */
export async function getProgramProgress(programId?: string): Promise<ProgramProgress | null> {
  return cachedRead(`progress:${programId ?? "active"}`, async () => {
    const rows = unwrap(await getSupabase().rpc("program_progress", programId ? { p_program_id: programId } : {}));
    return rows[0] ?? null;
  });
}

/** Make this your one active program and start it from week 1, day 1. */
export async function startProgram(id: string): Promise<void> {
  unwrap(await getSupabase().rpc("start_program", { p_id: id }));
}

export async function stopProgram(id: string): Promise<void> {
  unwrap(await getSupabase().rpc("stop_program", { p_id: id }));
}

export async function deleteProgram(id: string): Promise<void> {
  unwrap(await getSupabase().from("programs").delete().eq("id", id).select("id"));
}

export async function getRoutine(id: string): Promise<Routine> {
  return unwrap(await getSupabase().from("routines").select("*").eq("id", id).single());
}

/** One exercise in the workout editor. `id` is null for a newly added one. */
export interface EditableItem {
  id: string | null;
  exercise_id: string;
  name: string;
  target_sets: number;
  target_reps: number;
  target_reps_max: number | null;
  target_weight_kg: number | null;
}

/**
 * Save edits to a workout. With `laterWeeks`, the same changes carry over to
 * this day in every later week of the program: swaps, removals and additions
 * as-is, sets and reps set to the new values, and weight moved by the same
 * amount so each week keeps its place in the progression.
 */
export async function saveWorkoutEdits(
  routine: RoutineWithExercises,
  edited: EditableItem[],
  laterWeeks: boolean,
): Promise<void> {
  const supabase = getSupabase();
  const before = new Map(routine.routine_exercises.map((x) => [x.id, x]));
  const kept = new Set(edited.filter((e) => e.id).map((e) => e.id!));
  const removed = routine.routine_exercises.filter((x) => !kept.has(x.id));
  const added = edited.filter((e) => !e.id);
  const changed = edited.filter((e) => {
    const b = e.id ? before.get(e.id) : undefined;
    return (
      b &&
      (b.exercise_id !== e.exercise_id ||
        b.target_sets !== e.target_sets ||
        b.target_reps !== e.target_reps ||
        b.target_reps_max !== e.target_reps_max ||
        b.target_weight_kg !== e.target_weight_kg)
    );
  });

  type Target = { routine_id: string; rows: RoutineExercise[] };
  const targets: Target[] = [{ routine_id: routine.id, rows: routine.routine_exercises }];
  if (laterWeeks && routine.program_id) {
    const later = unwrap(
      await supabase
        .from("routines")
        .select("id, routine_exercises(*)")
        .eq("program_id", routine.program_id)
        .eq("program_day", routine.program_day!)
        .gt("program_week", routine.program_week!),
    ) as unknown as { id: string; routine_exercises: RoutineExercise[] }[];
    targets.push(...later.map((r) => ({ routine_id: r.id, rows: r.routine_exercises })));
  }

  for (const t of targets) {
    const isThis = t.routine_id === routine.id;
    // In a later week, find the matching row: same exercise, nearest position.
    const match = (orig: RoutineExercise) =>
      isThis
        ? orig
        : t.rows
            .filter((r) => r.exercise_id === orig.exercise_id)
            .sort((a, b) => Math.abs(a.position - orig.position) - Math.abs(b.position - orig.position))[0];

    for (const e of changed) {
      const orig = before.get(e.id!)!;
      const row = match(orig);
      if (!row) continue;
      const weightChanged = orig.target_weight_kg !== e.target_weight_kg;
      let weight = row.target_weight_kg;
      if (weightChanged) {
        weight =
          isThis || e.target_weight_kg == null || orig.target_weight_kg == null || row.target_weight_kg == null
            ? e.target_weight_kg
            : Math.max(0, row.target_weight_kg + (e.target_weight_kg - orig.target_weight_kg));
      }
      unwrap(
        await supabase
          .from("routine_exercises")
          .update({
            exercise_id: e.exercise_id,
            target_sets: e.target_sets,
            target_reps: e.target_reps,
            target_reps_max: e.target_reps_max,
            target_weight_kg: weight,
            // A weight you set yourself replaces the percent-of-max target.
            ...(weightChanged ? { target_percent_1rm: null } : {}),
          })
          .eq("id", row.id)
          .select("id"),
      );
    }

    const gone = removed.map(match).filter((r): r is RoutineExercise => !!r).map((r) => r.id);
    if (gone.length) unwrap(await supabase.from("routine_exercises").delete().in("id", gone).select("id"));

    if (added.length) {
      let position = Math.max(0, ...t.rows.map((r) => r.position));
      unwrap(
        await supabase
          .from("routine_exercises")
          .insert(
            added.map((e) => ({
              routine_id: t.routine_id,
              exercise_id: e.exercise_id,
              position: ++position,
              target_sets: e.target_sets,
              target_reps: e.target_reps,
              target_reps_max: e.target_reps_max,
              target_weight_kg: e.target_weight_kg,
            })),
          )
          .select("id"),
      );
    }
  }
}

export async function deleteRoutines(ids: string[]): Promise<void> {
  unwrap(await getSupabase().from("routines").delete().in("id", ids).select("id"));
}

export type AdjustmentWithContext = Adjustment & {
  routine_exercises: { target_reps: number; target_reps_max: number | null; exercises: { name: string } | null; routines: { name: string } | null } | null;
};

export interface AdjustmentCheck {
  /** That was a deload week: nothing to change. */
  deload_week?: boolean;
  /** You keep missing your targets: take a deload week now? */
  early_deload?: { program_id: string; reason: string } | null;
}

export async function requestAdjustments(sessionId: string): Promise<AdjustmentCheck> {
  const { data, error } = await getSupabase().functions.invoke("suggest-adjustments", { body: { session_id: sessionId } });
  if (error) throw await functionError(error);
  return (data ?? {}) as AdjustmentCheck;
}

/** Slot a deload week in at your next week. Returns its week number. */
export async function applyEarlyDeload(programId: string): Promise<number> {
  return unwrap(await getSupabase().rpc("apply_early_deload", { p_program_id: programId }));
}

export async function dismissEarlyDeload(programId: string): Promise<void> {
  unwrap(await getSupabase().rpc("dismiss_early_deload", { p_program_id: programId }));
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

// ---------- Workout tab: ordering, history, templates ----------

export async function reorderRoutineExercises(routineId: string, ids: string[]): Promise<void> {
  unwrap(await getSupabase().rpc("reorder_routine_exercises", { p_routine_id: routineId, p_ids: ids }));
}

export async function reorderProgramDays(programId: string, week: number, routineIds: string[]): Promise<void> {
  unwrap(await getSupabase().rpc("reorder_program_days", { p_program_id: programId, p_week: week, p_routine_ids: routineIds }));
}

/** Finished workouts from the last year, newest first: which routine and when. */
export async function listWorkoutLog(): Promise<Pick<WorkoutSession, "id" | "routine_id" | "name" | "start_time">[]> {
  return cachedRead("workout-log", async () => unwrap(
    await getSupabase()
      .from("workout_sessions")
      .select("id, routine_id, name, start_time")
      .not("end_time", "is", null)
      .gte("start_time", new Date(Date.now() - 365 * 86_400_000).toISOString())
      .order("start_time", { ascending: false }),
  ));
}

type TemplateLike = {
  name: string;
  description: string;
  weeks: number;
  days: { name: string; items: { slug: string; sets: number; reps: number; repsMax?: number; rest?: number; warmups?: number }[] }[];
};

async function insertRoutineItems(routineId: string, items: TemplateLike["days"][number]["items"], ids: Map<string, string>) {
  const rows = items
    .filter((it) => ids.has(it.slug))
    .map((it, i) => ({
      routine_id: routineId,
      exercise_id: ids.get(it.slug)!,
      position: i + 1,
      target_sets: it.sets,
      target_reps: it.reps,
      target_reps_max: it.repsMax ?? null,
      warmup_sets: it.warmups ?? 0,
      rest_seconds: it.rest ?? 120,
      superset_group: null,
      target_weight_kg: null,
      target_rpe: null,
      notes: null,
    }));
  if (rows.length) unwrap(await getSupabase().from("routine_exercises").insert(rows).select("id"));
}

/** Look up built-in exercise ids by slug. */
async function idsForSlugs(slugs: string[]): Promise<Map<string, string>> {
  const rows = unwrap(await getSupabase().from("exercises").select("id, slug").in("slug", slugs).is("created_by", null));
  return new Map(rows.map((r) => [r.slug, r.id]));
}

/** Copy a ready-made plan into your programs, optionally starting it now. */
export async function copyTemplateProgram(t: TemplateLike, start: boolean): Promise<string> {
  const supabase = getSupabase();
  const ids = await idsForSlugs([...new Set(t.days.flatMap((d) => d.items.map((i) => i.slug)))]);
  const program: Program = unwrap(
    await supabase
      .from("programs")
      .insert({ name: t.name, summary: t.description, weeks: t.weeks, days_per_week: t.days.length, ai_generated: false })
      .select()
      .single(),
  );
  for (let week = 1; week <= t.weeks; week++) {
    const routines = unwrap(
      await supabase
        .from("routines")
        .insert(t.days.map((d, i) => ({ name: d.name, program_id: program.id, program_week: week, program_day: i + 1, position: i })))
        .select("id, program_day"),
    );
    for (const r of routines) await insertRoutineItems(r.id, t.days[r.program_day! - 1].items, ids);
  }
  if (start) await startProgram(program.id);
  return program.id;
}

/** Save one ready-made workout as a routine you can start any time. */
export async function copyTemplateRoutine(day: TemplateLike["days"][number], description: string): Promise<Routine> {
  const ids = await idsForSlugs(day.items.map((i) => i.slug));
  const routine: Routine = unwrap(await getSupabase().from("routines").insert({ name: day.name, description }).select().single());
  await insertRoutineItems(routine.id, day.items, ids);
  return routine;
}

/** Start a ready-made workout right now without saving it. */
export async function startTemplateWorkout(day: TemplateLike["days"][number]): Promise<WorkoutSession> {
  const ids = await idsForSlugs(day.items.map((i) => i.slug));
  return startPlannedSession(
    { name: day.name },
    day.items.filter((i) => ids.has(i.slug)).map((i) => ({ exercise_id: ids.get(i.slug)!, sets: i.sets, warmups: i.warmups })),
  );
}

// ---------- Progress overview ----------

export type StatsSet = Pick<WorkoutSet, "session_id" | "exercise_id" | "set_type" | "weight" | "reps" | "completed_at">;

/** Every finished set since a date, paged so long histories aren't cut off at 1,000 rows. */
export async function listFinishedSetsSince(since: Date): Promise<StatsSet[]> {
  const out: StatsSet[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const rows: StatsSet[] = unwrap(
      await getSupabase()
        .from("workout_sets")
        .select("session_id, exercise_id, set_type, weight, reps, completed_at")
        .eq("is_completed", true)
        .gte("completed_at", since.toISOString())
        .order("completed_at")
        .range(from, from + page - 1),
    );
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

/** How many workouts you've ever finished. */
export async function countFinishedSessions(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("workout_sessions")
    .select("id", { count: "exact", head: true })
    .not("end_time", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getSession(id: string): Promise<WorkoutSession> {
  return unwrap(await getSupabase().from("workout_sessions").select("*").eq("id", id).single());
}

/**
 * Your best estimated 1RM (kg) for each exercise from every other workout,
 * so the logger can tell when a set beats it. Warm-ups don't count.
 */
export async function getBestE1rms(exerciseIds: string[], excludeSessionId: string): Promise<Map<string, number>> {
  const best = new Map<string, number>(exerciseIds.map((id) => [id, 0]));
  if (!exerciseIds.length) return best;
  const page = 1000;
  for (let from = 0; ; from += page) {
    let rows;
    try {
      rows = unwrap(
      await getSupabase()
        .from("workout_sets")
        .select("exercise_id, weight, reps")
        .in("exercise_id", exerciseIds)
        .eq("is_completed", true)
        .neq("set_type", "warmup")
        .neq("session_id", excludeSessionId)
        .order("id")
        .range(from, from + page - 1),
      );
    } catch (e) {
      // No signal: no record pop-ups this time rather than no logging.
      if (isNetworkError(e)) return best;
      throw e;
    }
    for (const r of rows) best.set(r.exercise_id, Math.max(best.get(r.exercise_id) ?? 0, bestE1rm([r])));
    if (rows.length < page) return best;
  }
}

// ---------- Fix or delete a finished workout ----------

/** Finished workouts that started on this local calendar day, earliest first. */
export async function listSessionsOn(day: Date): Promise<WorkoutSession[]> {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return unwrap(
    await getSupabase()
      .from("workout_sessions")
      .select("*")
      .not("end_time", "is", null)
      .gte("start_time", start.toISOString())
      .lt("start_time", end.toISOString())
      .order("start_time"),
  );
}

/**
 * Save fixes to a finished workout. Removals go first so nothing collides;
 * volume, records, charts and recovery all read the sets, so they follow.
 */
export async function saveSessionEdits(sessionId: string, name: string | null, plan: EditPlan): Promise<void> {
  const supabase = getSupabase();
  if (name !== null) {
    unwrap(await supabase.from("workout_sessions").update({ name: name.trim() || "Workout" }).eq("id", sessionId).select("id"));
  }
  await deleteSets(plan.remove);
  await Promise.all(plan.update.map((u) => updateSet(u.id, u.patch)));
  if (plan.insert.length) {
    await insertSets(plan.insert.map((s) => ({ ...s, session_id: sessionId, is_completed: true, superset_group: null })));
  }
}

/**
 * Un-tick a program day: its finished workouts stop counting for that day
 * (they're unlinked from it) but stay in your history, charts and records.
 */
export async function unmarkRoutineDone(routineId: string): Promise<void> {
  unwrap(
    await getSupabase()
      .from("workout_sessions")
      .update({ routine_id: null })
      .eq("routine_id", routineId)
      .not("end_time", "is", null)
      .select("id"),
  );
}

/** Delete a finished workout and every set in it. */
export const deleteSession = discardSession;

// ---------- Import a finished workout ----------

/** What the import-workout Edge Function sends back (weights in kg). */
export interface ImportedWorkout {
  title: string;
  date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  notes: string;
  source_unit: "lb" | "kg" | null;
  exercises: {
    name_as_written: string;
    exercise_id: string | null;
    match: "claude" | "name" | "none";
    notes: string;
    sets: { weight_kg: number; reps: number; set_type: WorkoutSet["set_type"]; rpe: number | null }[];
  }[];
}

export interface ImportInput {
  images: { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }[];
  text: string;
  today: string;
}

/** Ask Claude to read a screenshot, photo, or text. Saves nothing. */
export async function readWorkout(input: ImportInput): Promise<ImportedWorkout> {
  const { data, error } = await getSupabase().functions.invoke("import-workout", { body: input });
  if (error) throw await functionError(error);
  return data;
}

export interface WorkoutToSave {
  name: string;
  start: Date;
  minutes: number;
  notes: string;
  exercises: { exercise_id: string; sets: { weight_kg: number; reps: number; set_type: WorkoutSet["set_type"]; rpe: number | null }[] }[];
}

/**
 * Save an already-finished workout: the session with its real date and
 * length, and every set ticked off. Set times are spread across the workout
 * so history, records and recovery see it on the right day.
 */
export async function saveFinishedWorkout(w: WorkoutToSave): Promise<WorkoutSession> {
  const supabase = getSupabase();
  const startMs = w.start.getTime();
  const endMs = startMs + Math.max(1, w.minutes) * 60_000;
  const session: WorkoutSession = unwrap(
    await supabase
      .from("workout_sessions")
      .insert({
        name: w.name.trim() || "Workout",
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString(),
        notes: w.notes.trim() || null,
        source: "import",
      })
      .select()
      .single(),
  );

  const total = w.exercises.reduce((n, x) => n + x.sets.length, 0);
  let k = 0;
  const sets: SetInsert[] = w.exercises.flatMap((x, i) =>
    x.sets.map((s, j) => ({
      session_id: session.id,
      exercise_id: x.exercise_id,
      exercise_order: i + 1,
      set_number: j + 1,
      set_type: s.set_type,
      weight: s.weight_kg,
      reps: s.reps,
      rpe: s.rpe,
      superset_group: null,
      is_completed: true,
      completed_at: new Date(startMs + ((++k) / (total + 1)) * (endMs - startMs)).toISOString(),
    })),
  );
  try {
    if (sets.length) unwrap(await supabase.from("workout_sets").insert(sets).select("id"));
  } catch (e) {
    await supabase.from("workout_sessions").delete().eq("id", session.id);
    throw e;
  }
  return session;
}

// ---------- Export ----------

/** Every completed set from finished workouts, oldest first, for the CSV export. */
export async function listSetsForExport(): Promise<ExportSet[]> {
  type Row = {
    set_number: number; set_type: string; weight: number; reps: number; rpe: number | null;
    duration_seconds: number | null; distance_m: number | null; notes: string | null;
    exercises: { name: string } | null;
    workout_sessions: { name: string | null; start_time: string } | null;
  };
  const page = 1000;
  const out: ExportSet[] = [];
  for (let from = 0; ; from += page) {
    const rows: Row[] = unwrap(
      await getSupabase()
        .from("workout_sets")
        .select("set_number, set_type, weight, reps, rpe, duration_seconds, distance_m, notes, exercises(name), workout_sessions!inner(name, start_time, end_time)")
        .eq("is_completed", true)
        .not("workout_sessions.end_time", "is", null)
        .order("session_id")
        .order("exercise_order")
        .order("set_number")
        .range(from, from + page - 1),
    ) as unknown as Row[];
    for (const r of rows) {
      out.push({
        start_time: r.workout_sessions?.start_time ?? "",
        workout: r.workout_sessions?.name ?? null,
        exercise: r.exercises?.name ?? "Exercise",
        set_number: r.set_number,
        set_type: r.set_type,
        weight: Number(r.weight),
        reps: r.reps,
        rpe: r.rpe,
        duration_seconds: r.duration_seconds,
        distance_m: r.distance_m == null ? null : Number(r.distance_m),
        notes: r.notes,
      });
    }
    if (rows.length < page) break;
  }
  // Pages come in a stable order; put them by date (the sort keeps each workout's own order).
  return out.sort((a, b) => a.start_time.localeCompare(b.start_time));
}
