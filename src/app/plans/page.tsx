"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Play, Sparkles, Trash2 } from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWeight } from "@/lib/units";
import {
  deleteRoutines,
  generatePlan,
  listPendingAdjustments,
  listRoutinesWithExercises,
  startSession,
  type AdjustmentWithContext,
  type PlanInput,
  type ProgramMeta,
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
  const [routines, setRoutines] = useState<RoutineWithExercises[] | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentWithContext[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listRoutinesWithExercises().then(setRoutines).catch((e: Error) => setError(e.message));
    listPendingAdjustments().then(setAdjustments).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  // Group AI routines into programs; everything else is "My routines".
  const programs = new Map<string, { meta: ProgramMeta; days: RoutineWithExercises[] }>();
  const manual: RoutineWithExercises[] = [];
  for (const r of routines ?? []) {
    const meta = r.ai_metadata as unknown as ProgramMeta | null;
    if (r.ai_generated && meta?.program_id) {
      const p = programs.get(meta.program_id) ?? { meta, days: [] };
      p.days.push(r);
      programs.set(meta.program_id, p);
    } else manual.push(r);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Plans</h1>
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

      <Generator onCreated={refresh} />

      {[...programs.values()].reverse().map((p) => (
        <ProgramCard key={p.meta.program_id} meta={p.meta} days={p.days} onChange={refresh} />
      ))}
      {manual.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My routines</CardTitle>
          </CardHeader>
          {manual.map((r) => (
            <DayRow key={r.id} routine={r} />
          ))}
        </Card>
      )}
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
          <Sparkles className="text-primary size-4" /> New program with Claude
        </CardTitle>
        <CardDescription>Built around your logged maxes and the equipment you have.</CardDescription>
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
            className="border-input bg-background h-11 rounded-md border px-3 text-base font-normal"
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
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Days a week
            <select
              className="border-input bg-background h-11 rounded-md border px-3 text-base font-normal"
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
              className="border-input bg-background h-11 rounded-md border px-3 text-base font-normal"
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
            className="border-input bg-background placeholder:text-muted-foreground rounded-md border px-3 py-2 text-base font-normal"
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

function ProgramCard({ meta, days, onChange }: { meta: ProgramMeta; days: RoutineWithExercises[]; onChange: () => void }) {
  async function remove() {
    if (!confirm(`Delete "${meta.program_name}"? Your logged workouts stay.`)) return;
    await deleteRoutines(days.map((d) => d.id));
    onChange();
  }
  return (
    <Card data-testid="program">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="leading-snug">{meta.program_name}</CardTitle>
            <CardDescription>{meta.methodology}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="Delete program" onClick={remove}>
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <p className="text-sm leading-relaxed">{meta.summary}</p>
      <p className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">Progression:</span> {meta.progression_rule}
      </p>
      <div className="flex flex-col gap-2">
        {[...days].sort((a, b) => (a.ai_metadata as unknown as ProgramMeta).day_index - (b.ai_metadata as unknown as ProgramMeta).day_index).map((d) => (
          <DayRow key={d.id} routine={d} />
        ))}
      </div>
    </Card>
  );
}

function DayRow({ routine }: { routine: RoutineWithExercises }) {
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
    <details className="bg-secondary rounded-lg">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{routine.name}</span>
          {routine.description && <span className="text-muted-foreground block truncate text-xs">{routine.description}</span>}
        </span>
        <Button
          size="sm"
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
