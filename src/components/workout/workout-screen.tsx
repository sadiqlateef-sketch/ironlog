"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag, Play, Plus, Sparkles } from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExercisePicker } from "@/components/exercise-picker";
import { PlateCalculator } from "@/components/plate-calculator";
import { ExerciseBlock } from "@/components/workout/exercise-block";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkout } from "@/hooks/use-workout";
import {
  listPendingAdjustments,
  listRoutines,
  requestAdjustments,
  type AdjustmentWithContext,
  type Exercise,
  type Routine,
} from "@/lib/workout-api";
import { formatClock } from "@/lib/workout-logic";
import { exactAlarmStatus, keepScreenOn, openExactAlarmSettings, tap } from "@/lib/native";

export function WorkoutScreen() {
  const w = useWorkout();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [plates, setPlates] = useState<{ open: boolean; weight: number | null }>({ open: false, weight: null });
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [summary, setSummary] = useState<{
    sessionId: string;
    routineId: string | null;
    durationMin: number;
    sets: number;
    exercises: number;
  } | null>(null);

  // Phone app: keep the screen awake while a workout is open.
  const active = !!w.session;
  useEffect(() => {
    keepScreenOn(active);
    return () => keepScreenOn(false);
  }, [active]);

  if (w.session === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (w.session === null) {
    return (
      <>
        <StartWorkout onStart={w.start} error={w.error} />
        <Dialog open={!!summary} onOpenChange={(o) => !o && (setSummary(null), router.push("/"))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Workout saved 💪</DialogTitle>
              <DialogDescription>Nice work.</DialogDescription>
            </DialogHeader>
            {summary && (
              <dl className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Minutes" value={summary.durationMin} />
                <Stat label="Exercises" value={summary.exercises} />
                <Stat label="Sets" value={summary.sets} />
              </dl>
            )}
            {summary?.routineId && <NextTime sessionId={summary.sessionId} />}
            <Button onClick={() => (setSummary(null), router.push("/"))}>Done</Button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const undone = w.blocks.reduce((n, b) => n + b.sets.filter((s) => !s.done).length, 0);

  async function finish() {
    setConfirmFinish(false);
    const s = await w.finish();
    if (s) setSummary(s);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{w.session.name ?? "Workout"}</h1>
          <Elapsed since={w.session.start_time} />
        </div>
        <Button onClick={() => (undone > 0 ? setConfirmFinish(true) : finish())}>
          <Flag /> Finish
        </Button>
      </header>

      {w.error && (
        <button onClick={w.clearError} className="bg-destructive/15 text-destructive rounded-lg p-3 text-left text-sm">
          Couldn&apos;t save: {w.error} (tap to dismiss)
        </button>
      )}

      <ExactAlarmHint />

      {w.blocks.map((block, i) => (
        <ExerciseBlock
          key={block.order}
          block={block}
          isLast={i === w.blocks.length - 1}
          onShowInfo={() => setInfo(block.exercise)}
          onPlates={(weight) => setPlates({ open: true, weight })}
          onToggleSuperset={() => w.toggleSuperset(block.order)}
          onRemove={() => w.removeExercise(block.order)}
          onAddSet={() => w.addSet(block.order)}
          onRemoveSet={(id) => w.removeSet(block.order, id)}
          onChangeSet={(id, patch) => w.patchSet(block.order, id, patch)}
          onCommitSet={(id) => w.commitSet(block.order, id)}
          onCycleType={(id) => w.cycleType(block.order, id)}
          onToggleDone={(id) => {
            tap();
            return w.toggleDone(block.order, id);
          }}
        />
      ))}

      <Button size="lg" variant="outline" onClick={() => setPicking(true)}>
        <Plus /> Add exercise
      </Button>

      {w.blocks.length === 0 && (
        <p className="text-muted-foreground text-center text-sm">
          Add your first exercise. Last time&apos;s numbers show up automatically.
        </p>
      )}

      <button
        type="button"
        className="text-destructive mx-auto py-2 text-sm"
        onClick={() => confirm("Discard this workout? Nothing will be saved.") && w.discard()}
      >
        Discard workout
      </button>

      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={w.addExercise} />
      <ExerciseDetail exercise={info} onOpenChange={(o) => !o && setInfo(null)} />
      <PlateCalculator
        open={plates.open}
        onOpenChange={(open) => setPlates((p) => ({ ...p, open }))}
        initialWeight={plates.weight}
      />
      <Dialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish workout?</DialogTitle>
            <DialogDescription>
              {undone} unchecked {undone === 1 ? "set" : "sets"} will be dropped.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmFinish(false)}>
              Keep going
            </Button>
            <Button onClick={finish}>Finish</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StartWorkout({ onStart, error }: { onStart: (r?: Routine) => Promise<void>; error: string | null }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listRoutines().then(setRoutines).catch(() => {});
  }, []);

  async function go(r?: Routine) {
    setBusy(true);
    await onStart(r);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Workout</h1>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button size="lg" onClick={() => go()} disabled={busy}>
        <Play /> Start empty workout
      </Button>
      <Button asChild variant="secondary">
        <Link href="/plans/">
          <Sparkles /> {routines.length ? "Programs & routines" : "Build a program with Claude"}
        </Link>
      </Button>
      {routines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Your routines</h2>
          {routines.map((r) => (
            <Button key={r.id} variant="secondary" className="justify-start" onClick={() => go(r)} disabled={busy}>
              {r.name}
              {r.ai_generated && <span className="text-muted-foreground ml-auto text-xs">AI</span>}
            </Button>
          ))}
        </section>
      )}
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="text-muted-foreground font-mono text-sm">{formatClock((now - new Date(since).getTime()) / 1000)}</p>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-secondary rounded-lg p-3">
      <dd className="font-mono text-2xl font-bold">{value}</dd>
      <dt className="text-muted-foreground text-xs">{label}</dt>
    </div>
  );
}

/** Android 14+: rest alerts can arrive late unless exact alarms are allowed. */
function ExactAlarmHint() {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let live = true;
    exactAlarmStatus().then((s) => live && setDenied(s === "denied"));
    return () => {
      live = false;
    };
  }, []);
  if (!denied) return null;
  return (
    <div className="bg-secondary flex items-center gap-3 rounded-lg p-3 text-sm">
      <p className="flex-1">Rest alerts may arrive late while the phone is locked.</p>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await openExactAlarmSettings();
          setDenied((await exactAlarmStatus()) === "denied");
        }}
      >
        Allow
      </Button>
    </div>
  );
}

/** After a routine workout: compare against the plan and suggest next time's numbers. */
function NextTime({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<AdjustmentWithContext[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestAdjustments(sessionId)
      .then(() => listPendingAdjustments(sessionId))
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, [sessionId]);

  const refresh = () => listPendingAdjustments(sessionId).then(setItems).catch(() => {});

  if (error) return <p className="text-muted-foreground text-sm">Couldn&apos;t check next session: {error}</p>;
  if (items === null) return <p className="text-muted-foreground animate-pulse text-sm">Checking your next session…</p>;
  if (items.length === 0) return <p className="text-muted-foreground text-sm">Right on plan. Same targets next time.</p>;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Next time</h3>
      <AdjustmentList items={items} onChange={refresh} />
    </section>
  );
}
