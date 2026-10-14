"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Camera, Check, ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { NewExerciseDialog } from "@/components/new-exercise-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prepareImages } from "@/lib/import-image";
import { toKg, kgToLb, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { nextSetType, setLabel } from "@/lib/workout-logic";
import { listExercises, readWorkout, saveFinishedWorkout, type Exercise, type ImportedWorkout, type WorkoutSet } from "@/lib/workout-api";

type SetType = WorkoutSet["set_type"];

interface DraftSet {
  key: number;
  type: SetType;
  weight: string; // in the lifter's unit, as typed
  reps: string;
  rpe: number | null;
}

interface DraftExercise {
  key: number;
  exerciseId: string | null;
  nameAsWritten: string;
  /** Matched by name only, not by Claude: worth a second look. */
  guessed: boolean;
  sets: DraftSet[];
}

interface Draft {
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  minutes: string;
  notes: string;
  exercises: DraftExercise[];
}

const typeStyles = {
  normal: "bg-secondary text-foreground",
  warmup: "bg-set-warmup/20 text-set-warmup",
  drop: "bg-set-drop/20 text-set-drop",
  failure: "bg-set-failure/20 text-set-failure",
} as const;

const numInput =
  "h-11 w-full min-w-0 rounded-xl bg-secondary text-center font-mono text-lg font-bold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

let nextKey = 1;
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function showWeight(kg: number, unit: UnitSystem): string {
  if (!(kg > 0)) return "";
  const v = unit === "imperial" ? kgToLb(kg) : kg;
  return String(Math.round(v * 10) / 10);
}

/** Turn what Claude read into an editable form, filling gaps with sensible guesses. */
function toDraft(w: ImportedWorkout, unit: UnitSystem): Draft {
  const setCount = w.exercises.reduce((n, x) => n + x.sets.length, 0);
  const minutes = w.duration_minutes ?? Math.min(120, Math.max(20, setCount * 3));
  const now = new Date();
  const date = w.date ?? localDate(now);
  // No time shown: if it was today, assume it just ended; otherwise early evening.
  const time = w.start_time ?? (date === localDate(now) ? localTime(new Date(now.getTime() - minutes * 60_000)) : "18:00");
  return {
    name: w.title,
    date,
    time,
    minutes: String(minutes),
    notes: w.notes,
    exercises: w.exercises.map((x) => ({
      key: nextKey++,
      exerciseId: x.exercise_id,
      nameAsWritten: x.name_as_written,
      guessed: x.match === "name",
      sets: x.sets.map((s) => ({ key: nextKey++, type: s.set_type, weight: showWeight(s.weight_kg, unit), reps: s.reps ? String(s.reps) : "", rpe: s.rpe })),
    })),
  };
}

export function ImportScreen() {
  const { unit } = useAuth();
  const [step, setStep] = useState<"input" | "review" | "saved">("input");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sourceUnit, setSourceUnit] = useState<"lb" | "kg" | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  if (step === "saved") return <Saved onAnother={() => { setDraft(null); setSavedId(null); setStep("input"); }} sessionId={savedId} />;
  if (step === "review" && draft) {
    return (
      <Review
        draft={draft}
        setDraft={setDraft}
        unit={unit}
        sourceUnit={sourceUnit}
        onBack={() => setStep("input")}
        onSaved={(id) => {
          setSavedId(id);
          setStep("saved");
        }}
      />
    );
  }
  return (
    <Pick
      onRead={(w) => {
        setSourceUnit(w.source_unit);
        setDraft(toDraft(w, unit));
        setStep("review");
      }}
    />
  );
}

// ---------- Step 1: add a photo, screenshot or text ----------

function Pick({ onRead }: { onRead: (w: ImportedWorkout) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function add(list: FileList | null) {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)].slice(0, 4));
    setError(null);
  }

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const images = await prepareImages(files);
      onRead(await readWorkout({ images, text, today: localDate(new Date()) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = files.length > 0 || text.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/workout/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Import workout</h1>
      </header>
      <p className="text-muted-foreground text-sm">
        Add a screenshot from another app, a photo of your notebook, or type it out. Claude reads it and you check everything before it&apos;s saved.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={() => camera.current?.click()} disabled={busy}>
          <Camera /> Take photo
        </Button>
        <Button variant="secondary" size="lg" onClick={() => gallery.current?.click()} disabled={busy}>
          <ImagePlus /> Screenshots
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {files.length > 0 && (
        <ul className="grid grid-cols-4 gap-2" aria-label="Added pictures">
          {previews.map((src, i) => (
            <li key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a picked file */}
              <img src={src} alt={`Picture ${i + 1}`} className="aspect-[3/4] w-full rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                aria-label={`Remove picture ${i + 1}`}
                className="bg-background/80 absolute top-1 right-1 grid size-7 place-items-center rounded-full"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Or paste / type it
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"Squat 3x5 225\nBench 185x8, 185x8, 185x7\nRows 4x10 @ 135"}
          className="border-input bg-secondary placeholder:text-muted-foreground focus-visible:ring-ring/50 rounded-xl border px-3 py-2 font-mono text-base font-normal outline-none focus-visible:ring-[3px]"
        />
      </label>

      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

      <Button size="lg" onClick={read} disabled={!ready || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "Reading your workout…" : "Read workout"}
      </Button>
      {busy && <p className="text-muted-foreground text-center text-xs">This can take up to a minute for handwriting.</p>}
    </div>
  );
}

// ---------- Step 2: check and fix, then save ----------

function Review({
  draft,
  setDraft,
  unit,
  sourceUnit,
  onBack,
  onSaved,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  unit: UnitSystem;
  sourceUnit: "lb" | "kg" | null;
  onBack: () => void;
  onSaved: (sessionId: string) => void;
}) {
  const [library, setLibrary] = useState<Map<string, Exercise>>(new Map());
  const [picking, setPicking] = useState<number | "new-exercise" | null>(null);
  const [creating, setCreating] = useState<DraftExercise | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unitLabel = unit === "imperial" ? "lb" : "kg";
  const [today] = useState(() => localDate(new Date()));

  useEffect(() => {
    listExercises()
      .then((list) => setLibrary(new Map(list.map((e) => [e.id, e]))))
      .catch(() => {});
  }, []);

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const updateExercise = (key: number, patch: Partial<DraftExercise>) =>
    update({ exercises: draft.exercises.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  const updateSet = (x: DraftExercise, key: number, patch: Partial<DraftSet>) =>
    updateExercise(x.key, { sets: x.sets.map((s) => (s.key === key ? { ...s, ...patch } : s)) });

  const unmatched = draft.exercises.filter((x) => !x.exerciseId).length;
  const doneSets = draft.exercises.reduce((n, x) => n + x.sets.filter((s) => Number(s.reps) > 0).length, 0);
  const minutes = Number(draft.minutes);
  const start = new Date(`${draft.date}T${draft.time || "12:00"}`);
  const problem =
    unmatched > 0
      ? `Pick an exercise for ${unmatched === 1 ? "the one" : `the ${unmatched}`} marked in yellow.`
      : doneSets === 0
        ? "Add reps to at least one set."
        : Number.isNaN(+start)
          ? "Pick the date."
          : draft.date > today
            ? "The date is in the future."
            : !(minutes > 0 && minutes <= 600)
              ? "Set how long it took (minutes)."
              : null;

  async function save() {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const session = await saveFinishedWorkout({
        name: draft.name,
        start,
        minutes,
        notes: draft.notes,
        exercises: draft.exercises
          .map((x) => ({
            exercise_id: x.exerciseId!,
            sets: x.sets
              .filter((s) => Number(s.reps) > 0)
              .map((s) => ({
                set_type: s.type,
                reps: Math.min(999, Math.round(Number(s.reps))),
                weight_kg: Math.max(0, toKg(Number(s.weight) || 0, unit)),
                rpe: s.rpe,
              })),
          }))
          .filter((x) => x.sets.length > 0),
      });
      onSaved(session.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Check workout</h1>
          <p className="text-muted-foreground text-xs">Fix anything Claude misread, then save.</p>
        </div>
      </header>

      <Card className="gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Name
          <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} maxLength={80} />
        </label>
        <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_4rem] gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Date
            <Input type="date" value={draft.date} max={today} onChange={(e) => update({ date: e.target.value })} className="min-w-0 px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Start
            <Input type="time" value={draft.time} onChange={(e) => update({ time: e.target.value })} className="min-w-0 px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Minutes
            <Input inputMode="numeric" value={draft.minutes} onChange={(e) => update({ minutes: e.target.value.replace(/\D/g, "") })} className="min-w-0 px-2 text-center" />
          </label>
        </div>
        {sourceUnit && sourceUnit !== (unit === "imperial" ? "lb" : "kg") && (
          <p className="text-muted-foreground text-xs">
            Weights were in {sourceUnit} and are shown in {unitLabel}.
          </p>
        )}
      </Card>

      {draft.exercises.map((x) => {
        const ex = x.exerciseId ? library.get(x.exerciseId) : undefined;
        let working = 0;
        return (
          <Card key={x.key} className={cn("gap-3 p-4", !x.exerciseId && "ring-set-warmup/70 ring-2")} data-testid="import-exercise">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {x.exerciseId ? (
                  <p className="truncate text-lg font-bold">{ex?.name ?? "…"}</p>
                ) : (
                  <p className="text-set-warmup flex items-center gap-1.5 text-lg font-bold">
                    <AlertTriangle className="size-5 shrink-0" aria-hidden /> Not in your library
                  </p>
                )}
                {(!x.exerciseId || x.guessed || (ex && ex.name.toLowerCase() !== x.nameAsWritten.toLowerCase())) && (
                  <p className="text-muted-foreground truncate text-xs">
                    Written as “{x.nameAsWritten}”{x.guessed && x.exerciseId ? " (best guess)" : ""}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${ex?.name ?? x.nameAsWritten}`}
                onClick={() => update({ exercises: draft.exercises.filter((y) => y.key !== x.key) })}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPicking(x.key)}>
                {x.exerciseId ? "Change exercise" : "Choose exercise"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCreating(x)}>
                <Plus /> New exercise
              </Button>
            </div>

            <div className="grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2 px-1">
              <span className="text-muted-foreground text-center text-xs font-semibold">Set</span>
              <span className="text-muted-foreground text-center text-xs font-semibold">{unitLabel}</span>
              <span className="text-muted-foreground text-center text-xs font-semibold">Reps</span>
              <span />
              {x.sets.map((s) => {
                if (s.type !== "warmup") working++;
                return (
                  <SetLine
                    key={s.key}
                    s={s}
                    label={setLabel(s.type, working)}
                    onChange={(patch) => updateSet(x, s.key, patch)}
                    onRemove={() => updateExercise(x.key, { sets: x.sets.filter((y) => y.key !== s.key) })}
                  />
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const last = x.sets[x.sets.length - 1];
                updateExercise(x.key, { sets: [...x.sets, { key: nextKey++, type: "normal", weight: last?.weight ?? "", reps: last?.reps ?? "", rpe: null }] });
              }}
            >
              <Plus /> Add set
            </Button>
          </Card>
        );
      })}

      <Button variant="secondary" onClick={() => setPicking("new-exercise")}>
        <Plus /> Add exercise
      </Button>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Notes
        <textarea
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={2}
          className="border-input bg-secondary rounded-xl border px-3 py-2 text-base font-normal outline-none focus-visible:ring-[3px]"
        />
      </label>

      {(problem || error) && (
        <p className={cn("text-sm", error ? "text-destructive" : "text-set-warmup")} role="status">
          {error ?? problem}
        </p>
      )}
      <Button size="lg" onClick={save} disabled={!!problem || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Check />} Save workout
      </Button>

      <ExercisePicker
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        title={picking === "new-exercise" ? "Add exercise" : "Choose exercise"}
        onPick={(e) => {
          setLibrary((m) => new Map(m).set(e.id, e));
          if (picking === "new-exercise") {
            update({
              exercises: [
                ...draft.exercises,
                { key: nextKey++, exerciseId: e.id, nameAsWritten: e.name, guessed: false, sets: [{ key: nextKey++, type: "normal", weight: "", reps: "", rpe: null }] },
              ],
            });
          } else if (typeof picking === "number") {
            updateExercise(picking, { exerciseId: e.id, guessed: false });
          }
        }}
      />
      <NewExerciseDialog
        key={creating?.key ?? 0}
        open={creating !== null}
        onOpenChange={(o) => !o && setCreating(null)}
        initialName={creating?.nameAsWritten}
        onCreated={(e) => {
          setLibrary((m) => new Map(m).set(e.id, e));
          if (creating) updateExercise(creating.key, { exerciseId: e.id, guessed: false });
        }}
      />
    </div>
  );
}

function SetLine({
  s,
  label,
  onChange,
  onRemove,
}: {
  s: DraftSet;
  label: string;
  onChange: (patch: Partial<DraftSet>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onChange({ type: nextSetType(s.type) })}
        aria-label={`Set type ${s.type}. Tap to change.`}
        className={cn("h-9 rounded-lg font-mono text-sm font-bold", typeStyles[s.type])}
      >
        {label}
      </button>
      <input
        inputMode="decimal"
        aria-label="Weight"
        placeholder="0"
        value={s.weight}
        onChange={(e) => onChange({ weight: e.target.value.replace(/[^\d.]/g, "") })}
        className={numInput}
      />
      <input
        inputMode="numeric"
        aria-label="Reps"
        placeholder="0"
        value={s.reps}
        onChange={(e) => onChange({ reps: e.target.value.replace(/\D/g, "") })}
        className={numInput}
      />
      <button type="button" onClick={onRemove} aria-label="Remove set" className="text-muted-foreground grid h-11 place-items-center">
        <X className="size-5" />
      </button>
    </>
  );
}

// ---------- Step 3: done ----------

function Saved({ onAnother, sessionId }: { onAnother: () => void; sessionId: string | null }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center" data-session={sessionId ?? undefined}>
      <div className="bg-success/15 text-success grid size-16 place-items-center rounded-full">
        <Check className="size-8" />
      </div>
      <h1 className="text-2xl font-bold">Workout saved</h1>
      <p className="text-muted-foreground text-sm">It&apos;s in your history now, so your progress charts, records and recovery include it.</p>
      <div className="grid w-full grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onAnother}>
          Import another
        </Button>
        <Button onClick={() => router.push("/progress/")}>See progress</Button>
      </div>
    </div>
  );
}
