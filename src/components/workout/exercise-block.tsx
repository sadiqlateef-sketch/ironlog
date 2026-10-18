"use client";

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
  Clock,
  Dumbbell,
  Flame,
  Hourglass,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PlayCircle,
  Plus,
  Split,
  Timer,
  Trash2,
  Unlink,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { EffortPicker } from "@/components/workout/effort-picker";
import { SetRow } from "@/components/workout/set-row";
import { ActionSheet, type SheetAction } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { toDisplay, type Block, type UiSet } from "@/hooks/use-workout";
import { PLATE_LOADED } from "@/lib/labels";
import { formatWeight } from "@/lib/units";
import { describeTimedSet, distanceUnit, formatDuration, pace, parseDuration, toDistanceDisplay, toMetres } from "@/lib/cardio";
import { bestE1rm, formatClock, parseNumber, workingSetNumbers } from "@/lib/workout-logic";
import { calculatePlates, ownedPlates } from "@/lib/plates";
import { effortBadge, matchPrevious } from "@/lib/set-logic";
import type { EffortScale } from "@/types/database";
import { cn } from "@/lib/utils";

export function ExerciseBlock({
  block,
  isLast,
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
  effortScale,
  effortAskId,
  onEffort,
  onSkipEffort,
  onNote,
  onToggleUnilateral,
  onWarmups,
  onHold,
}: {
  block: Block;
  isLast: boolean;
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
  effortScale: EffortScale;
  /** The set just finished, waiting for "how hard was it?". */
  effortAskId: string | null;
  onEffort: (id: string, rpe: number) => void;
  onSkipEffort: () => void;
  onNote: () => void;
  onToggleUnilateral: () => void;
  onWarmups: () => void;
  /** Timed holds: open the hold stopwatch. */
  onHold: () => void;
}) {
  const { unit, profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
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
    if (block.suggestion && (set.type === "normal" || set.type === "failure")) return String(block.suggestion.weight);
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

  const plates = () => {
    const w = nextUndone ? parseNumber(nextUndone.weight) : null;
    const prevIdx = nextUndone ? block.sets.indexOf(nextUndone) : -1;
    const prev = prevOf[prevIdx];
    onPlates(w ?? (prev ? parseNumber(toDisplay(prev.weight, unit)) : null));
  };

  const actions: SheetAction[] = [
    ...(onDoNext ? [{ label: "Do next", icon: ArrowUpToLine, onSelect: onDoNext }] : []),
    ...(onMoveUp ? [{ label: "Move up", icon: ArrowUp, onSelect: onMoveUp }] : []),
    ...(onMoveDown ? [{ label: "Move down", icon: ArrowDown, onSelect: onMoveDown }] : []),
    { label: "Reorder exercises", icon: ArrowUpDown, onSelect: onReorder },
    { label: "Add exercise after this", icon: ListPlus, onSelect: onAddAfter },
    ...(block.supersetGroup != null
      ? [{ label: "Remove from superset", icon: Unlink, onSelect: onToggleSuperset }]
      : !isLast
        ? [{ label: "Add a superset", icon: Link2, onSelect: onToggleSuperset }]
        : []),
    { label: "Swap exercise", icon: ArrowLeftRight, onSelect: onSwap },
    ...(tracking === "weight_reps" ? [{ label: "Warm-up sets", icon: Flame, onSelect: onWarmups }] : []),
    { label: block.note ? "Edit exercise note" : "Add exercise note", icon: Pin, onSelect: onNote },
    ...(tracking === "weight_reps"
      ? [{ label: sides ? "Log both sides together" : "Log left and right separately", icon: Split, onSelect: onToggleUnilateral }]
      : []),
    ...(plateLoaded ? [{ label: "Plate calculator", icon: Calculator, onSelect: plates }] : []),
    { label: "Edit available weights", icon: Dumbbell, onSelect: onEquipment },
    { label: "Video & how-to", icon: PlayCircle, onSelect: onShowInfo },
    { label: "Edit sets", icon: Pencil, onSelect: () => setEditing(true) },
    { label: "Remove exercise", icon: Trash2, onSelect: onRemove, destructive: true },
  ];

  return (
    <section
      className={cn(
        "glass flex flex-col gap-3 rounded-2xl p-3",
        block.supersetGroup != null && "border-l-set-drop border-l-4",
      )}
      data-testid="exercise-block"
    >
      <header className="flex items-start gap-1">
        <button type="button" onClick={onShowInfo} className="min-w-0 flex-1 px-1 text-left">
          {block.supersetGroup != null && <p className="text-set-drop text-xs font-bold tracking-wide">SUPERSET</p>}
          <h2 className={cn("font-bold tracking-tight", focused ? "text-2xl leading-tight" : "truncate text-xl")}>
            {block.exercise.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {timed && block.previous.length ? (
              <>Last time: {describeTimedSet(block.previous.at(-1)!, unit, (kg) => formatWeight(kg, unit)) ?? "–"}</>
            ) : !timed && bestPrev ? (
              <>
                Last time: {formatWeight(bestPrev.weight, unit)} × {bestPrev.reps}
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
              Try {block.suggestion.weight} {u} today · {block.suggestion.why.charAt(0).toLowerCase() + block.suggestion.why.slice(1)}
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
                className="bg-primary/20 text-primary-text flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
                data-testid="do-next"
              >
                <ArrowUpToLine className="size-4" aria-hidden /> Do next
              </button>
            )}
            {e1rm > 0 && !timed && (
              <div className="px-1 text-right" aria-label={`Estimated one rep max ${e1rm} ${u}`}>
                <p className="text-muted-foreground text-[11px] font-bold tracking-wider">EST. 1RM</p>
                <p className="text-primary-text font-mono text-xl font-extrabold">{e1rm}</p>
              </div>
            )}
          </div>
        )}
      </header>

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
          className="bg-secondary flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium"
          aria-label={`Rest timer ${formatClock(block.restSeconds)}. Tap to change.`}
        >
          <Clock className="size-4" /> Rest <span className="text-primary-text font-mono font-bold">{formatClock(block.restSeconds)}</span>
        </button>
        {tracking === "time" ? (
          <button type="button" onClick={onHold} className="bg-secondary flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium">
            <Hourglass className="size-4" /> Hold
          </button>
        ) : (
          <button type="button" onClick={onInterval} className="bg-secondary flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium">
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

      {sides ? (
        <div className="text-muted-foreground grid grid-cols-[2.5rem_4.5rem_1fr_1fr_3rem] gap-2 px-1 text-center text-[11px] font-semibold tracking-wide uppercase">
          <span>Set</span>
          <span>{u}</span>
          <span>Left</span>
          <span>Right</span>
          <span />
        </div>
      ) : (
        <div className="text-muted-foreground grid grid-cols-[2.5rem_1fr_4.5rem_4rem_3rem] gap-2 px-1 text-center text-[11px] font-semibold tracking-wide uppercase">
          <span>Set</span>
          <span>Last time</span>
          <span>{tracking === "distance_time" ? distanceUnit(unit) : tracking === "time" ? `+${u}` : u}</span>
          <span>{timed ? "Time" : "Reps"}</span>
          <span />
        </div>
      )}

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
            current={set === nextUndone}
            editing={editing}
            onChange={(patch) => onChangeSet(set.id, patch)}
            onCommit={() => onCommitSet(set.id)}
            onCycleType={() => onCycleType(set.id)}
            onToggleDone={() => onToggleDone(set.id)}
            onRemove={() => onRemoveSet(set.id)}
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
        className={cn(
          "hover:bg-accent grid items-center gap-2 rounded-lg px-1 py-1 text-center",
          sides ? "grid-cols-[2.5rem_4.5rem_1fr_1fr_3rem]" : "grid-cols-[2.5rem_1fr_4.5rem_4rem_3rem]",
        )}
      >
        <Plus className="text-muted-foreground mx-auto size-5" />
        {!sides && (
          <span aria-hidden className="text-muted-foreground/70 font-mono text-sm">
            {lastPrev ? prevText(lastPrev) : ""}
          </span>
        )}
        <span aria-hidden className="text-foreground/35 font-mono text-xl font-extrabold">{(tracking === "distance_time" ? last?.distance : last?.weight) || ""}</span>
        {sides && <span aria-hidden className="text-foreground/35 font-mono text-xl font-extrabold">{last?.repsLeft || last?.reps || ""}</span>}
        <span aria-hidden className="text-foreground/35 font-mono text-xl font-extrabold">{(timed ? last?.time : last?.reps) || ""}</span>
        <span className="text-muted-foreground text-xs font-semibold">Add</span>
      </button>

      <ActionSheet open={menu} onOpenChange={setMenu} title={block.exercise.name} actions={actions} />
    </section>
  );
}
