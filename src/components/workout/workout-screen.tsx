"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CloudOff, Flag, MapPin, MessageSquareText, NotebookPen, Plus, Sparkles } from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExercisePicker } from "@/components/exercise-picker";
import { PlateCalculator } from "@/components/plate-calculator";
import { EquipmentSheet } from "@/components/equipment-sheet";
import { useSlot } from "@/hooks/use-slot";
import { ExerciseBlock } from "@/components/workout/exercise-block";
import { IntervalTimer } from "@/components/workout/interval-timer";
import { NotesSheet } from "@/components/workout/notes-sheet";
import { ProgressionSheet } from "@/components/workout/progression-sheet";
import { RestSheet } from "@/components/workout/rest-sheet";
import { SwapSheet } from "@/components/workout/swap-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FindTab } from "@/components/workout/find-tab";
import { InstantTab } from "@/components/workout/instant-tab";
import { PlannedTab } from "@/components/workout/planned-tab";
import { RecordBadge, RecordCelebration } from "@/components/workout/record";
import { useWorkout, type Block } from "@/hooks/use-workout";
import {
  listPendingAdjustments,
  requestAdjustments,
  type AdjustmentWithContext,
  type Exercise,
  type Routine,
} from "@/lib/workout-api";
import { focusAfterLog, formatClock, nextUnfinished, segmentStates } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";
import { exactAlarmStatus, keepScreenOn, openExactAlarmSettings, tap } from "@/lib/native";

export function WorkoutScreen() {
  const w = useWorkout();
  const router = useRouter();
  const [info, setInfo] = useState<Exercise | null>(null);
  const [summary, setSummary] = useState<NonNullable<Awaited<ReturnType<Workout["finish"]>>> | null>(null);

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
        <StartWorkout onStart={w.start} onStartWith={w.startWith} error={w.error} />
        <Dialog open={!!summary} onOpenChange={(o) => !o && (setSummary(null), router.push("/"))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Workout saved 💪</DialogTitle>
              <DialogDescription>Nice work.</DialogDescription>
            </DialogHeader>
            {summary && summary.records > 0 && <RecordBadge count={summary.records} className="self-start" />}
            {summary && (
              <dl className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Minutes" value={summary.durationMin} />
                <Stat label="Exercises" value={summary.exercises} />
                <Stat label="Sets" value={summary.sets} />
              </dl>
            )}
            {summary?.atGym && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {summary.durationMin > 30 ? `At ${summary.atGym}, so it's going on your Google Calendar if it's connected.` : `At ${summary.atGym}. Workouts over 30 minutes go on your calendar.`}
              </p>
            )}
            {summary && !summary.synced && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <CloudOff className="size-4 shrink-0" aria-hidden />
                Saved on your phone. It will sync{summary.routineId ? ", and next time's targets will be checked," : ""} when you have signal.
              </p>
            )}
            {summary?.routineId && summary.synced && <NextTime sessionId={summary.sessionId} />}
            <Button onClick={() => (setSummary(null), router.push("/"))}>Done</Button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <ActiveWorkout w={w} onFinished={setSummary} onInfo={setInfo} info={info} />;
}

type Workout = ReturnType<typeof useWorkout>;
type View = "focus" | "list";
const VIEW_KEY = "ironlog.logger.view";

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "focus";
  } catch {
    return "focus";
  }
}

/** The logger while a workout is running. */
function ActiveWorkout({
  w,
  onFinished,
  info,
  onInfo,
}: {
  w: Workout;
  onFinished: (s: NonNullable<Awaited<ReturnType<Workout["finish"]>>>) => void;
  info: Exercise | null;
  onInfo: (e: Exercise | null) => void;
}) {
  const session = w.session!;
  const [picking, setPicking] = useState(false);
  const [plates, setPlates] = useState<{ open: boolean; weight: number | null }>({ open: false, weight: null });
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [view, setViewState] = useState<View>(savedView);
  const [focusPick, setFocus] = useState<number | null>(null);
  const [restFor, setRestFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [equipment, setEquipment] = useState(false);
  const [notes, setNotes] = useState(false);
  const [chartFor, setChartFor] = useState<Exercise | null>(null);
  const [progressionFor, setProgressionFor] = useState<number | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentWithContext[]>([]);
  const slot = useSlot("bottom-bar-slot");

  // Suggestions the AI made after the last time you did this routine.
  useEffect(() => {
    if (!session.routine_id) return;
    listPendingAdjustments().then(setAdjustments).catch(() => {});
  }, [session.routine_id]);

  const blocks = w.blocks;
  const firstOpen = blocks.find((b) => b.sets.some((s) => !s.done))?.order ?? blocks.at(-1)?.order ?? null;
  const focusOrder = focusPick != null && blocks.some((b) => b.order === focusPick) ? focusPick : firstOpen;
  const focus = blocks.find((b) => b.order === focusOrder) ?? null;
  const nextSet = focus?.sets.find((s) => !s.done) ?? null;
  const after = focus ? nextUnfinished(focus.order, blocks) : null;
  const undone = blocks.reduce((n, b) => n + b.sets.filter((s) => !s.done).length, 0);
  const adjustmentFor = (b: Block | null) =>
    b?.routineExerciseId ? (adjustments.find((a) => a.routine_exercise_id === b.routineExerciseId) ?? null) : null;
  const focusAdjustment = adjustmentFor(focus);

  function setView(v: View) {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  function jumpTo(order: number) {
    setFocus(order);
    if (view === "list") document.getElementById(`exercise-${order}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function finish() {
    setConfirmFinish(false);
    const s = await w.finish();
    if (s) onFinished(s);
  }

  async function logSet() {
    if (!focus) return setPicking(true);
    if (!nextSet) {
      if (after != null) return jumpTo(after);
      return undone > 0 ? setConfirmFinish(true) : finish();
    }
    tap();
    const ok = await w.toggleDone(focus.order, nextSet.id);
    if (!ok) {
      setNudge("Enter your reps first");
      setTimeout(() => setNudge(null), 2500);
      return;
    }
    // In a superset, hop to the partner exercise.
    const updated = blocks.map((b) =>
      b.order === focus.order ? { ...b, sets: b.sets.map((s) => (s.id === nextSet.id ? { ...s, done: true } : s)) } : b,
    );
    setFocus(focusAfterLog(focus.order, updated));
  }

  const logLabel = !focus ? "Add exercise" : nextSet ? "Log Set" : after != null ? "Next exercise" : "Finish workout";
  const shown = view === "focus" && focus ? [focus] : blocks;
  const states = segmentStates(blocks, focusOrder);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{session.name ?? "Workout"}</h1>
          <div className="flex items-center gap-2">
            <Elapsed since={session.start_time} />
            {session.at_gym && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <MapPin className="size-3.5" aria-hidden /> At the gym
              </span>
            )}
          </div>
        </div>
        <Button onClick={() => (undone > 0 ? setConfirmFinish(true) : finish())}>
          <Flag /> Finish
        </Button>
      </header>

      {blocks.length > 0 && (
        <div className="flex items-center gap-3">
          <ol className="flex flex-1 gap-1.5" aria-label="Exercises">
            {blocks.map((b, i) => (
              <li key={b.order} className="flex-1">
                <button
                  type="button"
                  onClick={() => jumpTo(b.order)}
                  aria-label={`${b.exercise.name}${states[i] === "done" ? ", done" : states[i] === "current" ? ", current" : ""}`}
                  aria-current={states[i] === "current" ? "step" : undefined}
                  className="flex h-6 w-full items-center"
                >
                  <span
                    className={cn(
                      "h-1.5 w-full rounded-full transition-colors",
                      states[i] === "done" && "bg-success",
                      states[i] === "current" && "bg-primary-text shadow-[0_0_10px_rgb(132_168_255/0.7)]",
                      states[i] === "todo" && "bg-foreground/20",
                    )}
                  />
                </button>
              </li>
            ))}
          </ol>
          <div className="bg-secondary flex rounded-lg p-0.5 text-xs font-semibold" role="group" aria-label="Layout">
            {(["focus", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-2.5 py-1 capitalize", view === v ? "bg-foreground text-background" : "text-muted-foreground")}
              >
                {v === "focus" ? "One" : "All"}
              </button>
            ))}
          </div>
        </div>
      )}

      {w.record && <RecordCelebration key={w.record.key} hit={w.record} onDone={w.clearRecord} />}

      {w.error && (
        <button onClick={w.clearError} className="bg-destructive/15 text-destructive rounded-lg p-3 text-left text-sm">
          Couldn&apos;t save: {w.error} (tap to dismiss)
        </button>
      )}

      <ExactAlarmHint />

      {shown.map((block) => (
        <div key={block.order} id={`exercise-${block.order}`} className="scroll-mt-4">
          <ExerciseBlock
            block={block}
            focused={view === "focus"}
            isLast={blocks.indexOf(block) === blocks.length - 1}
            onShowInfo={() => onInfo(block.exercise)}
            onChart={() => setChartFor(block.exercise)}
            onSwap={() => setSwapFor(block.order)}
            onRest={() => setRestFor(block.order)}
            onInterval={() => setIntervalOpen(true)}
            onEquipment={() => setEquipment(true)}
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
              setFocus(block.order);
              return w.toggleDone(block.order, id);
            }}
          />
        </div>
      ))}

      <Button size="lg" variant="outline" onClick={() => setPicking(true)}>
        <Plus /> Add exercise
      </Button>

      {blocks.length === 0 && (
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
      {/* Room for the Log Set bar */}
      <div className="h-20" aria-hidden />

      {slot &&
        createPortal(
          <div className="relative mx-auto max-w-md px-3 pb-2">
            {focusAdjustment && (
              <button
                type="button"
                onClick={() => setProgressionFor(focus!.order)}
                className="glass-strong border-ai/50 absolute -top-14 left-3 flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-[0_0_24px_rgb(179_154_255/0.35)]"
              >
                <Sparkles className="text-ai size-4" /> New progression
              </button>
            )}
            {nudge && (
              <p role="status" className="glass-strong absolute -top-12 right-3 rounded-full px-4 py-2 text-sm font-semibold">
                {nudge}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNotes(true)}
                aria-label={session.notes ? "Workout notes (1 note)" : "Workout notes"}
                className="glass-strong relative grid size-14 shrink-0 place-items-center rounded-2xl"
              >
                <NotebookPen className="size-6" />
                {session.notes && (
                  <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-5 place-items-center rounded-full text-[11px] font-bold">
                    1
                  </span>
                )}
              </button>
              <Button size="lg" className="h-14 flex-1 text-lg" onClick={logSet} data-testid="log-set">
                {logLabel === "Next exercise" && <ChevronRight />}
                {logLabel}
              </Button>
            </div>
          </div>,
          slot,
        )}

      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={w.addExercise} />
      <ExerciseDetail exercise={info} onOpenChange={(o) => !o && onInfo(null)} />
      <ExerciseDetail exercise={chartFor} onOpenChange={(o) => !o && setChartFor(null)} showChart />
      <PlateCalculator
        open={plates.open}
        onOpenChange={(open) => setPlates((p) => ({ ...p, open }))}
        initialWeight={plates.weight}
        onEditWeights={() => setEquipment(true)}
      />
      <EquipmentSheet open={equipment} onOpenChange={setEquipment} />
      <IntervalTimer open={intervalOpen} onOpenChange={setIntervalOpen} />
      <NotesSheet open={notes} onOpenChange={setNotes} notes={session.notes} onSave={w.saveNotes} />
      {(() => {
        const b = blocks.find((x) => x.order === restFor);
        return (
          <RestSheet
            open={!!b}
            onOpenChange={(o) => !o && setRestFor(null)}
            exerciseName={b?.exercise.name ?? ""}
            seconds={b?.restSeconds ?? 0}
            onChange={(sec) => b && w.setRest(b.order, sec)}
          />
        );
      })()}
      <SwapSheet
        exercise={blocks.find((b) => b.order === swapFor)?.exercise ?? null}
        onOpenChange={(o) => !o && setSwapFor(null)}
        onSwap={(e) => swapFor != null && w.swapExercise(swapFor, e)}
      />
      {(() => {
        const b = blocks.find((x) => x.order === progressionFor) ?? null;
        const drop = (a: AdjustmentWithContext) => setAdjustments((list) => list.filter((x) => x.id !== a.id));
        return (
          <ProgressionSheet
            exerciseName={b?.exercise.name ?? ""}
            adjustment={adjustmentFor(b)}
            previous={b?.previous ?? []}
            repMin={b?.repMin ?? null}
            repMax={b?.repMax ?? null}
            onOpenChange={(o) => !o && setProgressionFor(null)}
            onApplied={(a) => {
              drop(a);
              if (b && a.suggested_weight_kg != null) w.applyWeightToRemaining(b.order, a.suggested_weight_kg);
            }}
            onDismissed={drop}
          />
        );
      })()}
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

/** A DOM node rendered by the app shell, found after mount. */
type StartTab = "find" | "planned" | "instant";
const TAB_KEY = "ironlog.workout.tab";
const START_TABS: { key: StartTab; label: string }[] = [
  { key: "find", label: "Find" },
  { key: "planned", label: "Planned" },
  { key: "instant", label: "Instant" },
];

function savedTab(): StartTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return t === "find" || t === "instant" ? t : "planned";
  } catch {
    return "planned";
  }
}

/** No workout running: browse plans, follow yours, or build one for right now. */
function StartWorkout({
  onStart,
  onStartWith,
  error,
}: {
  onStart: (r?: Routine) => Promise<void>;
  onStartWith: (create: () => Promise<unknown>) => Promise<void>;
  error: string | null;
}) {
  const [tab, setTab] = useState<StartTab>(savedTab);
  const [busy, setBusy] = useState(false);
  // Remounts the Planned tab after a program is added from Find.
  const [plannedKey, setPlannedKey] = useState(0);

  function choose(t: StartTab) {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  }

  async function wrap(run: () => Promise<void>) {
    setBusy(true);
    await run();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Workout</h1>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/log/">
              <MessageSquareText /> Log past workout
            </Link>
          </Button>
        </div>
      </div>
      <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="tablist" aria-label="Workout">
        {START_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => choose(t.key)}
            className={cn("h-10 rounded-lg text-sm font-semibold", tab === t.key ? "bg-foreground text-background" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="text-destructive text-sm">{error.includes("one_active") ? "Finish or discard your current workout first." : error}</p>}
      {tab === "planned" && (
        <PlannedTab key={plannedKey} busy={busy} onStart={(r) => wrap(() => onStart(r))} onFindPlan={() => choose("find")} />
      )}
      {tab === "instant" && <InstantTab busy={busy} onStart={(create) => wrap(() => onStartWith(create))} />}
      {tab === "find" && (
        <FindTab
          busy={busy}
          onStart={(create) => wrap(() => onStartWith(create))}
          onPlanAdded={() => {
            setPlannedKey((k) => k + 1);
            choose("planned");
          }}
        />
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
