// Fixing a finished workout: turn the edited form into the smallest set of
// database changes. Pure, so it's easy to test.

import type { SetType } from "../types/database";

export interface SavedSet {
  id: string;
  exercise_id: string;
  exercise_order: number;
  set_number: number;
  set_type: SetType;
  weight: number; // kg
  reps: number;
  completed_at: string | null;
}

export interface EditedBlock {
  /** The exercise slot it came from, or null for a newly added exercise. */
  order: number | null;
  exerciseId: string;
  sets: { id: string | null; set_type: SetType; weight: number; reps: number }[];
}

export interface SetPatch {
  exercise_id?: string;
  set_type?: SetType;
  weight?: number;
  reps?: number;
}

export interface EditPlan {
  remove: string[];
  update: { id: string; patch: SetPatch }[];
  insert: {
    exercise_id: string;
    exercise_order: number;
    set_number: number;
    set_type: SetType;
    weight: number;
    reps: number;
    completed_at: string;
  }[];
}

/** Why the edited workout can't be saved yet, or null when it can. */
export function editProblem(blocks: EditedBlock[]): string | null {
  const sets = blocks.flatMap((b) => b.sets);
  if (!sets.length) return "There are no sets left. To remove the whole workout, use Delete workout instead.";
  if (sets.some((s) => !(s.reps >= 1))) return "Every set needs at least 1 rep. Remove empty sets with the ✕.";
  return null;
}

/**
 * Compare the saved sets with the edited form. Existing sets keep their slot
 * and number (so nothing collides), new sets go after them, and new sets are
 * timed next to the set before them so they land on the same day.
 */
export function planSessionEdits(before: SavedSet[], blocks: EditedBlock[], sessionEnd: string): EditPlan {
  const byId = new Map(before.map((s) => [s.id, s]));
  const kept = new Set(blocks.flatMap((b) => b.sets.map((s) => s.id)).filter((id): id is string => !!id));
  const plan: EditPlan = { remove: before.filter((s) => !kept.has(s.id)).map((s) => s.id), update: [], insert: [] };

  let lastOrder = Math.max(0, ...before.map((s) => s.exercise_order));
  const latest = before.map((s) => s.completed_at).filter((t): t is string => !!t).sort().at(-1) ?? sessionEnd;

  for (const b of blocks) {
    if (!b.sets.length) continue;
    const order = b.order ?? ++lastOrder;
    let number = Math.max(0, ...before.filter((s) => s.exercise_order === order).map((s) => s.set_number));
    let prevTime: string | null = null;
    for (const s of b.sets) {
      const old = s.id ? byId.get(s.id) : undefined;
      if (old) {
        const patch: SetPatch = {};
        if (old.exercise_id !== b.exerciseId) patch.exercise_id = b.exerciseId;
        if (old.set_type !== s.set_type) patch.set_type = s.set_type;
        if (Math.abs(old.weight - s.weight) > 0.0005) patch.weight = s.weight;
        if (old.reps !== s.reps) patch.reps = s.reps;
        if (Object.keys(patch).length) plan.update.push({ id: old.id, patch });
        prevTime = old.completed_at ?? prevTime;
      } else {
        const completed_at: string = prevTime ?? latest;
        plan.insert.push({ exercise_id: b.exerciseId, exercise_order: order, set_number: ++number, set_type: s.set_type, weight: s.weight, reps: s.reps, completed_at });
        prevTime = completed_at;
      }
    }
  }
  return plan;
}
