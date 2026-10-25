"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpDown, ArrowUpToLine, Check, ChevronRight, CloudOff, Flag, MapPin, MessageSquareText, Minimize2, NotebookPen, Play, Plus, SlidersHorizontal, Sparkles, Trash2, Undo2 } from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExercisePicker } from "@/components/exercise-picker";
import { PlateCalculator } from "@/components/plate-calculator";
import { EquipmentSheet, Switch } from "@/components/equipment-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import { useKits } from "@/hooks/use-kits";
import { kitAllows, kitFor } from "@/lib/kit";
import { HOME_CALENDAR_KEY } from "@/lib/home-prefs";
import { syncGymCalendar } from "@/lib/gym";
import { useSlot } from "@/hooks/use-slot";
import { ExerciseBlock } from "@/components/workout/exercise-block";
import { HoldTimer } from "@/components/workout/hold-timer";
import { CurrentSetControls, FocusView, setTitle } from "@/components/workout/current-set";
import { KeypadProvider } from "@/components/workout/keypad";
import { GestureHint, LoggerOptions } from "@/components/workout/logger-options";
import { setLoggerPref, useLoggerPrefs } from "@/lib/logger-prefs";
import { IntervalTimer } from "@/components/workout/interval-timer";
import { NotesSheet } from "@/components/workout/notes-sheet";
import { ReorderSheet } from "@/components/workout/reorder-sheet";
import { ProgressionSheet } from "@/components/workout/progression-sheet";
import { RestSheet } from "@/components/workout/rest-sheet";
import { SwapSheet } from "@/components/workout/swap-sheet";
import { WarmupSheet } from "@/components/workout/warmup-sheet";
import { VoiceLogButton } from "@/components/workout/voice-log";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FindTab } from "@/components/workout/find-tab";
import { HomeTab } from "@/components/workout/home-tab";
import { InstantTab } from "@/components/workout/instant-tab";
import { PlannedTab } from "@/components/workout/planned-tab";
import { RecordCelebration } from "@/components/workout/record";
import { FinishSummary } from "@/components/workout/finish-summary";
import { useWorkout, type Block, type UiSet } from "@/hooks/use-workout";
import {
  listPendingAdjustments,
  requestAdjustments,
  setSessionCalendar,
  type AdjustmentWithContext,
  type Exercise,
  type Routine,
} from "@/lib/workout-api";
import {
  doNextIndex,
  exerciseUnits,
  focusAfterLog,
  formatClock,
  moveUnit,
  nextUnfinished,
  segmentStates,
  unitIndex,
  workingOn,
} from "@/lib/workout-logic";
import { cn } from "@/lib/utils";
import { PLATE_LOADED } from "@/lib/labels";
import { ownedPlates } from "@/lib/plates";
import { kgToLb } from "@/lib/units";
import { parseDuration } from "@/lib/cardio";
import { weightStep } from "@/lib/set-logic";
import { keepScreenOn, openExactAlarmSettings, requestNotifications, restAlertStatus, tap } from "@/lib/native";
import { SkeletonList } from "@/components/ui/skeleton";

export function WorkoutScreen() {
  const w = useWorkout();
  const router = useRouter();
  const [info, setInfo] = useState<Exercise | null>(null);
  // Deleting an old workout takes two taps.
  const [confirmDeleteStale, setConfirmDeleteStale] = useState(false);
  const [summary, setSummary] = useState<NonNullable<Awaited<ReturnType<Workout["finish"]>>> | null>(null);

  /** Close the "Workout saved" card; a home workout's calendar answer is saved then. */
  function closeSummary() {
    const s = summary;
    setSummary(null);
    router.push("/");
    if (s?.addToCalendar == null) return;
    try {
      localStorage.setItem(HOME_CALENDAR_KEY, s.addToCalendar ? "1" : "0");
    } catch {}
    const save = s.addToCalendar === s.startedWithCalendar ? Promise.resolve(true) : setSessionCalendar(s.sessionId, s.addToCalendar);
    save
      .then((ok) => {
        if (ok && s.addToCalendar) void syncGymCalendar();
      })
      .catch(() => {});
  }

  // Phone app: keep the screen awake while a workout is open.
  const active = !!w.session;
  useEffect(() => {
    keepScreenOn(active);
    return () => keepScreenOn(false);
  }, [active]);

  if (w.session === undefined) {
    return <SkeletonList rows={4} rowClassName="h-24" />;
  }

  if (w.session === null) {
    return (
      <>
        <StartWorkout onStart={w.start} onStartWith={w.startWith} error={w.error} />
        {w.staleSession && (
          <Dialog
            open={!!w.staleSession}
            onOpenChange={(o) => {
              // Closing never deletes the workout.
              if (!o) {
                setConfirmDeleteStale(false);
                w.hideStale();
              }
            }}
          >
            <DialogContent data-testid="stale-workout-dialog">
              <DialogHeader>
                <DialogTitle>You have a workout still open</DialogTitle>
                <DialogDescription>
                  {w.staleSession.name ?? "Workout"} · started{" "}
                  {new Date(w.staleSession.start_time).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 pt-3">
                <Button size="lg" onClick={w.resumeStale} data-testid="resume-stale">
                  <Play className="size-4 mr-2" /> Keep logging it
                </Button>
                <Button variant="outline" size="lg" onClick={w.finishStale} data-testid="finish-stale">
                  <Flag className="size-4 mr-2" /> Finish it now
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => (confirmDeleteStale ? w.discardStale() : setConfirmDeleteStale(true))}
                  data-testid="discard-stale"
                >
                  <Trash2 className="size-4 mr-2" /> {confirmDeleteStale ? "Tap again to delete" : "Delete it…"}
                </Button>
                <p className="text-muted-foreground pt-1 text-center text-xs">Closing this keeps it.</p>
              </div>
            </DialogContent>
          </Dialog>
        )}
        <Dialog open={!!summary} onOpenChange={(o) => !o && closeSummary()}>
          <DialogContent>
            <DialogHeader className="sr-only">
              <DialogTitle>Workout saved</DialogTitle>
              <DialogDescription>Your workout summary.</DialogDescription>
            </DialogHeader>
            {summary && (
              <FinishSummary workout={summary} onDone={closeSummary}>
                {summary.atGym && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <MapPin className="size-4 shrink-0" aria-hidden />
                    {summary.durationMin > 30 ? `At ${summary.atGym}, so it's going on your Google Calendar if it's connected.` : `At ${summary.atGym}. Workouts over 30 minutes go on your calendar.`}
                  </p>
                )}
                {!summary.synced && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <CloudOff className="size-4 shrink-0" aria-hidden />
                    Saved on your phone. It will sync{summary.routineId ? ", and next time's targets will be checked," : ""} when you have signal.
                  </p>
                )}
                {summary.routineId && summary.synced && <NextTime sessionId={summary.sessionId} />}
                {summary.addToCalendar != null && (
                  <Switch
                    on={summary.addToCalendar}
                    onClick={() => setSummary({ ...summary, addToCalendar: !summary.addToCalendar })}
                    label="Add to calendar?"
                    detail="Puts this workout on your Google Calendar, if it's connected. Remembered for next time."
                  />
                )}
              </FinishSummary>
            )}
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
  const router = useRouter();
  const { profile, unit } = useAuth();
  const { markMissing } = useKits();
  const kit = kitFor(session.kit_id, profile);
  const [picking, setPicking] = useState(false);
  /** Where the picker's exercise goes, counting supersets as one; null = at the end. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  /** Just added at the end: offer to do it next. */
  const [added, setAdded] = useState<{ order: number; name: string } | null>(null);
  const [plates, setPlates] = useState<{ open: boolean; weight: number | null }>({ open: false, weight: null });
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [view, setViewState] = useState<View>(savedView);
  const [focusPick, setFocus] = useState<number | null>(null);
  const [restFor, setRestFor] = useState<number | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [warmupFor, setWarmupFor] = useState<number | null>(null);
  const [holdFor, setHoldFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [equipment, setEquipment] = useState(false);
  const [notes, setNotes] = useState(false);
  const [chartFor, setChartFor] = useState<Exercise | null>(null);
  const [progressionFor, setProgressionFor] = useState<number | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentWithContext[]>([]);
  const [options, setOptions] = useState(false);
  /** Cards you opened or closed yourself; the rest close once every set is done. */
  const [openCards, setOpenCards] = useState<Map<number, boolean>>(() => new Map());
  /** Just deleted: offer to put it back. */
  const [removed, setRemoved] = useState<{ order: number; set: UiSet; index: number; key: number } | null>(null);
  const removedKey = useRef(0);
  const prefs = useLoggerPrefs();
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

  /** Save a new order and keep pointing at the same exercise. */
  function reorder(next: Block[]): Map<number, number> {
    const slots = w.reorder(next);
    setFocus((f) => (f == null ? f : (slots.get(f) ?? f)));
    setOpenCards((m) => new Map([...m].map(([k, v]) => [slots.get(k) ?? k, v])));
    return slots;
  }

  /** Move an exercise to straight after the one you're on (or ahead of it if you haven't started it). */
  function doNext(order: number) {
    const list = w.blocksNow();
    const current = workingOn(list, focusOrder, order);
    const startedCurrent = list.some((b) => b.order === current && b.sets.some((s) => s.done));
    const slots = reorder(moveUnit(list, order, doNextIndex(list, order, current)));
    if (!startedCurrent) setFocus(slots.get(order) ?? order);
    setAdded(null);
    tap();
    const name = list.find((b) => b.order === order)?.exercise.name;
    if (name && startedCurrent) {
      setNudge(`${name} is up next`);
      setTimeout(() => setNudge(null), 2500);
    }
  }

  function moveBy(order: number, step: -1 | 1) {
    const list = w.blocksNow();
    reorder(moveUnit(list, order, unitIndex(list, order) + step));
  }

  /** Whether "Do next" would change anything for this exercise. */
  function canDoNext(b: Block): boolean {
    if (b.sets.some((s) => s.done) || b.sets.every((s) => s.done)) return false;
    const current = workingOn(blocks, focusOrder, b.order);
    if (current == null) return false;
    return doNextIndex(blocks, b.order, current) !== unitIndex(blocks, b.order);
  }

  async function addPicked(e: Exercise) {
    const at = insertAt;
    setInsertAt(null);
    const order = await w.addExercise(e);
    if (order == null) return;
    if (at != null) {
      reorder(moveUnit(w.blocksNow(), order, at));
      return;
    }
    const list = w.blocksNow();
    const current = workingOn(list, focusOrder, order);
    if (current != null && doNextIndex(list, order, current) !== unitIndex(list, order)) {
      setAdded({ order, name: e.name });
      setTimeout(() => setAdded((a) => (a?.order === order ? null : a)), 8000);
    }
  }

  function jumpTo(order: number) {
    setFocus(order);
    if (view === "list") document.getElementById(`exercise-${order}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function removeSet(order: number, id: string) {
    const b = w.blocksNow().find((x) => x.order === order);
    const index = b?.sets.findIndex((x) => x.id === id) ?? -1;
    if (!b || index < 0) return;
    const key = ++removedKey.current;
    setRemoved({ order, set: b.sets[index], index, key });
    setTimeout(() => setRemoved((r) => (r?.key === key ? null : r)), 5000);
    w.removeSet(order, id);
  }

  function undoRemove() {
    if (!removed) return;
    setRemoved(null);
    w.restoreSet(removed.order, removed.set, removed.index);
  }

  const collapsedCard = (b: Block) =>
    view === "list" && (openCards.get(b.order) === false || (openCards.get(b.order) == null && b.order !== focusOrder && b.sets.length > 0 && b.sets.every((x) => x.done)));

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

  function renderExerciseBlock(block: Block, i: number, gap: boolean) {
    const u = unitIndex(blocks, block.order);
    return (
      <div key={block.order} id={`exercise-${block.order}`} className={cn("scroll-mt-4", gap && "md:col-span-2")}>
        {gap && (
          <button
            type="button"
            onClick={() => (setInsertAt(u), setPicking(true))}
            className="text-muted-foreground hover:text-foreground -mt-2 mb-2 flex h-8 w-full items-center gap-2 text-xs font-semibold"
            aria-label={`Add an exercise before ${block.exercise.name}`}
          >
            <span className="bg-foreground/15 h-px flex-1" />
            <Plus className="size-4" aria-hidden /> Add here
            <span className="bg-foreground/15 h-px flex-1" />
          </button>
        )}
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
          onDoNext={canDoNext(block) ? () => doNext(block.order) : undefined}
          onMoveUp={u > 0 ? () => moveBy(block.order, -1) : undefined}
          onMoveDown={u < units.length - 1 ? () => moveBy(block.order, 1) : undefined}
          onReorder={() => setReordering(true)}
          onAddAfter={() => (setInsertAt(u + 1), setPicking(true))}
          onAddSet={() => w.addSet(block.order)}
          onRemoveSet={(id) => removeSet(block.order, id)}
          onChangeSet={(id, patch) => w.patchSet(block.order, id, patch)}
          onCommitSet={(id) => w.commitSet(block.order, id)}
          onCycleType={(id) => w.cycleType(block.order, id)}
          onSetType={(id, type) => w.setSetType(block.order, id, type)}
          onDuplicateSet={(id) => w.duplicateSet(block.order, id)}
          onAddDropSet={(id, weight) => w.addDropSet(block.order, id, weight)}
          collapsed={collapsedCard(block)}
          onToggleCollapse={view === "list" ? () => setOpenCards((m) => new Map(m).set(block.order, collapsedCard(block))) : undefined}
          onToggleDone={(id) => {
            setFocus(block.order);
            return w.toggleDone(block.order, id);
          }}
          effortScale={w.effortScale}
          effortAskId={w.effortAsk?.order === block.order ? w.effortAsk.id : null}
          onEffort={(id, rpe) => w.setEffort(block.order, id, rpe)}
          onSkipEffort={w.dismissEffort}
          onNote={() => setNoteFor(block.order)}
          onToggleUnilateral={() => w.setUnilateral(block.order, !block.unilateral)}
          onWarmups={() => setWarmupFor(block.order)}
          onHold={() => setHoldFor(block.order)}
        />
      </div>
    );
  }

  const logLabel = !focus ? "Add exercise" : nextSet ? "Log Set" : after != null ? "Next exercise" : "Finish workout";
  const shown = view === "focus" && focus ? [focus] : blocks;
  const states = segmentStates(blocks, focusOrder);
  const units = exerciseUnits(blocks);
  const focusMode = prefs.focus && !!focus;
  const afterName = after != null ? (blocks.find((b) => b.order === after)?.exercise.name ?? null) : null;
  const oneHanded = prefs.oneHanded && !focusMode && !!focus && !!nextSet;

  return (
    <KeypadProvider>
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
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="icon" aria-label="Logger display options" onClick={() => setOptions(true)}>
            <SlidersHorizontal />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 font-semibold"
            onClick={() => setConfirmDiscard(true)}
            data-testid="discard-button"
          >
            Discard
          </Button>
          <Button onClick={() => (undone > 0 ? setConfirmFinish(true) : finish())} data-testid="finish-button">
            <Flag /> Finish
          </Button>
        </div>
      </header>

      {focusMode && (
        <Button variant="secondary" className="self-center" onClick={() => setLoggerPref("focus", false)}>
          <Minimize2 /> Exit focus mode
        </Button>
      )}

      {/* Galaxy Z Fold8 Dual-Pane Station */}
      {focusMode && focus && (
        <div className="flex flex-col md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <div className="w-full">
            <FocusView
              block={focus}
              set={nextSet}
              upNext={afterName}
              onChange={(patch) => nextSet && w.patchSet(focus.order, nextSet.id, patch)}
              onCommit={() => nextSet && w.commitSet(focus.order, nextSet.id)}
              effort={
                w.effortAsk && w.effortAsk.order === focus.order
                  ? {
                      scale: w.effortScale,
                      onPick: (rpe) => w.effortAsk && w.setEffort(w.effortAsk.order, w.effortAsk.id, rpe),
                      onSkip: w.dismissEffort,
                    }
                  : null
              }
            />
          </div>
          {/* Dual-Pane Right Rail: Routine Overview & Up Next Checklist */}
          <div className="hidden md:flex flex-col gap-3 rounded-2xl bg-card p-4 border border-border">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Session Checklist</h2>
            <div className="flex flex-col gap-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
              {blocks.map((b) => (
                <div
                  key={b.order}
                  onClick={() => jumpTo(b.order)}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors",
                    b.order === focus.order ? "border-primary bg-primary/10 text-primary-text font-bold" : "border-border/60 hover:bg-muted/50"
                  )}
                >
                  <span className="truncate text-sm">{b.exercise.name}</span>
                  <span className="num text-xs text-muted-foreground">
                    {b.sets.filter((s) => s.done).length}/{b.sets.length} sets
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Rest countdown alerts</span>
              <span className="text-primary-text font-semibold">{prefs.sounds ? "Sound & Haptic" : "Silent"}</span>
            </div>
          </div>
        </div>
      )}

      {!focusMode && blocks.length > 0 && (
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
          {units.length > 1 && (
            <button
              type="button"
              onClick={() => setReordering(true)}
              aria-label="Reorder exercises"
              className="bg-secondary text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg"
            >
              <ArrowUpDown className="size-4" />
            </button>
          )}
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

      <RestAlertHint />

      {!focusMode && blocks.some((b) => b.sets.length > 0) && <GestureHint />}

      {!focusMode && (() => {
        const suggested = blocks.filter((b) => adjustmentFor(b));
        if (!suggested.length) return null;
        return (
          <div className="border-ai/40 bg-secondary flex flex-col gap-2 rounded-lg border p-3 text-sm" data-testid="workout-adjustments">
            <p className="flex items-center gap-2 font-semibold">
              <Sparkles className="text-ai size-4" /> Claude suggests changes for today
            </p>
            <div className="flex flex-wrap gap-2">
              {suggested.map((b) => (
                <Button key={b.order} size="sm" variant="outline" onClick={() => setProgressionFor(b.order)}>
                  {b.exercise.name}
                </Button>
              ))}
            </div>
          </div>
        );
      })()}

      {!focusMode && view === "focus" && (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:gap-6 md:items-start">
          <div className="md:col-span-3 flex flex-col gap-4">
            {shown.map((block, i) => renderExerciseBlock(block, i, false))}
          </div>
          <div className="md:col-span-2">
            <UnfoldedWorkoutNavigator
              blocks={blocks}
              focusOrder={focusOrder}
              onJump={jumpTo}
              onAdd={() => (setInsertAt(null), setPicking(true))}
            />
          </div>
        </div>
      )}

      {!focusMode && view === "list" && (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 md:items-start">
          {shown.map((block, i) => {
            const u = unitIndex(blocks, block.order);
            const gap = i > 0 && unitIndex(blocks, shown[i - 1].order) !== u;
            return renderExerciseBlock(block, i, gap);
          })}
          <Button
            size="lg"
            variant="outline"
            onClick={() => (setInsertAt(null), setPicking(true))}
            className="md:col-span-2"
          >
            <Plus /> Add exercise
          </Button>
        </div>
      )}

      {!focusMode && view === "focus" && (
        <Button size="lg" variant="outline" onClick={() => (setInsertAt(null), setPicking(true))}>
          <Plus /> Add exercise
        </Button>
      )}

      {blocks.length === 0 && (
        <p className="text-muted-foreground text-center text-sm">
          Add your first exercise. Last time&apos;s numbers show up automatically.
        </p>
      )}

      <button
        type="button"
        className="text-destructive mx-auto py-2 text-sm font-semibold"
        onClick={() => setConfirmDiscard(true)}
        data-testid="bottom-discard-button"
      >
        Discard workout
      </button>
      {/* Room for the Log Set bar (and the one-handed controls above it) */}
      <div className={oneHanded ? "h-52" : "h-20"} aria-hidden />

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
            {added && !nudge && (
              <div
                role="status"
                className={cn(
                  "glass-strong absolute right-3 flex items-center gap-2 rounded-full py-1 pr-1 pl-4 text-sm font-semibold",
                  focusAdjustment ? "-top-28" : "-top-14",
                )}
                data-testid="added-toast"
              >
                <span className="max-w-40 truncate">Added {added.name}</span>
                <button
                  type="button"
                  onClick={() => doNext(added.order)}
                  className="bg-primary text-primary-foreground flex h-9 items-center gap-1.5 rounded-full px-3"
                >
                  <ArrowUpToLine className="size-4" aria-hidden /> Do next
                </button>
              </div>
            )}
            {nudge && (
              <p role="status" className="glass-strong absolute -top-12 right-3 rounded-full px-4 py-2 text-sm font-semibold">
                {nudge}
              </p>
            )}
            {removed && !nudge && (
              <div role="status" className="glass-strong absolute -top-14 left-3 flex items-center gap-2 rounded-full py-1 pr-1 pl-4 text-sm font-semibold">
                Set deleted
                <button type="button" onClick={undoRemove} className="bg-primary text-primary-foreground flex h-9 items-center gap-1.5 rounded-full px-3">
                  <Undo2 className="size-4" aria-hidden /> Undo
                </button>
              </div>
            )}
            {oneHanded && focus && nextSet && (
              <div className="glass-strong mb-2 flex flex-col gap-1.5 rounded-2xl p-2" data-testid="one-handed">
                <p className="truncate px-1 text-sm">
                  <span className="font-semibold">{focus.exercise.name}</span>
                  <span className="text-muted-foreground"> · {setTitle(focus, nextSet)}</span>
                </p>
                <CurrentSetControls
                  block={focus}
                  set={nextSet}
                  size="compact"
                  onChange={(patch) => w.patchSet(focus.order, nextSet.id, patch)}
                  onCommit={() => w.commitSet(focus.order, nextSet.id)}
                />
              </div>
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
              <VoiceLogButton w={w} current={focusOrder} onLogged={(order) => setFocus(focusAfterLog(order, w.blocksNow()))} />
              <Button size="lg" className="h-14 flex-1 text-lg" onClick={logSet} data-testid="log-set">
                {logLabel === "Next exercise" && <ChevronRight />}
                {logLabel}
              </Button>
            </div>
          </div>,
          slot,
        )}

      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={addPicked} />
      <ReorderSheet open={reordering} onOpenChange={setReordering} blocks={blocks} current={workingOn(blocks, focusOrder)} onReorder={reorder} />
      <ExerciseDetail exercise={info} onOpenChange={(o) => !o && onInfo(null)} />
      <ExerciseDetail exercise={chartFor} onOpenChange={(o) => !o && setChartFor(null)} showChart />
      <PlateCalculator
        open={plates.open}
        onOpenChange={(open) => setPlates((p) => ({ ...p, open }))}
        initialWeight={plates.weight}
        onEditWeights={() => setEquipment(true)}
        kit={kit}
      />
      <EquipmentSheet open={equipment} onOpenChange={setEquipment} kitId={kit.id} />
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
      {(() => {
        const b = blocks.find((x) => x.order === noteFor);
        return (
          <NotesSheet
            open={!!b}
            onOpenChange={(o) => !o && setNoteFor(null)}
            notes={b?.note ?? null}
            onSave={(t) => b && w.setNote(b.order, t)}
            title="Exercise note"
            description={`Shown on ${b?.exercise.name ?? "this exercise"} every time you log it.`}
            placeholder="e.g. Seat on 4, pins on 12. Narrow grip."
          />
        );
      })()}
      {(() => {
        const b = blocks.find((x) => x.order === warmupFor);
        const { bar, plates: owned } = ownedPlates(profile, unit);
        // Today's working weight: what's typed on the first working set, else the suggestion, else last time.
        const firstWork = b?.sets.find((s) => s.type === "normal" || s.type === "failure");
        const prevWork = b?.previous.find((p) => p.set_type === "normal");
        const working =
          Number(firstWork?.weight) ||
          b?.suggestion?.weight ||
          (prevWork ? Math.round((unit === "imperial" ? kgToLb(prevWork.weight) : prevWork.weight) * 2) / 2 : null);
        return (
          <WarmupSheet
            open={!!b}
            onOpenChange={(o) => !o && setWarmupFor(null)}
            exerciseName={b?.exercise.name ?? ""}
            working={working || null}
            unitLabel={unit === "imperial" ? "lb" : "kg"}
            plateLoaded={!!b && PLATE_LOADED.includes(b.exercise.equipment)}
            bar={bar}
            plates={owned}
            step={weightStep(unit, false)}
            onAdd={(sets) => b && w.addWarmups(b.order, sets)}
          />
        );
      })()}
      {(() => {
        const b = blocks.find((x) => x.order === holdFor);
        return (
          <HoldTimer
            open={!!b}
            onOpenChange={(o) => !o && setHoldFor(null)}
            exerciseName={b?.exercise.name ?? ""}
            targetSeconds={b?.repTarget ? parseDuration(b.repTarget.split("-")[0]) : null}
            onLog={(sec) => {
              if (!b) return;
              tap();
              setFocus(b.order);
              w.logHold(b.order, sec);
            }}
          />
        );
      })()}
      <SwapSheet
        exercise={blocks.find((b) => b.order === swapFor)?.exercise ?? null}
        onOpenChange={(o) => !o && setSwapFor(null)}
        onSwap={(e) => swapFor != null && w.swapExercise(swapFor, e)}
        kitName={kit.name}
        allowed={(e) => kitAllows(e, kit)}
        inWorkout={new Set(blocks.map((b) => b.exercise.id))}
        onMissing={(e) => markMissing(kit.id, e.id).catch(() => {})}
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
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent data-testid="discard-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Discard workout?</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard this workout? All logged sets will be deleted and nothing will be saved to your history.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-3">
            <Button
              variant="destructive"
              size="lg"
              onClick={async () => {
                setConfirmDiscard(false);
                await w.discard();
                router.push("/");
              }}
              data-testid="confirm-discard"
            >
              Yes, discard workout
            </Button>
            <Button variant="outline" size="lg" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <LoggerOptions open={options} onOpenChange={setOptions} />
    </div>
    </KeypadProvider>
  );
}

/** A DOM node rendered by the app shell, found after mount. */
type StartTab = "find" | "planned" | "instant" | "home";
const TAB_KEY = "ironlog.workout.tab";
const START_TABS: { key: StartTab; label: string }[] = [
  { key: "find", label: "Find" },
  { key: "planned", label: "Planned" },
  { key: "instant", label: "Instant" },
  { key: "home", label: "Home" },
];

function savedTab(): StartTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return t === "find" || t === "instant" || t === "home" ? t : "planned";
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
      <div className="bg-secondary grid grid-cols-4 gap-1 rounded-xl p-1" role="tablist" aria-label="Workout">
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
      {tab === "home" && <HomeTab busy={busy} onStart={(create) => wrap(() => onStartWith(create))} />}
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
    <p className="text-muted-foreground num text-sm">{formatClock((now - new Date(since).getTime()) / 1000)}</p>
  );
}

const REST_ALERT_DISMISSED = "ironlog:rest-alert-dismissed";

/**
 * Rest alerts on a locked phone need notifications (and, on Android 14+,
 * exact alarms). Explain that here, in the app, before Android asks.
 */
function RestAlertHint() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof restAlertStatus>>>("n/a");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(REST_ALERT_DISMISSED) === "1";
    } catch {}
    restAlertStatus().then((s) => live && setStatus(dismissed && s === "ask" ? "n/a" : s));
    return () => {
      live = false;
    };
  }, []);
  if (status !== "ask" && status !== "late") return null;

  const notNow = () => {
    try {
      localStorage.setItem(REST_ALERT_DISMISSED, "1");
    } catch {}
    setStatus("n/a");
  };

  return (
    <div className="bg-secondary flex flex-col gap-2 rounded-lg p-3 text-sm" data-testid="rest-alert-hint">
      {status === "ask" ? (
        <>
          <p className="font-semibold">Rest alerts when your phone is locked</p>
          <p className="text-muted-foreground">
            When your rest is over, Ironlog can buzz you with a notification even if the screen is off. It only uses notifications for the rest
            timer and reminders you turn on. Android will ask you to allow notifications next.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await requestNotifications();
                let next = await restAlertStatus();
                if (next === "late") {
                  await openExactAlarmSettings();
                  next = await restAlertStatus();
                }
                setStatus(next);
                setBusy(false);
              }}
            >
              Continue
            </Button>
            <Button size="sm" variant="ghost" onClick={notNow}>
              Not now
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <p className="flex-1">Rest alerts may arrive late while the phone is locked. Allowing exact alarms fixes that.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await openExactAlarmSettings();
              setStatus(await restAlertStatus());
            }}
          >
            Allow
          </Button>
        </div>
      )}
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

/** Companion sidebar for unfolded foldables (> 600dp) during focus/one-exercise mode. */
function UnfoldedWorkoutNavigator({
  blocks,
  focusOrder,
  onJump,
  onAdd,
}: {
  blocks: Block[];
  focusOrder: number | null;
  onJump: (order: number) => void;
  onAdd: () => void;
}) {
  return (
    <aside className="glass hidden md:flex md:flex-col gap-3 rounded-3xl p-4 sticky top-4" aria-label="Workout overview">
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Session Exercises</h3>
        <span className="num text-xs font-semibold text-muted-foreground">
          {blocks.filter((b) => b.sets.every((s) => s.done)).length} / {blocks.length} done
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {blocks.map((b) => {
          const isCurrent = b.order === focusOrder;
          const doneSets = b.sets.filter((s) => s.done).length;
          const totalSets = b.sets.length;
          const allDone = totalSets > 0 && doneSets === totalSets;
          return (
            <li key={b.order}>
              <button
                type="button"
                onClick={() => onJump(b.order)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                  isCurrent
                    ? "bg-primary/20 text-primary-text border border-primary/30 font-bold shadow-sm"
                    : allDone
                    ? "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                    : "bg-secondary text-foreground hover:bg-secondary/80 font-medium",
                )}
              >
                <div className="min-w-0 flex-1 truncate">
                  <p className="truncate text-sm">{b.exercise.name}</p>
                  <p className="text-xs text-muted-foreground num">
                    {b.supersetGroup ? `Superset ${b.supersetGroup} · ` : ""}
                    {doneSets} of {totalSets} sets
                  </p>
                </div>
                {allDone ? (
                  <Check className="size-4 text-success shrink-0" strokeWidth={3} />
                ) : isCurrent ? (
                  <span className="size-2 rounded-full bg-primary-text shrink-0 animate-pulse" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground/60 shrink-0" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <Button variant="outline" size="sm" onClick={onAdd} className="mt-1 w-full text-xs">
        <Plus className="size-3.5 mr-1.5" /> Add exercise
      </Button>
    </aside>
  );
}
