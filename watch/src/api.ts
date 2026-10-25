// Everything the watch reads from or writes to the database.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { groupSets, planWorkout, type ExerciseGroup, type ExerciseInfo, type PlanRoutine, type UnitSystem, type WatchSet } from "./logic";
import { classify, OpQueue, uuid, type Op, type Outcome } from "./queue";

export interface Profile {
  unit: UnitSystem;
  defaultRest: number;
  age: number | null;
}

export interface ActiveWorkout {
  id: string;
  name: string | null;
  routineId?: string | null;
  startTime: string;
  groups: ExerciseGroup[];
  /** From the routine, by exercise order: rest seconds and rep target. */
  targets: Record<number, { rest: number | null; reps: number | null }>;
  /** Your own rest time per exercise id, set on the phone. Missing on a workout started offline. */
  myRest?: Record<string, number>;
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
  if (!session || session.id === (await AsyncStorage.getItem(FINISHED_KEY))) return null;

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

  // Rest times you picked on the phone. Older databases don't have the column: skip it.
  const myRest: Record<string, number> = {};
  const ids = Object.keys(info);
  if (ids.length) {
    const { data: prefs } = await supabase.from("exercise_prefs").select("exercise_id, rest_seconds").in("exercise_id", ids);
    for (const p of (prefs ?? []) as { exercise_id: string; rest_seconds: number | null }[])
      if (p.rest_seconds != null) myRest[p.exercise_id] = p.rest_seconds;
  }

  return {
    id: session.id,
    name: session.name,
    routineId: session.routine_id,
    startTime: session.start_time,
    groups: groupSets((sets ?? []) as unknown as WatchSet[], info),
    targets,
    myRest,
  };
}

export async function listRoutines(): Promise<RoutineSummary[]> {
  const { data, error } = await supabase
    .from("routines")
    .select("id, name, routine_exercises(count)")
    .eq("archived", false)
    .is("program_id", null) // program workouts come one at a time via loadUpNext
    .order("position");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    exercises: (r.routine_exercises as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export interface UpNext {
  routineId: string;
  week: number;
  day: number;
  weeks: number;
  /** The day's name without the "Week N · " prefix. */
  name: string;
  /** The routine's own name, which the workout is saved under. */
  fullName: string;
  program: string;
}

/** The active program's next workout, or null when there's no program running (or it's finished). */
export async function loadUpNext(): Promise<UpNext | null> {
  const { data, error } = await supabase.rpc("program_progress");
  if (error) throw error;
  const p = data?.[0];
  if (!p?.next_routine_id) return null;
  return {
    routineId: p.next_routine_id,
    week: p.next_week,
    day: p.next_day,
    weeks: p.weeks,
    fullName: String(p.next_routine_name ?? ""),
    name: String(p.next_routine_name ?? "").replace(/^Week \d+ · /, "").replace(/^Day \d+\s*[-–:·]\s*/, ""),
    program: p.program_name,
  };
}

// ---------- Working with no signal ----------
// The watch keeps a copy of your plan (Up next and your routines) and of the
// workout in progress, so it can start and log a workout in a basement gym.
// Changes go into the queue and reach the server once there's signal.

export const PLAN_KEY = "ironlog.plan";
export const ACTIVE_KEY = "ironlog.active";
/** The last workout finished on the watch, until the server has heard about it. */
export const FINISHED_KEY = "ironlog.finished";

export interface WatchPlan {
  upNext: (UpNext & { routine: PlanRoutine }) | null;
  routines: (RoutineSummary & { routine: PlanRoutine })[];
}

export const DEFAULT_OFFLINE_PLAN: WatchPlan = {
  upNext: {
    routineId: "r-full-body-a",
    week: 1,
    day: 1,
    weeks: 8,
    name: "Full Body A",
    fullName: "Full Body A (Squat & Bench)",
    program: "IronLog Strength",
    routine: {
      id: "r-full-body-a",
      name: "Full Body A (Squat & Bench)",
      items: [
        {
          exerciseId: "e1000000-0000-0000-0000-000000000001",
          name: "Back Squat",
          mechanic: "compound",
          supersetGroup: null,
          sets: 3,
          warmups: 2,
          weightKg: 100,
          rest: 120,
          reps: 5,
        },
        {
          exerciseId: "e1000000-0000-0000-0000-000000000002",
          name: "Bench Press",
          mechanic: "compound",
          supersetGroup: null,
          sets: 3,
          warmups: 2,
          weightKg: 80,
          rest: 120,
          reps: 5,
        },
        {
          exerciseId: "e1000000-0000-0000-0000-000000000003",
          name: "Barbell Row",
          mechanic: "compound",
          supersetGroup: null,
          sets: 3,
          warmups: 1,
          weightKg: 70,
          rest: 90,
          reps: 8,
        },
        {
          exerciseId: "e1000000-0000-0000-0000-000000000004",
          name: "Overhead Press",
          mechanic: "compound",
          supersetGroup: null,
          sets: 3,
          warmups: 1,
          weightKg: 50,
          rest: 90,
          reps: 8,
        },
      ],
    },
  },
  routines: [
    {
      id: "r-full-body-a",
      name: "Full Body A (Squat & Bench)",
      exercises: 4,
      routine: {
        id: "r-full-body-a",
        name: "Full Body A (Squat & Bench)",
        items: [
          {
            exerciseId: "e1000000-0000-0000-0000-000000000001",
            name: "Back Squat",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 2,
            weightKg: 100,
            rest: 120,
            reps: 5,
          },
          {
            exerciseId: "e1000000-0000-0000-0000-000000000002",
            name: "Bench Press",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 2,
            weightKg: 80,
            rest: 120,
            reps: 5,
          },
          {
            exerciseId: "e1000000-0000-0000-0000-000000000003",
            name: "Barbell Row",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 1,
            weightKg: 70,
            rest: 90,
            reps: 8,
          },
          {
            exerciseId: "e1000000-0000-0000-0000-000000000004",
            name: "Overhead Press",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 1,
            weightKg: 50,
            rest: 90,
            reps: 8,
          },
        ],
      },
    },
    {
      id: "r-full-body-b",
      name: "Full Body B (Deadlift & Press)",
      exercises: 4,
      routine: {
        id: "r-full-body-b",
        name: "Full Body B (Deadlift & Press)",
        items: [
          {
            exerciseId: "e1000000-0000-0000-0000-000000000005",
            name: "Deadlift",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 2,
            weightKg: 120,
            rest: 180,
            reps: 5,
          },
          {
            exerciseId: "e1000000-0000-0000-0000-000000000004",
            name: "Overhead Press",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 2,
            weightKg: 50,
            rest: 120,
            reps: 5,
          },
          {
            exerciseId: "e1000000-0000-0000-0000-000000000006",
            name: "Pull Up",
            mechanic: "compound",
            supersetGroup: null,
            sets: 3,
            warmups: 0,
            weightKg: 0,
            rest: 90,
            reps: 8,
          },
          {
            exerciseId: "e1000000-0000-0000-0000-000000000007",
            name: "Hanging Leg Raise",
            mechanic: "isolation",
            supersetGroup: null,
            sets: 3,
            warmups: 0,
            weightKg: 0,
            rest: 60,
            reps: 12,
          },
        ],
      },
    },
  ],
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key)) ?? "null") as T | null;
  } catch {
    return null;
  }
}

/** The plan as last saved on the watch (seeds default plan if none exists). */
export async function savedPlan(): Promise<WatchPlan | null> {
  const existing = await readJson<WatchPlan>(PLAN_KEY);
  if (existing) return existing;
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(DEFAULT_OFFLINE_PLAN));
  return DEFAULT_OFFLINE_PLAN;
}

/** Fetch Up next and your routines with everything needed to start them, and save a copy. Throws when offline. */
export async function refreshPlan(): Promise<WatchPlan> {
  const [upNext, routines] = await Promise.all([loadUpNext(), listRoutines()]);
  const ids = [...new Set([...(upNext ? [upNext.routineId] : []), ...routines.map((r) => r.id)])];
  const byRoutine = new Map<string, PlanRoutine["items"]>();
  if (ids.length) {
    const { data, error } = await supabase
      .from("routine_exercises")
      .select("routine_id, position, exercise_id, superset_group, target_sets, warmup_sets, target_weight_kg, rest_seconds, target_reps, exercises(name, mechanic)")
      .in("routine_id", ids)
      .order("position");
    if (error) throw error;
    for (const it of data ?? []) {
      const ex = it.exercises as unknown as { name: string; mechanic: ExerciseInfo["mechanic"] } | null;
      const list = byRoutine.get(it.routine_id) ?? [];
      list.push({
        exerciseId: it.exercise_id,
        name: ex?.name ?? "Exercise",
        mechanic: ex?.mechanic ?? null,
        supersetGroup: it.superset_group,
        sets: it.target_sets,
        warmups: it.warmup_sets ?? 0,
        weightKg: it.target_weight_kg,
        rest: it.rest_seconds,
        reps: it.target_reps,
      });
      byRoutine.set(it.routine_id, list);
    }
  }
  const plan: WatchPlan = {
    upNext: upNext ? { ...upNext, routine: { id: upNext.routineId, name: upNext.fullName || upNext.name, items: byRoutine.get(upNext.routineId) ?? [] } } : null,
    routines: routines.map((r) => ({ ...r, routine: { id: r.id, name: r.name, items: byRoutine.get(r.id) ?? [] } })),
  };
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  return plan;
}

/** The workout in progress as the watch last saw it. */
export function savedActive(): Promise<ActiveWorkout | null> {
  return readJson<ActiveWorkout>(ACTIVE_KEY);
}

export async function saveActive(w: ActiveWorkout | null): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(w));
}

/**
 * The workout in progress. Changes made on the watch that haven't reached the
 * server yet win, so the watch's own copy is used until the queue is empty;
 * with no signal it's the saved copy too.
 */
export async function currentWorkout(): Promise<{ workout: ActiveWorkout | null; offline: boolean }> {
  const pending = await queue.flush();
  const local = await savedActive();
  if (pending > 0 && local) return { workout: local, offline: true };
  try {
    const fresh = await loadActive();
    await saveActive(fresh);
    if (pending === 0) await AsyncStorage.removeItem(FINISHED_KEY);
    return { workout: fresh, offline: false };
  } catch {
    return { workout: local, offline: true };
  }
}

/** Is a workout already running on the server (started on the phone)? Null = couldn't tell (no signal). */
async function serverHasActive(): Promise<boolean | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
  const check = loadActive().then((w) => w !== null, () => null);
  return Promise.race([check, timeout]);
}

/**
 * Start a routine from the watch, no phone needed. Works with no signal: the
 * workout is built from the saved plan and sent to the server later.
 */
export async function startRoutine(routine: PlanRoutine): Promise<ActiveWorkout> {
  if ((await serverHasActive()) === true) throw new Error("Finish your current workout first.");
  const id = uuid();
  const startTime = new Date().toISOString();
  const { rows, groups, targets } = planWorkout(routine, id, uuid);
  const workout: ActiveWorkout = { id, name: routine.name, routineId: routine.id, startTime, groups, targets };
  await saveActive(workout);
  await queue.add({ kind: "start", session: { id, name: routine.name, routine_id: routine.id, start_time: startTime }, rows });
  return workout;
}

/** Finish on the watch: queue it, forget the saved copy, and don't offer the same Up next day again. */
export async function finishWorkout(w: ActiveWorkout): Promise<void> {
  await AsyncStorage.setItem(FINISHED_KEY, w.id);
  await saveActive(null);
  const plan = await savedPlan();
  if (plan?.upNext && plan.upNext.routineId === w.routineId) await AsyncStorage.setItem(PLAN_KEY, JSON.stringify({ ...plan, upNext: null }));
  await queue.add({ kind: "finish", sessionId: w.id, at: new Date().toISOString() });
}

/** Sends one queued change. Each kind is written so that sending it twice is harmless. */
async function send(op: Op): Promise<Outcome> {
  switch (op.kind) {
    case "start": {
      const { error, status } = await supabase
        .from("workout_sessions")
        .upsert({ ...op.session, source: "watch" }, { onConflict: "id", ignoreDuplicates: true });
      if (error) return classify({ ...error, status });
      if (!op.rows.length) return "ok";
      const sets = await supabase.from("workout_sets").upsert(op.rows, { onConflict: "id", ignoreDuplicates: true });
      return classify(sets.error ? { ...sets.error, status: sets.status } : null);
    }
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
  await AsyncStorage.removeItem("ironlog.offline_mode");
  try {
    await supabase.auth.signOut();
  } catch {
    // offline
  }
}
