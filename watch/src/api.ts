// Everything the watch reads from or writes to the database.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { groupSets, type ExerciseGroup, type ExerciseInfo, type UnitSystem, type WatchSet } from "./logic";
import { classify, OpQueue, uuid, type NewSetRow, type Op, type Outcome } from "./queue";

export interface Profile {
  unit: UnitSystem;
  defaultRest: number;
  age: number | null;
}

export interface ActiveWorkout {
  id: string;
  name: string | null;
  startTime: string;
  groups: ExerciseGroup[];
  /** From the routine, by exercise order: rest seconds and rep target. */
  targets: Record<number, { rest: number | null; reps: number | null }>;
}

export interface RoutineSummary {
  id: string;
  name: string;
  exercises: number;
}

export async function loadProfile(): Promise<Profile> {
  const { data } = await supabase.from("users").select("unit_system, default_rest_seconds, physical_stats").single();
  const birthYear = Number((data?.physical_stats as { birth_year?: number } | null)?.birth_year);
  return {
    unit: (data?.unit_system as UnitSystem) ?? "imperial",
    defaultRest: data?.default_rest_seconds ?? 120,
    age: birthYear > 1900 ? new Date().getFullYear() - birthYear : null,
  };
}

/** The workout in progress (started on the phone or the watch), or null. */
export async function loadActive(): Promise<ActiveWorkout | null> {
  const { data: session, error } = await supabase
    .from("workout_sessions")
    .select("id, name, start_time, routine_id")
    .is("end_time", null)
    .maybeSingle();
  if (error) throw error;
  if (!session) return null;

  const { data: sets, error: setErr } = await supabase
    .from("workout_sets")
    .select("id, exercise_id, exercise_order, set_number, set_type, weight, reps, is_completed, client_id, superset_group, exercises(name, mechanic)")
    .eq("session_id", session.id);
  if (setErr) throw setErr;

  const info: Record<string, ExerciseInfo> = {};
  for (const s of sets ?? []) {
    const ex = s.exercises as unknown as { name: string; mechanic: ExerciseInfo["mechanic"] } | null;
    if (ex) info[s.exercise_id] = { name: ex.name, mechanic: ex.mechanic };
  }

  const targets: ActiveWorkout["targets"] = {};
  if (session.routine_id) {
    const { data: items } = await supabase
      .from("routine_exercises")
      .select("position, rest_seconds, target_reps")
      .eq("routine_id", session.routine_id)
      .order("position");
    (items ?? []).forEach((it, i) => (targets[i + 1] = { rest: it.rest_seconds, reps: it.target_reps }));
  }

  return {
    id: session.id,
    name: session.name,
    startTime: session.start_time,
    groups: groupSets((sets ?? []) as unknown as WatchSet[], info),
    targets,
  };
}

export async function listRoutines(): Promise<RoutineSummary[]> {
  const { data, error } = await supabase
    .from("routines")
    .select("id, name, routine_exercises(count)")
    .eq("archived", false)
    .order("position");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    exercises: (r.routine_exercises as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

/** Start a routine from the watch (needs a connection, like the phone app). */
export async function startRoutine(routineId: string): Promise<void> {
  const { data: routine, error } = await supabase.from("routines").select("id, name").eq("id", routineId).single();
  if (error) throw error;
  const { data: session, error: sErr } = await supabase
    .from("workout_sessions")
    .insert({ name: routine.name, routine_id: routine.id, source: "watch" })
    .select("id")
    .single();
  if (sErr) throw new Error(sErr.message.includes("one_active") ? "Finish your current workout first." : sErr.message);

  const { data: items } = await supabase
    .from("routine_exercises")
    .select("exercise_id, superset_group, target_sets, target_weight_kg, warmup_sets")
    .eq("routine_id", routineId)
    .order("position");
  const rows: NewSetRow[] = [];
  (items ?? []).forEach((item, i) => {
    let n = 1;
    const base = { session_id: session.id, exercise_id: item.exercise_id, exercise_order: i + 1, superset_group: item.superset_group };
    for (let w = 0; w < item.warmup_sets; w++) {
      const id = uuid();
      rows.push({ ...base, id, client_id: id, set_number: n++, set_type: "warmup", weight: 0, reps: 0 });
    }
    for (let s = 0; s < item.target_sets; s++) {
      const id = uuid();
      rows.push({ ...base, id, client_id: id, set_number: n++, set_type: "normal", weight: item.target_weight_kg ?? 0, reps: 0 });
    }
  });
  if (rows.length) {
    const { error: setErr } = await supabase.from("workout_sets").insert(rows);
    if (setErr) throw setErr;
  }
}

/** Sends one queued change. Each kind is written so that sending it twice is harmless. */
async function send(op: Op): Promise<Outcome> {
  switch (op.kind) {
    case "addSet": {
      const { error, status } = await supabase.from("workout_sets").upsert(op.row, { onConflict: "id", ignoreDuplicates: true });
      return classify(error ? { ...error, status } : null);
    }
    case "complete": {
      const { error, status } = await supabase
        .from("workout_sets")
        .update({ weight: op.weight, reps: op.reps, is_completed: true, completed_at: op.at })
        .eq("id", op.setId);
      return classify(error ? { ...error, status } : null);
    }
    case "uncomplete": {
      const { error, status } = await supabase
        .from("workout_sets")
        .update({ is_completed: false, completed_at: null })
        .eq("id", op.setId);
      return classify(error ? { ...error, status } : null);
    }
    case "hr": {
      const { error, status } = await supabase
        .from("heart_rate_samples")
        .upsert(op.rows, { onConflict: "session_id,recorded_at", ignoreDuplicates: true });
      return classify(error ? { ...error, status } : null);
    }
    case "finish": {
      const { error, status } = await supabase
        .from("workout_sessions")
        .update({ end_time: op.at })
        .eq("id", op.sessionId)
        .is("end_time", null);
      return classify(error ? { ...error, status } : null);
    }
  }
}

export const queue = new OpQueue(AsyncStorage, send);

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
