"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Play, RotateCcw, Sparkles, Square, Trash2 } from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { AppShell } from "@/components/app-shell";
import { WorkoutEditor } from "@/components/workout-editor";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { workoutTitle } from "@/lib/labels";
import { formatWeight } from "@/lib/units";
import {
  deleteProgram,
  generatePlan,
  getProgramProgress,
  listPendingAdjustments,
  listPrograms,
  listRoutinesWithExercises,
  startProgram,
  startSession,
  stopProgram,
  type AdjustmentWithContext,
  type PlanInput,
  type ProgramProgress,
  type ProgramWithWorkouts,
  type RoutineWithExercises,
} from "@/lib/workout-api";
import { cn } from "@/lib/utils";

export default function PlansPage() {
  return (
    <AppShell>
      <Plans />
    </AppShell>
  );
}

function Plans() {
  const [programs, setPrograms] = useState<ProgramWithWorkouts[] | null>(null);
  const [progress, setProgress] = useState<Record<string, ProgramProgress>>({});
  const [manual, setManual] = useState<RoutineWithExercises[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentWithContext[]>([]);
  const [editing, setEditing] = useState<RoutineWithExercises | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listPrograms()
      .then(async (ps) => {
        const entries = await Promise.all(ps.map(async (p) => [p.id, await getProgramProgress(p.id)] as const));
        setProgress(Object.fromEntries(entries.filter(([, v]) => v)) as Record<string, ProgramProgress>);
        setPrograms(ps);
      })
      .catch((e: Error) => setError(e.message));
    listRoutinesWithExercises().then(setManual).catch(() => {});
    listPendingAdjustments().then(setAdjustments).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Programs</h1>
      {error && <p className="text-destructive text-sm">{error}</p>}

      {adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggested changes</CardTitle>
            <CardDescription>Based on your last workouts. Apply to update the plan.</CardDescription>
          </CardHeader>
          <AdjustmentList items={adjustments} onChange={refresh} />
        </Card>
      )}

      {/* Your active program first, then the generator, then the rest. */}
      {programs?.filter((p) => p.is_active).map((p) => (
        <ProgramCard key={p.id} program={p} progress={progress[p.id]} onChange={refresh} onEdit={setEditing} />
      ))}

      <Generator onCreated={refresh} />

      {programs?.filter((p) => !p.is_active).map((p) => (
        <ProgramCard key={p.id} program={p} progress={progress[p.id]} onChange={refresh} onEdit={setEditing} />
      ))}
      {manual.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My routines</CardTitle>
          </CardHeader>
          {manual.map((r) => (
            <DayRow key={r.id} routine={r} onEdit={() => setEditing(r)} />
          ))}
        </Card>
      )}

      <WorkoutEditor routine={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={refresh} />
    </div>
  );
}

// ---------------- Generator form ----------------

const GOALS = [
  { v: "strength", l: "Strength" },
  { v: "hypertrophy", l: "Muscle" },
  { v: "powerbuilding", l: "Both" },
] as const;
const STYLES = [
  { v: "auto", l: "Claude picks", d: "Best fit for your goal and schedule" },
  { v: "531", l: "5/3/1", d: "Jim Wendler: steady monthly strength gains" },
  { v: "sheiko", l: "Sheiko", d: "Frequent, technical powerlifting practice" },
  { v: "rp", l: "RP hypertrophy", d: "Renaissance Periodization volume for size" },
  { v: "linear", l: "Linear", d: "Add weight every session (newer lifters)" },
] as const;
const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "kettlebell", "band", "trap_bar", "ez_bar", "smith_machine"] as const;
const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: "Barbell", dumbbell: "Dumbbells", machine: "Machines", cable: "Cables", kettlebell: "Kettlebells",
  band: "Bands", trap_bar: "Trap bar", ez_bar: "EZ bar", smith_machine: "Smith machine",
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm",
        on ? "bg-primary text-primary-foreground border-primary font-semibold" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Generator({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<PlanInput>({
    goal: "strength",
    methodology: "auto",
    days_per_week: 4,
    weeks: 8,
    session_minutes: 60,
    experience: "intermediate",
    equipment: ["barbell", "dumbbell", "machine", "cable"],
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PlanInput>(k: K, v: PlanInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await generatePlan(form);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-primary-text size-4" /> New program with Claude
        </CardTitle>
        <CardDescription>Every workout mapped out week by week, built around your logged maxes and equipment.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Goal</legend>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <Chip key={g.v} on={form.goal === g.v} onClick={() => set("goal", g.v)}>
                {g.l}
              </Chip>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Style
          <select
            className="border-input bg-secondary h-11 rounded-xl border px-3 text-base font-normal"
            value={form.methodology}
            onChange={(e) => set("methodology", e.target.value as PlanInput["methodology"])}
          >
            {STYLES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}: {s.d}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Weeks
            <select
              className="border-input bg-secondary h-11 rounded-xl border px-3 text-base font-normal"
              value={form.weeks}
              onChange={(e) => set("weeks", Number(e.target.value))}
            >
              {[4, 6, 8, 12].map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Days a week
            <select
              className="border-input bg-secondary h-11 rounded-xl border px-3 text-base font-normal"
              value={form.days_per_week}
              onChange={(e) => set("days_per_week", Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Minutes each
            <select
              className="border-input bg-secondary h-11 rounded-xl border px-3 text-base font-normal"
              value={form.session_minutes}
              onChange={(e) => set("session_minutes", Number(e.target.value))}
            >
              {[45, 60, 75, 90, 120].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Experience</legend>
          <div className="flex flex-wrap gap-2">
            {(["beginner", "intermediate", "advanced"] as const).map((x) => (
              <Chip key={x} on={form.experience === x} onClick={() => set("experience", x)}>
                {x[0].toUpperCase() + x.slice(1)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Equipment</legend>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((x) => (
              <Chip
                key={x}
                on={form.equipment.includes(x)}
                onClick={() =>
                  set("equipment", form.equipment.includes(x) ? form.equipment.filter((e) => e !== x) : [...form.equipment, x])
                }
              >
                {EQUIPMENT_LABEL[x]}
              </Chip>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Anything else? <span className="text-muted-foreground font-normal">Optional</span>
          <textarea
            maxLength={500}
            rows={2}
            placeholder="e.g. bad left shoulder, want a bigger deadlift, meet in 12 weeks"
            className="border-input bg-secondary placeholder:text-muted-foreground rounded-xl border px-3 py-2 text-base font-normal"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Claude is designing your program… (up to a minute)" : "Build my program"}
        </Button>
      </form>
    </Card>
  );
}

// ---------------- Program display ----------------

function ProgramCard({
  program,
  progress,
  onChange,
  onEdit,
}: {
  program: ProgramWithWorkouts;
  progress: ProgramProgress | undefined;
  onChange: () => void;
  onEdit: (r: RoutineWithExercises) => void;
}) {
  const active = program.is_active;
  const done = new Set(active ? (progress?.done_routine_ids ?? []) : []);
  const nextWeek = active ? (progress?.next_week ?? program.weeks) : 1;
  // Follow the program to its current week whenever that moves.
  const [week, setWeek] = useState(nextWeek);
  const [shownFor, setShownFor] = useState(nextWeek);
  if (shownFor !== nextWeek) {
    setShownFor(nextWeek);
    setWeek(nextWeek);
  }
  const [error, setError] = useState<string | null>(null);
  const days = program.routines.filter((r) => r.program_week === week);
  const finished = active && progress && progress.total > 0 && progress.done >= progress.total;

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const start = () => {
    if (confirm(`Start "${program.name}" from week 1, day 1? It becomes your only active program.`)) run(() => startProgram(program.id));
  };
  const remove = () =>
    run(async () => {
      if (!confirm(`Delete "${program.name}"? Your logged workouts stay.`)) return;
      await deleteProgram(program.id);
    });

  return (
    <Card data-testid="program" className={cn(active && "border-primary")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {active && <p className="text-primary-text text-xs font-bold tracking-wide uppercase">Active program</p>}
            <CardTitle className="leading-snug">{program.name}</CardTitle>
            <CardDescription>
              {program.weeks} {program.weeks === 1 ? "week" : "weeks"} · {program.days_per_week} days a week
              {program.methodology ? ` · ${program.methodology}` : ""}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="Delete program" onClick={remove}>
            <Trash2 />
          </Button>
        </div>
      </CardHeader>

      {active && progress && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium" data-testid="program-progress">
            {finished
              ? "Program complete. Nice work!"
              : `Up next: Week ${progress.next_week} · Day ${progress.next_day}`}
            <span className="text-muted-foreground font-normal"> · {progress.done} of {progress.total} done</span>
          </p>
          <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
            <div className="bg-primary h-full" style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
          </div>
        </div>
      )}

      {program.summary && <p className="text-sm leading-relaxed">{program.summary}</p>}
      {program.progression_rule && (
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">Progression:</span> {program.progression_rule}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {active ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => run(async () => {
              if (!confirm("Restart from week 1, day 1? Your logged workouts stay in your history.")) return;
              await startProgram(program.id);
            })}>
              <RotateCcw /> Restart
            </Button>
            <Button variant="secondary" size="sm" onClick={() => run(() => stopProgram(program.id))}>
              <Square /> Stop program
            </Button>
          </>
        ) : (
          <Button onClick={start}>
            <Play /> Start program
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}

      {program.weeks > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Week">
          {Array.from({ length: program.weeks }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              role="tab"
              aria-selected={week === w}
              onClick={() => setWeek(w)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm",
                week === w ? "bg-primary text-primary-foreground border-primary font-semibold" : "text-muted-foreground",
              )}
            >
              Week {w}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {days.map((d) => (
          <DayRow
            key={d.id}
            routine={d}
            done={done.has(d.id)}
            next={active && progress?.next_routine_id === d.id}
            onEdit={() => onEdit(d)}
          />
        ))}
      </div>
    </Card>
  );
}

function DayRow({
  routine,
  done = false,
  next = false,
  onEdit,
}: {
  routine: RoutineWithExercises;
  done?: boolean;
  next?: boolean;
  onEdit: () => void;
}) {
  const { unit } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function start() {
    try {
      await startSession(routine);
      router.push("/workout/");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("one_active") ? "Finish or discard your current workout first." : msg);
    }
  }

  return (
    <details className={cn("bg-secondary rounded-lg", next && "ring-primary ring-2")} data-testid="workout-day">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5">
        {done && <Check className="text-primary-text size-4 shrink-0" aria-label="Done" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{routine.program_day ? `Day ${routine.program_day}` : routine.name}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {routine.program_day ? workoutTitle(routine.name) : routine.description}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${routine.name}`}
          onClick={(e) => {
            e.preventDefault();
            onEdit();
          }}
        >
          <Pencil />
        </Button>
        <Button
          size="sm"
          variant={next || !routine.program_id ? "default" : "secondary"}
          onClick={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <Play /> Start
        </Button>
      </summary>
      {error && <p className="text-destructive px-3 text-sm">{error}</p>}
      <ul className="flex flex-col gap-1.5 px-3 pb-3 text-sm">
        {routine.routine_exercises.map((x) => (
          <li key={x.id} className="flex flex-col">
            <span className="flex justify-between gap-2">
              <span className="truncate">
                {x.superset_group != null && <span className="text-set-drop mr-1 text-xs font-bold">SS{x.superset_group}</span>}
                {x.exercises?.name}
              </span>
              <span className="text-muted-foreground shrink-0 font-mono">
                {x.target_sets}×{x.target_reps}
                {x.target_reps_max ? `-${x.target_reps_max}` : ""}
                {x.target_weight_kg ? ` @ ${formatWeight(x.target_weight_kg, unit)}` : x.target_rpe ? ` @ RPE ${x.target_rpe}` : ""}
              </span>
            </span>
            {x.notes && <span className="text-muted-foreground text-xs">{x.notes}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
