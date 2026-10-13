"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { kgToLb, toKg, type UnitSystem } from "@/lib/units";
import { saveWorkoutEdits, type EditableItem, type RoutineWithExercises } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const toItems = (r: RoutineWithExercises): EditableItem[] =>
  r.routine_exercises.map((x) => ({
    id: x.id,
    exercise_id: x.exercise_id,
    name: x.exercises?.name ?? "Exercise",
    target_sets: x.target_sets,
    target_reps: x.target_reps,
    target_reps_max: x.target_reps_max,
    target_weight_kg: x.target_weight_kg,
  }));

const shown = (kg: number | null, unit: UnitSystem) =>
  kg == null ? "" : String(Math.round((unit === "imperial" ? kgToLb(kg) : kg) * 2) / 2);

/**
 * Change one workout: swap, remove or add exercises and set sets, reps and
 * weight. In a program you choose whether later weeks change too.
 */
export function WorkoutEditor(props: {
  routine: RoutineWithExercises | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  // A fresh editor for each workout opened.
  return props.routine ? <Editor key={props.routine.id} {...props} routine={props.routine} /> : null;
}

function Editor({
  routine,
  onOpenChange,
  onSaved,
}: {
  routine: RoutineWithExercises;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { unit } = useAuth();
  const [items, setItems] = useState<EditableItem[]>(() => toItems(routine));
  const [laterWeeks, setLaterWeeks] = useState(true);
  const [picker, setPicker] = useState<{ swap: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inProgram = !!routine.program_id;
  const set = (i: number, patch: Partial<EditableItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveWorkoutEdits(routine, items, inProgram && laterWeeks);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={!picker} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit workout</DialogTitle>
            <DialogDescription>{routine.name}</DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-3">
            {items.map((x, i) => (
              <li key={x.id ?? `new-${i}`} className="bg-secondary flex flex-col gap-2 rounded-lg p-3" data-testid="edit-item">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-semibold">{x.name}</span>
                  <Button variant="ghost" size="icon" aria-label={`Swap ${x.name}`} onClick={() => setPicker({ swap: i })}>
                    <ArrowLeftRight />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${x.name}`}
                    onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Sets">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={x.target_sets}
                      onChange={(e) => set(i, { target_sets: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
                    />
                  </Field>
                  <Field label="Reps">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      value={x.target_reps}
                      onChange={(e) => {
                        const reps = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                        // Keep a rep range's width as the low end moves.
                        const width = x.target_reps_max != null ? x.target_reps_max - x.target_reps : null;
                        set(i, { target_reps: reps, target_reps_max: width != null ? Math.min(100, reps + width) : null });
                      }}
                    />
                  </Field>
                  <Field label={unit === "imperial" ? "Weight (lb)" : "Weight (kg)"}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="—"
                      value={shown(x.target_weight_kg, unit)}
                      onChange={(e) =>
                        set(i, { target_weight_kg: e.target.value === "" ? null : Math.max(0, toKg(Number(e.target.value), unit)) })
                      }
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>

          <Button variant="secondary" onClick={() => setPicker({ swap: null })}>
            <Plus /> Add exercise
          </Button>

          {inProgram && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Apply changes to</legend>
              {[
                { v: false, l: "Just this workout" },
                { v: true, l: `This day in every later week` },
              ].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  aria-pressed={laterWeeks === o.v}
                  onClick={() => setLaterWeeks(o.v)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm",
                    laterWeeks === o.v ? "border-primary bg-primary/10 font-semibold" : "text-muted-foreground",
                  )}
                >
                  {o.l}
                </button>
              ))}
              {laterWeeks && (
                <p className="text-muted-foreground text-xs">
                  Later weeks keep their own progression: a weight change moves each week by the same amount.
                </p>
              )}
            </fieldset>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button size="lg" onClick={save} disabled={busy || items.length === 0}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogContent>
      </Dialog>

      <ExercisePicker
        title={picker?.swap != null ? "Swap exercise" : "Add exercise"}
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={(e) => {
          if (picker?.swap != null) set(picker.swap, { exercise_id: e.id, name: e.name });
          else
            setItems((xs) => [
              ...xs,
              { id: null, exercise_id: e.id, name: e.name, target_sets: 3, target_reps: 10, target_reps_max: null, target_weight_kg: null },
            ]);
          setPicker(null);
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
      {label}
      {children}
    </label>
  );
}
