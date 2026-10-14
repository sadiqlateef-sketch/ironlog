"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { SET_GRID, SetLine } from "@/components/set-line";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editProblem, planSessionEdits, type EditedBlock } from "@/lib/session-edit";
import { kgToLb, toKg, type UnitSystem } from "@/lib/units";
import { saveSessionEdits, type Exercise, type WorkoutSession, type WorkoutSet } from "@/lib/workout-api";
import { setLabel } from "@/lib/workout-logic";

type SetType = WorkoutSet["set_type"];

interface DraftSet {
  key: number;
  id: string | null;
  type: SetType;
  weight: string; // in the lifter's unit, as typed
  /** What the weight box first showed, so an untouched weight is saved exactly as it was. */
  shown: string;
  kg: number;
  reps: string;
}

interface DraftBlock {
  key: number;
  order: number | null;
  exerciseId: string;
  sets: DraftSet[];
}

let nextKey = 1;

function showWeight(kg: number, unit: UnitSystem): string {
  if (!(kg > 0)) return "";
  const v = unit === "imperial" ? kgToLb(kg) : kg;
  return String(Math.round(v * 10) / 10);
}

function toDraft(sets: WorkoutSet[], unit: UnitSystem): DraftBlock[] {
  const orders = [...new Set(sets.map((s) => s.exercise_order))];
  return orders.map((order) => {
    const mine = sets.filter((s) => s.exercise_order === order);
    return {
      key: nextKey++,
      order,
      exerciseId: mine[0].exercise_id,
      sets: mine.map((s) => {
        const shown = showWeight(s.weight, unit);
        return { key: nextKey++, id: s.id, type: s.set_type, weight: shown, shown, kg: s.weight, reps: String(s.reps) };
      }),
    };
  });
}

/** Fix a finished workout: rename it, change exercises, and edit, add or remove sets. */
export function SessionEditor({
  session,
  sets,
  names,
  onCancel,
  onSaved,
}: {
  session: WorkoutSession;
  sets: WorkoutSet[];
  names: Map<string, Exercise>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [name, setName] = useState(session.name ?? "Workout");
  const [blocks, setBlocks] = useState(() => toDraft(sets, unit));
  const [library, setLibrary] = useState(names);
  const [picking, setPicking] = useState<number | "add" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edited: EditedBlock[] = useMemo(
    () =>
      blocks.map((b) => ({
        order: b.order,
        exerciseId: b.exerciseId,
        sets: b.sets.map((s) => ({
          id: s.id,
          set_type: s.type,
          weight: s.id && s.weight === s.shown ? s.kg : Math.max(0, toKg(Number(s.weight) || 0, unit)),
          reps: Math.min(999, Math.round(Number(s.reps) || 0)),
        })),
      })),
    [blocks, unit],
  );
  const problem = editProblem(edited);

  const updateBlock = (key: number, patch: Partial<DraftBlock>) => setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const updateSet = (b: DraftBlock, key: number, patch: Partial<DraftSet>) =>
    updateBlock(b.key, { sets: b.sets.map((s) => (s.key === key ? { ...s, ...patch } : s)) });

  async function save() {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const plan = planSessionEdits(sets, edited, session.end_time ?? session.start_time);
      await saveSessionEdits(session.id, name.trim() !== (session.name ?? "Workout") ? name : null, plan);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="session-editor">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>

      {blocks.map((b) => {
        const ex = library.get(b.exerciseId);
        let working = 0;
        return (
          <section key={b.key} className="glass flex flex-col gap-3 rounded-2xl p-3" aria-label={ex?.name ?? "Exercise"}>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate font-bold">{ex?.name ?? "Exercise"}</h3>
              <Button variant="secondary" size="sm" onClick={() => setPicking(b.key)}>
                Change
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${ex?.name ?? "exercise"}`}
                onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
              >
                <Trash2 />
              </Button>
            </div>
            <div className={SET_GRID}>
              <span className="text-muted-foreground text-center text-xs font-semibold">Set</span>
              <span className="text-muted-foreground text-center text-xs font-semibold">{u}</span>
              <span className="text-muted-foreground text-center text-xs font-semibold">Reps</span>
              <span />
              {b.sets.map((s) => {
                if (s.type === "normal") working++;
                return (
                  <SetLine
                    key={s.key}
                    s={s}
                    label={setLabel(s.type, working)}
                    onChange={(patch) => updateSet(b, s.key, patch)}
                    onRemove={() => updateBlock(b.key, { sets: b.sets.filter((y) => y.key !== s.key) })}
                  />
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const last = b.sets.at(-1);
                updateBlock(b.key, {
                  sets: [...b.sets, { key: nextKey++, id: null, type: "normal", weight: last?.weight ?? "", shown: "", kg: 0, reps: last?.reps ?? "" }],
                });
              }}
            >
              <Plus /> Add set
            </Button>
          </section>
        );
      })}

      <Button variant="secondary" onClick={() => setPicking("add")}>
        <Plus /> Add exercise
      </Button>

      {(problem || error) && (
        <p className={error ? "text-destructive text-sm" : "text-set-warmup text-sm"} role="status">
          {error ?? problem}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!!problem || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Save changes
        </Button>
      </div>

      <ExercisePicker
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        title={picking === "add" ? "Add exercise" : "Change exercise"}
        onPick={(e) => {
          setLibrary((m) => new Map(m).set(e.id, e));
          if (picking === "add") {
            setBlocks((bs) => [
              ...bs,
              { key: nextKey++, order: null, exerciseId: e.id, sets: [{ key: nextKey++, id: null, type: "normal", weight: "", shown: "", kg: 0, reps: "" }] },
            ]);
          } else if (typeof picking === "number") {
            updateBlock(picking, { exerciseId: e.id });
          }
        }}
      />
    </div>
  );
}
