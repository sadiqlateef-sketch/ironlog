"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Dumbbell, Play, Plus, Shuffle, Trash2, X } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SortableList } from "@/components/ui/sortable-list";
import { MUSCLE_LABELS } from "@/lib/labels";
import {
  buildInstantWorkout,
  INSTANT_EQUIPMENT,
  INSTANT_MINUTES,
  INSTANT_TARGETS,
  itemMinutes,
  type InstantEquipment,
  type InstantItem,
  type InstantTarget,
} from "@/lib/workout-plan";
import { listExercises, startPlannedSession, type Exercise } from "@/lib/workout-api";
import type { MuscleGroup } from "@/types/database";
import { cn } from "@/lib/utils";

type Item = InstantItem<Exercise> & { key: string };
type Opts = { minutes: number; equipment: InstantEquipment; target: InstantTarget };

const PREFS_KEY = "ironlog.instant";

function savedOpts(): Opts {
  try {
    const o = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      minutes: INSTANT_MINUTES.includes(o.minutes) ? o.minutes : 30,
      equipment: o.equipment in INSTANT_EQUIPMENT ? o.equipment : "gym",
      target: o.target in INSTANT_TARGETS ? o.target : "full",
    };
  } catch {
    return { minutes: 30, equipment: "gym", target: "full" };
  }
}

/**
 * A one-off workout for right now. Pick time, equipment and target muscles
 * and it builds one from your exercise library; shuffle for another take,
 * then reorder, add or remove exercises before you start.
 */
export function InstantTab({ busy, onStart }: { busy: boolean; onStart: (create: () => Promise<unknown>) => void }) {
  const [library, setLibrary] = useState<Exercise[] | null>(null);
  const [opts, setOpts] = useState<Opts>(savedOpts);
  const [seed, setSeed] = useState(1);
  // Your edits on top of the generated workout; reset when the options change.
  const [edited, setEdited] = useState<{ for: string; items: Item[] } | null>(null);
  const [choose, setChoose] = useState<"minutes" | "equipment" | "target" | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listExercises()
      .then(setLibrary)
      .catch((e: Error) => setError(e.message));
  }, []);

  const signature = `${opts.minutes}|${opts.equipment}|${opts.target}|${seed}`;
  const built = useMemo(() => {
    if (!library) return null;
    const w = buildInstantWorkout(library, opts, seed);
    return { title: w.title, items: w.items.map((x) => ({ ...x, key: x.exercise.id })) };
  }, [library, opts, seed]);
  const items = edited?.for === signature ? edited.items : (built?.items ?? []);
  const minutes = Math.round(items.reduce((t, x) => t + itemMinutes(x), 0));

  function change(patch: Partial<Opts>) {
    const next = { ...opts, ...patch };
    setOpts(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  }
  const edit = (next: Item[]) => setEdited({ for: signature, items: next });

  function add(e: Exercise) {
    const compound = e.mechanic === "compound";
    edit([...items, { key: `${e.id}-${items.length}`, exercise: e, sets: 3, repMin: compound ? 6 : 10, repMax: compound ? 10 : 15, rest: compound ? 120 : 60 }]);
  }

  const start = () =>
    onStart(() =>
      startPlannedSession(
        { name: built?.title ?? "Instant workout" },
        items.map((x) => ({ exercise_id: x.exercise.id, sets: x.sets })),
      ),
    );

  const choices = {
    minutes: { title: "How long have you got?", options: INSTANT_MINUTES.map((m) => ({ value: String(m), label: `${m} min` })) },
    equipment: {
      title: "What equipment do you have?",
      options: Object.entries(INSTANT_EQUIPMENT).map(([value, e]) => ({ value, label: e.label })),
    },
    target: {
      title: "What do you want to train?",
      options: Object.entries(INSTANT_TARGETS).map(([value, t]) => ({ value, label: t.label })),
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Pill label={`${opts.minutes} min`} onClick={() => setChoose("minutes")} aria="Time" />
        <Pill label={INSTANT_EQUIPMENT[opts.equipment].label} onClick={() => setChoose("equipment")} aria="Equipment" />
        <Pill label={INSTANT_TARGETS[opts.target].label} onClick={() => setChoose("target")} aria="Target muscles" />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!built ? (
        !error && <p className="text-muted-foreground text-sm">Building your workout…</p>
      ) : (
        <section className="glass flex flex-col gap-3 rounded-3xl p-4">
          <header className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl leading-tight font-extrabold" data-testid="instant-title">
                {built.title}
              </h2>
              <p className="text-muted-foreground text-sm">
                ~{minutes} min · {items.length} exercises
              </p>
            </div>
            <Button variant="secondary" size="icon" aria-label="Shuffle exercises" onClick={() => setSeed((s) => s + 1)}>
              <Shuffle />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Clear this workout"
              disabled={!items.length}
              onClick={() => edit([])}
            >
              <Trash2 />
            </Button>
          </header>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-muted-foreground text-sm">No exercises. Add your own or shuffle for a new workout.</p>
              <Button variant="secondary" onClick={() => setSeed((s) => s + 1)}>
                <Shuffle /> Build a new one
              </Button>
            </div>
          ) : (
            <SortableList
              items={items}
              keyOf={(x) => x.key}
              labelOf={(x) => x.exercise.name}
              onReorder={edit}
              className="gap-0"
              renderItem={(x, handle) => (
                <div className="flex items-center gap-2 py-1.5">
                  {handle}
                  {x.exercise.image_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.exercise.image_urls[0]} alt="" className="size-12 shrink-0 rounded-full bg-white object-cover" />
                  ) : (
                    <span className="bg-secondary grid size-12 shrink-0 place-items-center rounded-full">
                      <Dumbbell className="text-muted-foreground size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{x.exercise.name}</p>
                    <p className="text-muted-foreground text-sm">
                      <span className="font-mono">
                        {x.sets} × {x.repMin}–{x.repMax}
                      </span>{" "}
                      · {MUSCLE_LABELS[x.exercise.primary_muscle as MuscleGroup]}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${x.exercise.name}`}
                    onClick={() => edit(items.filter((y) => y.key !== x.key))}
                  >
                    <X />
                  </Button>
                </div>
              )}
            />
          )}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" size="lg" onClick={() => setPicking(true)}>
              <Plus /> Add
            </Button>
            <Button size="lg" disabled={busy || !items.length} onClick={start} data-testid="instant-start">
              <Play className="fill-current" /> Start Workout
            </Button>
          </div>
        </section>
      )}

      <Dialog open={!!choose} onOpenChange={(o) => !o && setChoose(null)}>
        <DialogContent>
          {choose && (
            <>
              <DialogHeader>
                <DialogTitle>{choices[choose].title}</DialogTitle>
                <DialogDescription>The workout rebuilds to match.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2">
                {choices[choose].options.map((o) => {
                  const on = String(opts[choose]) === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        change(choose === "minutes" ? { minutes: Number(o.value) } : { [choose]: o.value });
                        setChoose(null);
                      }}
                      className={cn(
                        "h-12 rounded-xl text-sm font-semibold",
                        on ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={add} />
    </div>
  );
}

function Pill({ label, onClick, aria }: { label: string; onClick: () => void; aria: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${aria}: ${label}. Tap to change.`}
      className="glass flex h-11 items-center justify-center gap-1 rounded-full px-2 text-sm font-semibold"
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="text-muted-foreground size-4 shrink-0" />
    </button>
  );
}
