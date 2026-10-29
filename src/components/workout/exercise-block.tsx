"use client";

import { PlateStackVisualizer } from "@/components/plate-stack-visualizer";
import { AnatomyTargetOrb } from "@/components/anatomy-target-orb";

import { useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  Calculator,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Dumbbell,
  Flame,
  Hourglass,
  Layers,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  PersonStanding,
  Pin,
  PlayCircle,
  Plus,
  Sparkles,
  Split,
  StickyNote,
  Timer,
  Trash2,
  Unlink,
} from "lucide-react";
import type { EffortScale, SetType } from "@/types/database";
import { useAuth } from "@/components/providers/auth-provider";
import { ExerciseAnimation } from "@/components/exercise-animation";
import { EffortPicker } from "@/components/workout/effort-picker";
import { LastTime, ROW_GRID, SIDES_GRID, SetRow } from "@/components/workout/set-row";
import { ActionSheet, type SheetAction } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { toDisplay, type Block, type UiSet } from "@/hooks/use-workout";
import { PLATE_LOADED } from "@/lib/labels";
import { formatWeight } from "@/lib/units";
import { dropWeight } from "@/lib/keypad";
import { useLoggerPrefs, weightStep } from "@/lib/logger-prefs";
import { describeTimedSet, distanceUnit, formatDuration, pace, parseDuration, toDistanceDisplay, toMetres } from "@/lib/cardio";
import { bestE1rm, formatClock, groupName, parseNumber, workingSetNumbers } from "@/lib/workout-logic";
import { calculatePlates, ownedPlates } from "@/lib/plates";
import { effortBadge, matchPrevious } from "@/lib/set-logic";
import { cn } from "@/lib/utils";

const MUSCLE_ACCENTS: Record<string, string> = {
  chest: "from-rose-500/80 to-rose-600/40",
  upper_back: "from-sky-500/80 to-sky-600/40",
  lats: "from-cyan-500/80 to-cyan-600/40",
  lower_back: "from-indigo-500/80 to-indigo-600/40",
  front_delts: "from-amber-500/80 to-amber-600/40",
  side_delts: "from-amber-500/80 to-amber-600/40",
  rear_delts: "from-amber-500/80 to-amber-600/40",
  biceps: "from-emerald-500/80 to-emerald-600/40",
  triceps: "from-teal-500/80 to-teal-600/40",
  quads: "from-yellow-500/80 to-yellow-600/40",
  hamstrings: "from-orange-500/80 to-orange-600/40",
  glutes: "from-fuchsia-500/80 to-fuchsia-600/40",
  abs: "from-violet-500/80 to-violet-600/40",
  calves: "from-lime-500/80 to-lime-600/40",
};

export function ExerciseBlock({
  block,
  isLast,
  groupSize: sizeOfGroup,
  nextIsGrouped,
  focused,
  onShowInfo,
  onChart,
  onSwap,
  onRest,
  onInterval,
  onEquipment,
  onPlates,
  onToggleSuperset,
  onRemove,
  onDoNext,
  onMoveUp,
  onMoveDown,
  onReorder,
  onAddAfter,
  onAddSet,
  onRemoveSet,
  onChangeSet,
  onCommitSet,
  onCycleType,
  onToggleDone,
  onSetType,
  onDuplicateSet,
  onAddDropSet,
  collapsed,
  onToggleCollapse,
  effortScale,
  effortAskId,
  onEffort,
  onSkipEffort,
  onNote,
  onSetNote,
  onToggleUnilateral,
  onWarmups,
  onHold,
  onFormCoach,
}: {
  block: Block;
  isLast: boolean;
  /** How many exercises are linked with this one (itself included); 3 or more is a circuit. */
  groupSize: number;
  /** The exercise after this one is already in a group, so linking joins it. */
  nextIsGrouped: boolean;
  /** Focus view: one exercise fills the screen, so the header is bigger. */
  focused?: boolean;
  onShowInfo: () => void;
  onChart: () => void;
  onSwap: () => void;
  onRest: () => void;
  onInterval: () => void;
  onEquipment: () => void;
  onPlates: (weight: number | null) => void;
  onToggleSuperset: () => void;
  onRemove: () => void;
  /** Move this exercise up to be done next. Leave out when it already is. */
  onDoNext?: () => void;
  /** Leave out at the top / bottom. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Open the whole-workout reorder list. */
  onReorder: () => void;
  /** Pick an exercise to go straight after this one. */
  onAddAfter: () => void;
  onAddSet: () => void;
  onRemoveSet: (id: string) => void;
  onChangeSet: (id: string, patch: Partial<UiSet>) => void;
  onCommitSet: (id: string) => void;
  onCycleType: (id: string) => void;
  onToggleDone: (id: string) => Promise<boolean>;
  onSetType: (id: string, type: SetType) => void;
  onDuplicateSet: (id: string) => void;
  /** Weight in the user's unit, already filled in. */
  onAddDropSet: (id: string, weight: string) => void;
  /** All view: finished exercises shrink to one line. */
  collapsed?: boolean;
  /** Leave out where cards can't collapse (the One view). */
  onToggleCollapse?: () => void;
  effortScale: EffortScale;
  /** The set just finished, waiting for "how hard was it?". */
  effortAskId: string | null;
  onEffort: (id: string, rpe: number) => void;
  onSkipEffort: () => void;
  onNote: () => void;
  onSetNote: (setId: string) => void;
  onToggleUnilateral: () => void;
  onWarmups: () => void;
  /** Timed holds: open the hold stopwatch. */
  onHold: () => void;
  /** AI Form Coach & Biomechanics guidance */
  onFormCoach?: () => void;
}) {
  const { unit, profile } = useAuth();
  const prefs = useLoggerPrefs();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [demo, setDemo] = useState(false);
  /** The set whose long-press menu is open. */
  const [setMenuFor, setSetMenuFor] = useState<string | null>(null);
  const numbers = workingSetNumbers(block.sets.map((s) => s.type));
  const prevOf = matchPrevious(block.sets.map((s) => s.type), block.previous);
  const u = unit === "imperial" ? "lb" : "kg";
  const plateLoaded = PLATE_LOADED.includes(block.exercise.equipment);
  const nextUndone = block.sets.find((s) => !s.done);
  const last = block.sets.at(-1);
  const lastPrev = block.previous.at(-1);
  const tracking = block.exercise.tracking ?? "weight_reps";
  const timed = tracking !== "weight_reps";
  const sides = block.unilateral && tracking === "weight_reps";
  const grid = sides ? SIDES_GRID : ROW_GRID;
  const lastRun = tracking === "distance_time" ? block.sets.filter((x) => x.done).at(-1) : undefined;
  const todayPace = lastRun ? pace(parseDuration(lastRun.time), toMetres(parseNumber(lastRun.distance) ?? 0, unit), unit) : null;
  /** "Last time" for one set, short enough for its column. */
  const prevText = (p: (typeof block.previous)[number] | undefined) => {
    if (!p) return "–";
    if (tracking === "distance_time") return [p.distance_m ? toDistanceDisplay(p.distance_m, unit) : null, p.duration_seconds ? formatDuration(p.duration_seconds) : null].filter(Boolean).join("/") || "–";
    if (tracking === "time") return p.duration_seconds ? formatDuration(p.duration_seconds) : "–";
    const reps = p.reps_left != null && p.reps_right != null ? `${p.reps_left}/${p.reps_right}` : p.reps;
    return `${toDisplay(p.weight, unit) || "0"}×${reps}`;
  };
  // Warm-ups on a loaded bar show the plates per side instead of last time.
  const warmupPlates = (set: UiSet) => {
    const w = parseNumber(set.weight);
    if (!plateLoaded || set.type !== "warmup" || !w) return null;
    const { bar, plates } = ownedPlates(profile, unit);
    const r = calculatePlates(w, bar, plates);
    return r.remainder > 0 ? null : r.perSide.length ? r.perSide.join("+") : "Bar";
  };
  // Today's suggested weight fills working sets; anything else repeats last time.
  const weightHint = (i: number) => {
    const set = block.sets[i];
    if (block.suggestion && (set.type === "normal" || set.type === "failure" || set.type === "amrap")) return String(block.suggestion.weight);
    const prev = prevOf[i];
    return prev ? toDisplay(prev.weight, unit) || "0" : "0";
  };

  // Live estimated 1RM: today's best logged set, else your best from last time.
  const today = bestE1rm(
    block.sets.filter((s) => s.done && s.type !== "warmup").map((s) => ({ weight: parseNumber(s.weight) ?? 0, reps: parseNumber(s.reps) ?? 0 })),
  );
  const before = bestE1rm(
    block.previous.filter((p) => p.set_type !== "warmup").map((p) => ({ weight: parseNumber(toDisplay(p.weight, unit)) ?? 0, reps: p.reps })),
  );
  const e1rm = Math.round(today || before);
  const bestPrev = block.previous
    .filter((p) => p.set_type !== "warmup")
    .reduce<(typeof block.previous)[number] | null>((b, p) => (!b || p.weight * (1 + p.reps / 30) > b.weight * (1 + b.reps / 30) ? p : b), null);

  // Under the sets of a barbell lift: what to load for the set you're about to do.
  const plateLine = (() => {
    if (!plateLoaded || tracking !== "weight_reps" || !nextUndone) return null;
    const w = parseNumber(nextUndone.weight) ?? parseNumber(weightHint(block.sets.indexOf(nextUndone)));
    if (!w) return null;
    const { bar, plates: owned } = ownedPlates(profile, unit);
    const r = calculatePlates(w, bar, owned);
    if (!r.perSide.length) return "Bar only";
    const side = `${r.perSide.join("+")} /side`;
    return r.remainder > 0 ? `≈ ${r.achieved} ${u}: ${side}` : side;
  })();

  const plates = () => {
    const w = nextUndone ? parseNumber(nextUndone.weight) : null;
    const prevIdx = nextUndone ? block.sets.indexOf(nextUndone) : -1;
    const prev = prevOf[prevIdx];
    onPlates(w ?? (prev ? parseNumber(toDisplay(prev.weight, unit)) : null));
  };

  const groupLabel = groupName(sizeOfGroup) ?? "Superset";
  const actions: SheetAction[] = [
    ...(onDoNext ? [{ label: "Do next", icon: ArrowUpToLine, onSelect: onDoNext }] : []),
    ...(onMoveUp ? [{ label: "Move up", icon: ArrowUp, onSelect: onMoveUp }] : []),
    ...(onMoveDown ? [{ label: "Move down", icon: ArrowDown, onSelect: onMoveDown }] : []),
    { label: "Reorder exercises", icon: ArrowUpDown, onSelect: onReorder },
    { label: "Add exercise after this", icon: ListPlus, onSelect: onAddAfter },
    ...(block.supersetGroup != null
      ? [{ label: `Remove from ${groupLabel.toLowerCase()}`, icon: Unlink, onSelect: onToggleSuperset }]
      : !isLast
        ? [{ label: nextIsGrouped ? "Join the next group" : "Add a superset", icon: Link2, onSelect: onToggleSuperset }]
        : []),
    { label: "Swap exercise", icon: ArrowLeftRight, onSelect: onSwap },
    ...(tracking === "weight_reps" ? [{ label: "Warm-up sets", icon: Flame, onSelect: onWarmups }] : []),
    { label: block.note ? "Edit exercise note" : "Add exercise note", icon: Pin, onSelect: onNote },
    ...(tracking === "weight_reps"
      ? [{ label: sides ? "Log both sides together" : "Log left and right separately", icon: Split, onSelect: onToggleUnilateral }]
      : []),
    ...(plateLoaded ? [{ label: "Plate calculator", icon: Calculator, onSelect: plates }] : []),
    { label: "Edit available weights", icon: Dumbbell, onSelect: onEquipment },
    { label: demo ? "Hide form demo" : "Show form demo", icon: PlayCircle, onSelect: () => setDemo((d) => !d) },
    ...(onFormCoach ? [{ label: "AI Form Coach & Tempo", icon: Sparkles, onSelect: onFormCoach }] : []),
    { label: "How-to & muscles", icon: PersonStanding, onSelect: onShowInfo },
    { label: "Edit sets", icon: Pencil, onSelect: () => setEditing(true) },
    { label: "Remove exercise", icon: Trash2, onSelect: onRemove, destructive: true },
  ];

  // Long-press menu for one set.
  const menuSet = block.sets.find((x) => x.id === setMenuFor) ?? null;
  const menuIdx = menuSet ? block.sets.indexOf(menuSet) : -1;
  const setActions: SheetAction[] = menuSet
    ? [
        { label: menuSet.note ? "Edit set note" : "Note on this set", icon: StickyNote, onSelect: () => onSetNote(menuSet.id) },
        { label: "Duplicate set", icon: Copy, onSelect: () => onDuplicateSet(menuSet.id) },
        menuSet.type === "warmup"
          ? { label: "Make it a working set", icon: Dumbbell, onSelect: () => onSetType(menuSet.id, "normal") }
          : { label: "Mark as warm-up", icon: Flame, onSelect: () => onSetType(menuSet.id, "warmup") },
        ...(tracking === "weight_reps"
          ? [
              {
                label: "Add drop set",
                icon: Layers,
                onSelect: () => {
                  const prev = prevOf[menuIdx];
                  const w = parseNumber(menuSet.weight) ?? (prev ? parseNumber(toDisplay(prev.weight, unit)) : null) ?? 0;
                  const d = dropWeight(w, weightStep(prefs, unit));
                  onAddDropSet(menuSet.id, d ? String(d) : "");
                },
              },
            ]
          : []),
        { label: "Delete set", icon: Trash2, onSelect: () => onRemoveSet(menuSet.id), destructive: true },
      ]
    : [];

  const doneSets = block.sets.filter((x) => x.done);
  const finished = block.sets.length > 0 && doneSets.length === block.sets.length;

  if (collapsed) {
    const best = !timed
      ? doneSets
          .filter((x) => x.type !== "warmup")
          .reduce<UiSet | null>((b, x) => {
            const e = (x2: UiSet) => (parseNumber(x2.weight) ?? 0) * (1 + (parseNumber(x2.reps) ?? 0) / 30);
            return !b || e(x) > e(b) ? x : b;
          }, null)
      : null;
    return (
      <section className="glass rounded-2xl" data-testid="exercise-block" data-collapsed>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={false}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
        >
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", finished ? "bg-success text-[#08200d]" : "bg-secondary text-muted-foreground")}>
            {finished ? <Check className="size-5" strokeWidth={3} aria-hidden /> : <span className="num text-sm font-bold">{doneSets.length}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{block.exercise.name}</span>
            <span className="num text-muted-foreground block truncate text-sm">
              {doneSets.length} of {block.sets.length} {block.sets.length === 1 ? "set" : "sets"}
              {best && (
                <>
                  {" "}· best <LastTime text={`${best.weight || 0} ${u}×${best.reps}`} />
                </>
              )}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground size-5 shrink-0" aria-hidden />
          <span className="sr-only">Show sets</span>
        </button>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "glass flex flex-col gap-3 rounded-2xl p-3 relative overflow-hidden transition-all duration-300",
        block.supersetGroup != null && "border-l-set-drop border-l-4",
      )}
      data-testid="exercise-block"
    >
      {block.supersetGroup == null && (
        <span
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b opacity-85",
            MUSCLE_ACCENTS[block.exercise.primary_muscle] ?? "from-primary/70 to-primary/30"
          )}
          aria-hidden
        />
      )}
      <header className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setDemo((d) => !d)}
          aria-label={demo ? "Hide form demo" : "Show form demo"}
          aria-expanded={demo}
          className={cn(
            "relative mt-0.5 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full",
            block.exercise.image_urls?.[0] ? "bg-white" : "bg-secondary",
            demo && "ring-primary ring-2",
          )}
        >
          {block.exercise.image_urls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.exercise.image_urls?.[0]} alt="" className="size-full object-cover" />
          ) : (
            <PersonStanding className="text-muted-foreground size-6" strokeWidth={1.5} />
          )}
          <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-black/75 text-white">
            <PlayCircle className="size-3.5" />
          </span>
        </button>
        <button type="button" onClick={onShowInfo} className="min-w-0 flex-1 px-1 text-left">
          {block.supersetGroup != null && <p className="text-set-drop text-xs font-bold tracking-wide uppercase">{groupLabel}</p>}
          <h2 className={cn("font-bold tracking-tight", focused ? "text-2xl leading-tight" : "truncate text-xl")}>
            {block.exercise.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {timed && block.previous.length ? (
              <>Last time: {describeTimedSet(block.previous.at(-1)!, unit, (kg) => formatWeight(kg, unit)) ?? "–"}</>
            ) : !timed && bestPrev ? (
              <>
                Last time: <span className="num font-semibold"><LastTime text={`${formatWeight(bestPrev.weight, unit)}×${bestPrev.reps}`} /></span>
              </>
            ) : (
              "First time logging this"
            )}
            {block.repTarget && (
              <>
                {" "}
                · Target {block.repTarget}
                {tracking === "time" ? " sec" : ""}
              </>
            )}
          </p>
          {block.targetNote && <p className="text-foreground/80 text-xs">{block.targetNote}</p>}
          {block.suggestion && block.sets.some((s) => !s.done && !s.weight && s.type !== "warmup") && (
            <p className="text-primary-text text-sm font-semibold" data-testid="suggested-weight">
              Try <span className="num">{block.suggestion.weight}</span> {u} today ·{" "}
              {block.suggestion.why.charAt(0).toLowerCase() + block.suggestion.why.slice(1)}
            </p>
          )}
          {todayPace && <p className="text-primary-text text-sm font-semibold">Pace {todayPace}</p>}
        </button>
        {(onDoNext || (e1rm > 0 && !timed)) && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {onDoNext && (
              <button
                type="button"
                onClick={onDoNext}
                className="bg-primary/20 text-primary-text flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
                data-testid="do-next"
              >
                <ArrowUpToLine className="size-4" aria-hidden /> Do next
              </button>
            )}
            {e1rm > 0 && !timed && (
              <div className="px-1 text-right" aria-label={`Estimated one rep max ${e1rm} ${u}`}>
                <p className="text-muted-foreground text-[11px] font-bold tracking-wider">EST. 1RM</p>
                <p className="num text-primary-text text-[22px] leading-tight font-bold">{e1rm.toLocaleString("en-US")}</p>
              </div>
            )}
          </div>
        )}
        {onToggleCollapse && (
          <Button variant="ghost" size="icon" aria-label="Collapse" aria-expanded onClick={onToggleCollapse} className="-mr-1 shrink-0">
            <ChevronUp />
          </Button>
        )}
      </header>

      {demo && (
        <div className="flex flex-col gap-1">
          <ExerciseAnimation exercise={block.exercise} compact />
          <button type="button" onClick={onShowInfo} className="text-primary-text self-start px-1 text-sm font-semibold">
            Full how-to
          </button>
        </div>
      )}

      {block.note && (
        <button
          type="button"
          onClick={onNote}
          className="bg-set-warmup/10 text-foreground/90 -mt-1 flex items-start gap-2 rounded-xl px-3 py-2 text-left text-sm"
          aria-label={`Exercise note: ${block.note}. Tap to edit.`}
          data-testid="exercise-note"
        >
          <Pin className="text-set-warmup mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 whitespace-pre-line">{block.note}</span>
        </button>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRest}
          className="bg-secondary flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium"
          aria-label={`Rest timer ${formatClock(block.restSeconds)}. Tap to change.`}
        >
          <Clock className="size-4" /> Rest <span className="num text-primary-text font-bold">{formatClock(block.restSeconds)}</span>
        </button>
        {tracking === "time" ? (
          <button type="button" onClick={onHold} className="bg-secondary flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium">
            <Hourglass className="size-4" /> Hold
          </button>
        ) : (
          <button type="button" onClick={onInterval} className="bg-secondary flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium">
            <Timer className="size-4" /> Interval
          </button>
        )}
        <div className="ml-auto flex">
          <Button variant="ghost" size="icon" aria-label="History and chart" onClick={onChart}>
            <ChartColumn />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Swap exercise" onClick={onSwap}>
            <ArrowLeftRight />
          </Button>
          <Button variant={editing ? "secondary" : "ghost"} size="icon" aria-label="More options" onClick={() => (editing ? setEditing(false) : setMenu(true))}>
            {editing ? <Check /> : <MoreHorizontal />}
          </Button>
        </div>
      </div>

      <div className={cn(grid, "text-muted-foreground px-1 text-center text-[11px] font-semibold tracking-wide uppercase")}>
        <span>Set</span>
        {sides ? (
          <>
            <span>{u}</span>
            <span>Left</span>
            <span>Right</span>
          </>
        ) : (
          <>
            <span>Last time</span>
            <span>{tracking === "distance_time" ? distanceUnit(unit) : tracking === "time" ? `+${u}` : u}</span>
            <span>{timed ? "Time" : "Reps"}</span>
          </>
        )}
        <span />
      </div>

      {block.sets.map((set, i) => {
        const prev = prevOf[i];
        const repHint = (side: number | null | undefined) => (prev ? String(side ?? prev.reps) : (block.repTarget?.split("-")[0] ?? "0"));
        return (
          <div key={set.id} className="flex flex-col gap-1">
          <SetRow
            set={set}
            workingNumber={numbers[i]}
            previousText={warmupPlates(set) ?? prevText(prev)}
            sides={sides}
            leftPlaceholder={set.reps || repHint(prev?.reps_left)}
            effort={effortBadge(set.rpe, effortScale)}
            tracking={tracking}
            timePlaceholder={prev?.duration_seconds ? formatDuration(prev.duration_seconds) : tracking === "time" ? (block.repTarget?.split("-")[0] ?? "0:00") : "0:00"}
            distancePlaceholder={prev?.distance_m ? toDistanceDisplay(prev.distance_m, unit) : "0"}
            weightPlaceholder={weightHint(i)}
            repPlaceholder={sides ? set.repsLeft || repHint(prev?.reps_right) : repHint(null)}
            weightUnit={u}
            distanceLabel={distanceUnit(unit)}
            current={set === nextUndone}
            editing={editing}
            onChange={(patch) => onChangeSet(set.id, patch)}
            onCommit={() => onCommitSet(set.id)}
            onCycleType={() => onCycleType(set.id)}
            onToggleDone={() => onToggleDone(set.id)}
            onRemove={() => onRemoveSet(set.id)}
            onLongPress={() => setSetMenuFor(set.id)}
          />
          {effortAskId === set.id && set.done && (
            <EffortPicker scale={effortScale} onPick={(rpe) => onEffort(set.id, rpe)} onSkip={onSkipEffort} />
          )}
          </div>
        );
      })}

      {/* Ghost row: what one more set would look like. Tap to add it. */}
      <button
        type="button"
        onClick={onAddSet}
        aria-label="Add set"
        className={cn(grid, "hover:bg-accent min-h-14 rounded-xl px-1 py-1 text-center")}
      >
        <Plus className="text-muted-foreground mx-auto size-6" />
        {!sides && (
          <span aria-hidden className="num text-muted-foreground/70 truncate text-sm">
            {lastPrev ? <LastTime text={prevText(lastPrev)} tight /> : ""}
          </span>
        )}
        <span aria-hidden className="num text-foreground/35 text-xl font-bold">{(tracking === "distance_time" ? last?.distance : last?.weight) || ""}</span>
        {sides && <span aria-hidden className="num text-foreground/35 text-xl font-bold">{last?.repsLeft || last?.reps || ""}</span>}
        <span aria-hidden className="num text-foreground/35 text-xl font-bold">{(timed ? last?.time : last?.reps) || ""}</span>
        <span className="text-muted-foreground text-xs font-semibold">Add</span>
      </button>
      {plateLine && (
        <div className="flex flex-col gap-1 px-1 py-1">
          <p className="text-primary-text text-sm font-semibold" data-testid="plate-line">
            Plates: {plateLine}
          </p>
          <PlateStackVisualizer
            targetWeight={parseNumber(nextUndone?.weight ?? "") ?? parseNumber(weightHint(block.sets.indexOf(nextUndone!))) ?? 0}
            barWeight={ownedPlates(profile, unit).bar}
            availablePlates={ownedPlates(profile, unit).plates}
            unit={unit}
            compact
          />
        </div>
      )}

      <ActionSheet open={menu} onOpenChange={setMenu} title={block.exercise.name} actions={actions} />
      <ActionSheet
        open={!!menuSet}
        onOpenChange={(o) => !o && setSetMenuFor(null)}
        title={menuSet ? `${block.exercise.name}, set ${menuIdx + 1}` : ""}
        actions={setActions}
      />
    </section>
  );
}
