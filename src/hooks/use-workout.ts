"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { kgToLb, toKg, type UnitSystem } from "@/lib/units";
import {
  getBestE1rms,
  getLastPerformance,
  getRoutineTargets,
  listExercises,
  startSession,
  type Exercise,
  type LastPerformance,
  type Routine,
  type WorkoutSession,
  type WorkoutSet,
} from "@/lib/workout-api";
import {
  deleteSets,
  discardSession,
  finishSession,
  getActiveSession,
  insertSets,
  listActiveSets,
  reorderExercises,
  updateSessionNotes,
  updateSet,
  updateSets,
} from "@/lib/offline/workout-store";
import { getSyncStatus, subscribeSync } from "@/lib/offline/queue";
import { checkAtGym, countsForCalendar, gymOf, markSessionAtGym, syncGymCalendar } from "@/lib/gym";
import { buzz, cancelRecoveryReminder, scheduleRecoveryReminder } from "@/lib/native";
import { nextMorning, recoveryMessage } from "@/lib/recovery-reminder";
import { bestE1rm, matchTargets, nextSetType, parseNumber, shouldStartRest } from "@/lib/workout-logic";
import { formatDuration, parseDuration, toDistanceDisplay, toMetres } from "@/lib/cardio";
import type { SetType } from "@/types/database";

/** A set that just beat your best estimated 1RM for that exercise. */
export interface RecordHit {
  key: number;
  exercise: string;
  weight: string;
  reps: number;
}

/** One row in the logger. Weight and reps are strings in the user's unit while editing. */
export interface UiSet {
  id: string;
  setNumber: number;
  type: SetType;
  parentSetId: string | null;
  weight: string;
  reps: string;
  /** Timed and cardio exercises: "1:30" and distance in mi/km. */
  time: string;
  distance: string;
  done: boolean;
}

/** One exercise card in the logger. */
export interface Block {
  order: number;
  exercise: Exercise;
  supersetGroup: number | null;
  restSeconds: number;
  repTarget: string | null;
  /** From the routine: "RPE 8", "77% 1RM", coaching cue. */
  targetNote: string | null;
  previous: LastPerformance;
  sets: UiSet[];
  /** The routine row this exercise came from (for AI progression), if any. */
  routineExerciseId: string | null;
  /** Target rep range from the routine, for the progression chart. */
  repMin: number | null;
  repMax: number | null;
}

const REST_KEY = "ironlog.rest.";

/** Your own rest time for an exercise, remembered on this device. */
function savedRest(exerciseId: string): number | null {
  try {
    const v = localStorage.getItem(REST_KEY + exerciseId);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

function saveRest(exerciseId: string, seconds: number) {
  try {
    localStorage.setItem(REST_KEY + exerciseId, String(seconds));
  } catch {}
}

function targetNoteFor(t: { target_rpe: number | null; target_percent_1rm: number | null; notes: string | null }): string | null {
  const parts = [
    t.target_percent_1rm != null ? `${Number(t.target_percent_1rm)}% 1RM` : null,
    t.target_rpe != null ? `RPE ${Number(t.target_rpe)}` : null,
    t.notes,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function toDisplay(kg: number, unit: UnitSystem): string {
  if (!kg) return "";
  const v = unit === "imperial" ? kgToLb(kg) : kg;
  return String(Math.round(v * 100) / 100);
}

function toUiSet(s: WorkoutSet, unit: UnitSystem): UiSet {
  return {
    id: s.id,
    setNumber: s.set_number,
    type: s.set_type,
    parentSetId: s.parent_set_id,
    weight: toDisplay(s.weight, unit),
    reps: s.is_completed || s.reps ? String(s.reps) : "",
    time: s.duration_seconds ? formatDuration(s.duration_seconds) : "",
    distance: s.distance_m ? toDistanceDisplay(s.distance_m, unit) : "",
    done: s.is_completed,
  };
}

export function useWorkout() {
  const { profile, unit } = useAuth();
  const restTimer = useRestTimer();
  const [session, setSession] = useState<WorkoutSession | null | undefined>(undefined);
  const [blocks, setBlocksState] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const blocksRef = useRef<Block[]>([]);
  // Best estimated 1RM (kg) per exercise, including sets already done today.
  const bestRef = useRef(new Map<string, number>());
  const recordsRef = useRef(new Set<string>());
  const [record, setRecord] = useState<RecordHit | null>(null);

  // The ref is updated straight away so a change made right after another
  // (add an exercise, then move it) sees the first one.
  const setBlocks = useCallback((fn: (prev: Block[]) => Block[]) => {
    const next = fn(blocksRef.current);
    blocksRef.current = next;
    setBlocksState(next);
  }, []);

  const fail = useCallback((e: unknown) => setError((e as Error).message ?? String(e)), []);

  const defaultRest = useCallback(
    (ex: Exercise) => savedRest(ex.id) ?? (ex.mechanic === "compound" ? (profile?.default_rest_seconds ?? 120) : 90),
    [profile],
  );

  // ---- Load the active workout (if any) ----
  const fetchWorkout = useCallback(async (): Promise<{ session: WorkoutSession | null; blocks: Block[] }> => {
    const active = await getActiveSession();
    if (!active) return { session: null, blocks: [] };
    const [sets, exercises, targets] = await Promise.all([
      listActiveSets(active.id),
      listExercises(),
      active.routine_id ? getRoutineTargets(active.routine_id) : Promise.resolve([]),
    ]);
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const grouped = new Map<number, WorkoutSet[]>();
    for (const s of sets) grouped.set(s.exercise_order, [...(grouped.get(s.exercise_order) ?? []), s]);

    const planned = matchTargets(
      targets,
      [...grouped.entries()].map(([order, rows]) => ({ order, exerciseId: rows[0].exercise_id })),
    );

    const loaded = await Promise.all(
      [...grouped.entries()].map(async ([order, rows]): Promise<Block | null> => {
        const exercise = byId.get(rows[0].exercise_id);
        if (!exercise) return null;
        const t = planned.get(order);
        const target = t == null ? undefined : targets[t];
        return {
          order,
          exercise,
          supersetGroup: rows[0].superset_group,
          restSeconds: savedRest(exercise.id) ?? target?.rest_seconds ?? defaultRest(exercise),
          repTarget: target
            ? target.target_reps_max
              ? `${target.target_reps}-${target.target_reps_max}`
              : String(target.target_reps)
            : null,
          targetNote: target ? targetNoteFor(target) : null,
          previous: await getLastPerformance(exercise.id),
          sets: rows.map((r) => toUiSet(r, unit)),
          routineExerciseId: target?.id ?? null,
          repMin: target?.target_reps ?? null,
          repMax: target?.target_reps_max ?? target?.target_reps ?? null,
        };
      }),
    );
    const best = await getBestE1rms([...new Set(sets.map((s) => s.exercise_id))], active.id);
    for (const s of sets)
      if (s.is_completed && s.set_type !== "warmup") best.set(s.exercise_id, Math.max(best.get(s.exercise_id) ?? 0, bestE1rm([s])));
    bestRef.current = best;
    return {
      session: active,
      blocks: loaded.filter((b): b is Block => b !== null).sort((a, b) => a.order - b.order),
    };
  }, [unit, defaultRest]);

  const load = useCallback(
    () =>
      fetchWorkout().then(
        (r) => {
          setBlocks(() => r.blocks);
          setSession(r.session);
        },
        (e) => {
          fail(e);
          setSession(null);
        },
      ),
    [fetchWorkout, fail, setBlocks],
  );

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  // The server refused a change made offline: show the workout as it really is.
  useEffect(() => {
    let last = getSyncStatus().error;
    return subscribeSync(() => {
      const { error: e } = getSyncStatus();
      if (e && e !== last && profile) {
        fail(new Error(e));
        load();
      }
      last = e;
    });
  }, [profile, load, fail]);

  // A workout in progress means tomorrow's "recovery day" tip from the last one is stale.
  const sessionId = session?.id;
  useEffect(() => {
    if (sessionId) cancelRecoveryReminder();
  }, [sessionId]);

  // ---- Gym check-in ----
  // Once per workout, as soon as it's open on the phone (that also covers a
  // workout started on the watch): are we at the gym? No fix yet = try again at Finish.
  const gymLat = profile?.gym_lat;
  const gymLng = profile?.gym_lng;
  const gymRadius = profile?.gym_radius_m;
  const gymName = profile?.gym_name;
  const checkingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.at_gym !== null || gymLat == null || gymLng == null || checkingRef.current === session.id) return;
    const id = session.id;
    checkingRef.current = id;
    checkAtGym(gymOf({ gym_lat: gymLat, gym_lng: gymLng, gym_radius_m: gymRadius ?? 200, gym_name: gymName ?? null })).then(async (at) => {
      if (at === null) return;
      await markSessionAtGym(id, at).catch(() => {});
      setSession((s) => (s && s.id === id ? { ...s, at_gym: at } : s));
    });
  }, [session, gymLat, gymLng, gymRadius, gymName]);

  // ---- Session lifecycle ----
  const start = useCallback(
    async (routine?: Routine) => {
      try {
        await startSession(routine);
        await load();
      } catch (e) {
        fail(e);
      }
    },
    [load, fail],
  );

  /** Start a workout some other way (a ready-made or Instant workout), then open it. */
  const startWith = useCallback(
    async (create: () => Promise<unknown>) => {
      try {
        await create();
        await load();
      } catch (e) {
        fail(e);
      }
    },
    [load, fail],
  );

  const finish = useCallback(async () => {
    if (!session) return null;
    const done = blocksRef.current.flatMap((b) => b.sets.filter((s) => s.done));
    try {
      const { synced } = await finishSession(session);
      restTimer.stop();
      const trained = blocksRef.current.flatMap((b) =>
        b.exercise.tracking === "distance_time" ? [] : b.sets.filter((s) => s.done && s.type !== "warmup").map(() => b.exercise.primary_muscle),
      );
      if (trained.length) {
        const { title, body } = recoveryMessage(trained);
        scheduleRecoveryReminder(nextMorning(new Date()), title, body);
      }
      const endedAt = Date.now();
      const gym = gymOf(profile);
      // Workouts at the gym longer than 30 minutes go on your Google Calendar.
      if (session.at_gym === null && gym) {
        // Location wasn't known at the start; check now without holding up the summary.
        const { id, start_time } = session;
        checkAtGym(gym).then(async (at) => {
          if (at === null) return;
          await markSessionAtGym(id, at).catch(() => {});
          if (countsForCalendar(at, start_time, endedAt)) syncGymCalendar();
        });
      } else if (countsForCalendar(session.at_gym, session.start_time, endedAt)) {
        syncGymCalendar();
      }
      const summary = {
        atGym: session.at_gym === true ? (gym?.name ?? "the gym") : null,
        sessionId: session.id,
        routineId: session.routine_id,
        durationMin: Math.round((Date.now() - new Date(session.start_time).getTime()) / 60000),
        sets: done.length,
        exercises: blocksRef.current.filter((b) => b.sets.some((s) => s.done)).length,
        records: recordsRef.current.size,
        /** False when it's saved on the phone and still waiting for signal. */
        synced,
        /** A home workout's "Add to calendar?" answer (null for other workouts). */
        addToCalendar: session.add_to_calendar ?? null,
        startedWithCalendar: session.add_to_calendar ?? null,
      };
      recordsRef.current = new Set();
      setSession(null);
      setBlocks(() => []);
      return summary;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [session, profile, restTimer, fail, setBlocks]);

  const discard = useCallback(async () => {
    if (!session) return;
    try {
      await discardSession(session.id);
      recordsRef.current = new Set();
      restTimer.stop();
      setSession(null);
      setBlocks(() => []);
    } catch (e) {
      fail(e);
    }
  }, [session, restTimer, fail, setBlocks]);

  // ---- Exercises ----
  /**
   * Put the exercises in this order (same blocks, new sequence) and save it.
   * Returns old slot -> new slot, for anything holding on to a slot number.
   */
  const reorder = useCallback(
    (next: Block[]): Map<number, number> => {
      const slots = new Map(next.map((b, i) => [b.order, i + 1]));
      const moved = blocksRef.current.filter((b) => slots.has(b.order) && slots.get(b.order) !== b.order);
      if (!moved.length) return slots;
      setBlocks((prev) =>
        prev
          .map((b) => (slots.has(b.order) ? { ...b, order: slots.get(b.order)! } : b))
          .sort((a, b) => a.order - b.order),
      );
      reorderExercises(moved.map((b) => ({ ids: b.sets.map((s) => s.id), order: slots.get(b.order)! }))).catch(fail);
      return slots;
    },
    [fail, setBlocks],
  );

  /** Add an exercise at the end. Returns its slot, or null if it couldn't be added. */
  const addExercise = useCallback(
    async (exercise: Exercise): Promise<number | null> => {
      if (!session) return null;
      try {
        const previous = await getLastPerformance(exercise.id);
        const order = Math.max(0, ...blocksRef.current.map((b) => b.order)) + 1;
        // Same set structure as last time (warm-ups included), or 3 working sets.
        const types: SetType[] = previous.length ? previous.map((p) => p.set_type) : ["normal", "normal", "normal"];
        const rows = await insertSets(
          types.map((t, i) => ({
            session_id: session.id,
            exercise_id: exercise.id,
            exercise_order: order,
            set_number: i + 1,
            set_type: t,
          })),
        );
        setBlocks((prev) => [
          ...prev,
          {
            order,
            exercise,
            supersetGroup: null,
            restSeconds: defaultRest(exercise),
            repTarget: null,
            targetNote: null,
            previous,
            sets: rows.sort((a, b) => a.set_number - b.set_number).map((r) => toUiSet(r, unit)),
            routineExerciseId: null,
            repMin: null,
            repMax: null,
          },
        ]);
        return order;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [session, unit, defaultRest, fail, setBlocks],
  );

  const removeExercise = useCallback(
    async (order: number) => {
      const block = blocksRef.current.find((b) => b.order === order);
      if (!block) return;
      setBlocks((prev) => prev.filter((b) => b.order !== order));
      try {
        await deleteSets(block.sets.map((s) => s.id));
      } catch (e) {
        fail(e);
      }
    },
    [fail, setBlocks],
  );

  /** Link this exercise with the next one as a superset, or unlink it. */
  const toggleSuperset = useCallback(
    async (order: number) => {
      const list = blocksRef.current;
      const i = list.findIndex((b) => b.order === order);
      const block = list[i];
      if (!block) return;

      const changes = new Map<number, number | null>();
      if (block.supersetGroup != null) {
        changes.set(order, null);
        const rest = list.filter((b) => b.supersetGroup === block.supersetGroup && b.order !== order);
        if (rest.length === 1) changes.set(rest[0].order, null); // a superset of one isn't a superset
      } else {
        const next = list[i + 1];
        if (!next) return;
        const group = next.supersetGroup ?? Math.max(0, ...list.map((b) => b.supersetGroup ?? 0)) + 1;
        changes.set(order, group);
        changes.set(next.order, group);
      }

      setBlocks((prev) => prev.map((b) => (changes.has(b.order) ? { ...b, supersetGroup: changes.get(b.order)! } : b)));
      try {
        await Promise.all(
          list
            .filter((b) => changes.has(b.order))
            .flatMap((b) => b.sets.map((s) => updateSet(s.id, { superset_group: changes.get(b.order)! }))),
        );
      } catch (e) {
        fail(e);
      }
    },
    [fail, setBlocks],
  );

  /** Swap in another exercise, keeping the sets (and anything already logged). */
  const swapExercise = useCallback(
    async (order: number, exercise: Exercise) => {
      const block = blocksRef.current.find((b) => b.order === order);
      if (!block || block.exercise.id === exercise.id) return;
      try {
        const [previous] = await Promise.all([
          getLastPerformance(exercise.id),
          updateSets(block.sets.map((s) => s.id), { exercise_id: exercise.id }),
        ]);
        setBlocks((prev) =>
          prev.map((b) =>
            b.order === order
              ? { ...b, exercise, previous, restSeconds: defaultRest(exercise), routineExerciseId: null, repMin: null, repMax: null }
              : b,
          ),
        );
      } catch (e) {
        fail(e);
      }
    },
    [defaultRest, fail, setBlocks],
  );

  /** Change this exercise's rest time; remembered for next time too. */
  const setRest = useCallback(
    (order: number, seconds: number) => {
      const block = blocksRef.current.find((b) => b.order === order);
      if (!block) return;
      saveRest(block.exercise.id, seconds);
      setBlocks((prev) => prev.map((b) => (b.order === order ? { ...b, restSeconds: seconds } : b)));
    },
    [setBlocks],
  );

  const saveNotes = useCallback(
    async (notes: string) => {
      if (!session) return;
      setSession({ ...session, notes: notes.trim() || null });
      try {
        await updateSessionNotes(session.id, notes);
      } catch (e) {
        fail(e);
      }
    },
    [session, fail],
  );

  /** After accepting a new weight: put it on the sets you haven't done yet. */
  const applyWeightToRemaining = useCallback(
    async (order: number, weightKg: number) => {
      const block = blocksRef.current.find((b) => b.order === order);
      if (!block) return;
      const todo = block.sets.filter((s) => !s.done && s.type !== "warmup");
      const shown = toDisplay(weightKg, unit);
      setBlocks((prev) =>
        prev.map((b) =>
          b.order === order ? { ...b, sets: b.sets.map((s) => (todo.some((t) => t.id === s.id) ? { ...s, weight: shown } : s)) } : b,
        ),
      );
      try {
        await Promise.all(todo.map((s) => updateSet(s.id, { weight: weightKg })));
      } catch (e) {
        fail(e);
      }
    },
    [unit, fail, setBlocks],
  );

  // ---- Sets ----
  const patchSet = useCallback(
    // Found by set id, not slot: a set finishing saving after its exercise was moved still lands.
    (_order: number, id: string, patch: Partial<UiSet>) =>
      setBlocks((prev) =>
        prev.map((b) => (b.sets.some((s) => s.id === id) ? { ...b, sets: b.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : b)),
      ),
    [setBlocks],
  );

  const addSet = useCallback(
    async (order: number) => {
      const block = blocksRef.current.find((b) => b.order === order);
      if (!session || !block) return;
      const last = block.sets.at(-1);
      try {
        const [row] = await insertSets([
          {
            session_id: session.id,
            exercise_id: block.exercise.id,
            exercise_order: order,
            set_number: Math.max(0, ...block.sets.map((s) => s.setNumber)) + 1,
            set_type: "normal",
            superset_group: block.supersetGroup,
            weight: last ? toKg(parseNumber(last.weight) ?? 0, unit) : 0,
          },
        ]);
        // Copy the last set's numbers so a repeat set is one tap.
        const ui = { ...toUiSet(row, unit), weight: last?.weight ?? "", reps: last?.reps ?? "", time: last?.time ?? "", distance: last?.distance ?? "" };
        setBlocks((prev) => prev.map((b) => (b.order === order ? { ...b, sets: [...b.sets, ui] } : b)));
      } catch (e) {
        fail(e);
      }
    },
    [session, unit, fail, setBlocks],
  );

  const removeSet = useCallback(
    async (order: number, id: string) => {
      setBlocks((prev) => prev.map((b) => (b.order === order ? { ...b, sets: b.sets.filter((s) => s.id !== id) } : b)));
      try {
        await deleteSets([id]);
      } catch (e) {
        fail(e);
      }
    },
    [fail, setBlocks],
  );

  /** Save weight/reps after the user leaves the field. */
  const commitSet = useCallback(
    async (order: number, id: string) => {
      const set = blocksRef.current.find((b) => b.order === order)?.sets.find((s) => s.id === id);
      if (!set) return;
      const tracking = blocksRef.current.find((b) => b.order === order)?.exercise.tracking ?? "weight_reps";
      try {
        await updateSet(id, {
          weight: tracking === "distance_time" ? 0 : toKg(parseNumber(set.weight) ?? 0, unit),
          reps: Math.round(parseNumber(set.reps) ?? 0),
          ...(tracking !== "weight_reps" && {
            duration_seconds: parseDuration(set.time),
            distance_m: tracking === "distance_time" ? toMetres(parseNumber(set.distance) ?? 0, unit) || null : null,
          }),
        });
      } catch (e) {
        fail(e);
      }
    },
    [unit, fail],
  );

  const cycleType = useCallback(
    async (order: number, id: string) => {
      const block = blocksRef.current.find((b) => b.order === order);
      const idx = block?.sets.findIndex((s) => s.id === id) ?? -1;
      if (!block || idx < 0) return;
      const type = nextSetType(block.sets[idx].type);
      // A drop set hangs off the set right before it.
      const parentSetId = type === "drop" && idx > 0 ? block.sets[idx - 1].id : null;
      patchSet(order, id, { type, parentSetId });
      try {
        await updateSet(id, { set_type: type, parent_set_id: parentSetId });
      } catch (e) {
        fail(e);
      }
    },
    [patchSet, fail],
  );

  /** Celebrates a set that beats every earlier workout's best for that lift. */
  const checkRecord = useCallback(
    async (exercise: Exercise, kg: number, reps: number, shown: string, sessionId: string) => {
      const e = bestE1rm([{ weight: kg, reps }]);
      if (!e) return;
      let best = bestRef.current.get(exercise.id);
      if (best === undefined) {
        best = (await getBestE1rms([exercise.id], sessionId).catch(() => new Map<string, number>())).get(exercise.id) ?? 0;
      }
      bestRef.current.set(exercise.id, Math.max(best, e));
      // Your first time doing a lift sets the bar rather than breaking it.
      if (best > 0 && e > best + 1e-6) {
        recordsRef.current.add(exercise.id);
        setRecord({ key: Date.now(), exercise: exercise.name, weight: shown, reps });
        buzz();
      }
    },
    [],
  );

  /**
   * The one-tap action. Empty fields fall back to last time's numbers (shown as
   * grey placeholders), then the rest timer starts on its own.
   * Returns false if there's no rep count to log.
   */
  const toggleDone = useCallback(
    async (order: number, id: string): Promise<boolean> => {
      const block = blocksRef.current.find((b) => b.order === order);
      const idx = block?.sets.findIndex((s) => s.id === id) ?? -1;
      if (!block || idx < 0) return false;
      const set = block.sets[idx];

      if (set.done) {
        patchSet(order, id, { done: false });
        try {
          await updateSet(id, { is_completed: false });
        } catch (e) {
          fail(e);
        }
        return true;
      }

      const prev = block.previous[idx];
      const others = blocksRef.current.map((b) => ({ order: b.order, supersetGroup: b.supersetGroup }));
      const startRest = () => {
        if (set.type !== "warmup" && shouldStartRest(order, block.supersetGroup, others)) {
          restTimer.start(block.restSeconds, block.exercise.name);
        } else if (set.type === "warmup") {
          restTimer.start(Math.min(60, block.restSeconds), block.exercise.name);
        }
      };

      // Timed and cardio sets: empty fields fall back to last time, then the target.
      const tracking = block.exercise.tracking;
      if (tracking !== "weight_reps") {
        const time =
          set.time ||
          (prev?.duration_seconds ? formatDuration(prev.duration_seconds) : tracking === "time" ? (block.repTarget?.split("-")[0] ?? "") : "");
        const distance = tracking === "distance_time" ? set.distance || (prev?.distance_m ? toDistanceDisplay(prev.distance_m, unit) : "") : "";
        const seconds = parseDuration(time);
        const metres = toMetres(parseNumber(distance) ?? 0, unit);
        if (!seconds && !metres) return false;
        const weight = tracking === "time" ? set.weight || (prev?.weight ? toDisplay(prev.weight, unit) : "") : "";
        patchSet(order, id, { weight, time: seconds ? formatDuration(seconds) : "", distance, done: true });
        startRest();
        try {
          await updateSet(id, {
            weight: toKg(parseNumber(weight) ?? 0, unit),
            reps: 0,
            duration_seconds: seconds,
            distance_m: metres || null,
            is_completed: true,
          });
        } catch (e) {
          fail(e);
        }
        return true;
      }

      const weight = set.weight || (prev ? toDisplay(prev.weight, unit) : "");
      const reps = set.reps || (prev ? String(prev.reps) : block.repTarget?.split("-")[0] ?? "");
      const repsNum = parseNumber(reps);
      if (repsNum == null || repsNum === 0) return false;

      patchSet(order, id, { weight, reps, done: true });
      startRest();
      const kg = toKg(parseNumber(weight) ?? 0, unit);
      if (set.type !== "warmup" && session) checkRecord(block.exercise, kg, Math.round(repsNum), weight, session.id);
      try {
        await updateSet(id, {
          weight: kg,
          reps: Math.round(repsNum),
          is_completed: true,
        });
      } catch (e) {
        fail(e);
      }
      return true;
    },
    [patchSet, unit, restTimer, fail, session, checkRecord],
  );

  return {
    startWith,
    session,
    blocks,
    error,
    clearError: () => setError(null),
    record,
    clearRecord: () => setRecord(null),
    start,
    finish,
    discard,
    addExercise,
    reorder,
    /** The exercises as they are right now (after any change still settling into state). */
    blocksNow: () => blocksRef.current,
    removeExercise,
    swapExercise,
    setRest,
    saveNotes,
    applyWeightToRemaining,
    toggleSuperset,
    addSet,
    removeSet,
    patchSet,
    commitSet,
    cycleType,
    toggleDone,
  };
}
