"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { kgToLb, toKg, type UnitSystem } from "@/lib/units";
import {
  deleteSets,
  discardSession,
  finishSession,
  getActiveSession,
  getLastPerformance,
  getRoutineTargets,
  insertSets,
  listExercises,
  listSessionSets,
  moveSetsToExercise,
  startSession,
  updateSessionNotes,
  updateSet,
  type Exercise,
  type LastPerformance,
  type Routine,
  type WorkoutSession,
  type WorkoutSet,
} from "@/lib/workout-api";
import { nextSetType, parseNumber, shouldStartRest } from "@/lib/workout-logic";
import type { SetType } from "@/types/database";

/** One row in the logger. Weight and reps are strings in the user's unit while editing. */
export interface UiSet {
  id: string;
  setNumber: number;
  type: SetType;
  parentSetId: string | null;
  weight: string;
  reps: string;
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

  const setBlocks = useCallback((fn: (prev: Block[]) => Block[]) => {
    setBlocksState((prev) => {
      const next = fn(prev);
      blocksRef.current = next;
      return next;
    });
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
      listSessionSets(active.id),
      listExercises(),
      active.routine_id ? getRoutineTargets(active.routine_id) : Promise.resolve([]),
    ]);
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const grouped = new Map<number, WorkoutSet[]>();
    for (const s of sets) grouped.set(s.exercise_order, [...(grouped.get(s.exercise_order) ?? []), s]);

    const loaded = await Promise.all(
      [...grouped.entries()].map(async ([order, rows]): Promise<Block | null> => {
        const exercise = byId.get(rows[0].exercise_id);
        if (!exercise) return null;
        const target = targets.find((t) => t.position === order && t.exercise_id === exercise.id);
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
      await finishSession(session.id);
      restTimer.stop();
      const summary = {
        sessionId: session.id,
        routineId: session.routine_id,
        durationMin: Math.round((Date.now() - new Date(session.start_time).getTime()) / 60000),
        sets: done.length,
        exercises: blocksRef.current.filter((b) => b.sets.some((s) => s.done)).length,
      };
      setSession(null);
      setBlocks(() => []);
      return summary;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [session, restTimer, fail, setBlocks]);

  const discard = useCallback(async () => {
    if (!session) return;
    try {
      await discardSession(session.id);
      restTimer.stop();
      setSession(null);
      setBlocks(() => []);
    } catch (e) {
      fail(e);
    }
  }, [session, restTimer, fail, setBlocks]);

  // ---- Exercises ----
  const addExercise = useCallback(
    async (exercise: Exercise) => {
      if (!session) return;
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
      } catch (e) {
        fail(e);
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
          moveSetsToExercise(block.sets.map((s) => s.id), exercise.id),
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
    (order: number, id: string, patch: Partial<UiSet>) =>
      setBlocks((prev) =>
        prev.map((b) =>
          b.order !== order ? b : { ...b, sets: b.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) },
        ),
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
        const ui = { ...toUiSet(row, unit), weight: last?.weight ?? "", reps: last?.reps ?? "" };
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
      try {
        await updateSet(id, {
          weight: toKg(parseNumber(set.weight) ?? 0, unit),
          reps: Math.round(parseNumber(set.reps) ?? 0),
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
      const weight = set.weight || (prev ? toDisplay(prev.weight, unit) : "");
      const reps = set.reps || (prev ? String(prev.reps) : block.repTarget?.split("-")[0] ?? "");
      const repsNum = parseNumber(reps);
      if (repsNum == null || repsNum === 0) return false;

      patchSet(order, id, { weight, reps, done: true });
      const others = blocksRef.current.map((b) => ({ order: b.order, supersetGroup: b.supersetGroup }));
      if (set.type !== "warmup" && shouldStartRest(order, block.supersetGroup, others)) {
        restTimer.start(block.restSeconds, block.exercise.name);
      } else if (set.type === "warmup") {
        restTimer.start(Math.min(60, block.restSeconds), block.exercise.name);
      }
      try {
        await updateSet(id, {
          weight: toKg(parseNumber(weight) ?? 0, unit),
          reps: Math.round(repsNum),
          is_completed: true,
        });
      } catch (e) {
        fail(e);
      }
      return true;
    },
    [patchSet, unit, restTimer, fail],
  );

  return {
    startWith,
    session,
    blocks,
    error,
    clearError: () => setError(null),
    start,
    finish,
    discard,
    addExercise,
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
