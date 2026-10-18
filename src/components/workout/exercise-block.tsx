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
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Dumbbell,
  Flame,
  Layers,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Timer,
  Trash2,
  Unlink,
} from "lucide-react";
import type { SetType } from "@/types/database";
import { useAuth } from "@/components/providers/auth-provider";
import { LastTime, ROW_GRID, SetRow } from "@/components/workout/set-row";
import { ActionSheet, type SheetAction } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { toDisplay, type Block, type UiSet } from "@/hooks/use-workout";
import { PLATE_LOADED } from "@/lib/labels";
import { formatWeight } from "@/lib/units";
import { dropWeight } from "@/lib/keypad";
import { useLoggerPrefs, weightStep } from "@/lib/logger-prefs";
import { describeTimedSet, distanceUnit, formatDuration, pace, parseDuration, toDistanceDisplay, toMetres } from "@/lib/cardio";
import { bestE1rm, formatClock, parseNumber, workingSetNumbers } from "@/lib/workout-logic";
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
  onSetType,
  onDuplicateSet,
  onAddDropSet,
  collapsed,
  onToggleCollapse,
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
  onSetType: (id: string, type: SetType) => void;
  onDuplicateSet: (id: string) => void;
  /** Weight in the user's unit, already filled in. */
  onAddDropSet: (id: string, weight: string) => void;
  /** All view: finished exercises shrink to one line. */
  collapsed?: boolean;
  /** Leave out where cards can't collapse (the One view). */
  onToggleCollapse?: () => void;
}) {
  const { unit } = useAuth();
  const prefs = useLoggerPrefs();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  /** The set whose long-press menu is open. */
  const [setMenuFor, setSetMenuFor] = useState<string | null>(null);
  const numbers = workingSetNumbers(block.sets.map((s) => s.type));
  const u = unit === "imperial" ? "lb" : "kg";
  const plateLoaded = PLATE_LOADED.includes(block.exercise.equipment);
  const nextUndone = block.sets.find((s) => !s.done);
  const last = block.sets.at(-1);
  const lastPrev = block.previous.at(-1);
  const tracking = block.exercise.tracking ?? "weight_reps";
  const timed = tracking !== "weight_reps";
  const lastRun = tracking === "distance_time" ? block.sets.filter((x) => x.done).at(-1) : undefined;
  const todayPace = lastRun ? pace(parseDuration(lastRun.time), toMetres(parseNumber(lastRun.distance) ?? 0, unit), unit) : null;
  /** "Last time" for one set, short enough for its column. */
  const prevText = (p: (typeof block.previous)[number] | undefined) => {
    if (!p) return "–";
    if (tracking === "distance_time") return [p.distance_m ? toDistanceDisplay(p.distance_m, unit) : null, p.duration_seconds ? formatDuration(p.duration_seconds) : null].filter(Boolean).join("/") || "–";
    if (tracking === "time") return p.duration_seconds ? formatDuration(p.duration_seconds) : "–";
    return `${toDisplay(p.weight, unit) || "0"}×${p.reps}`;
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
    const prev = block.previous[prevIdx];
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
    ...(plateLoaded ? [{ label: "Plate calculator", icon: Calculator, onSelect: plates }] : []),
    { label: "Edit available weights", icon: Dumbbell, onSelect: onEquipment },
    { label: "Video & how-to", icon: PlayCircle, onSelect: onShowInfo },
    { label: "Edit sets", icon: Pencil, onSelect: () => setEditing(true) },
    { label: "Remove exercise", icon: Trash2, onSelect: onRemove, destructive: true },
  ];

  // Long-press menu for one set.
  const menuSet = block.sets.find((x) => x.id === setMenuFor) ?? null;
  const menuIdx = menuSet ? block.sets.indexOf(menuSet) : -1;
  const setActions: SheetAction[] = menuSet
    ? [
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
                  const prev = block.previous[menuIdx];
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRest}
          className="bg-secondary flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium"
          aria-label={`Rest timer ${formatClock(block.restSeconds)}. Tap to change.`}
        >
          <Clock className="size-4" /> Rest <span className="num text-primary-text font-bold">{formatClock(block.restSeconds)}</span>
        </button>
        <button type="button" onClick={onInterval} className="bg-secondary flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium">
          <Timer className="size-4" /> Interval
        </button>
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

      <div className={cn(ROW_GRID, "text-muted-foreground px-1 text-center text-[11px] font-semibold tracking-wide uppercase")}>
        <span>Set</span>
        <span>Last time</span>
        <span>{tracking === "distance_time" ? distanceUnit(unit) : tracking === "time" ? `+${u}` : u}</span>
        <span>{timed ? "Time" : "Reps"}</span>
        <span />
      </div>

      {block.sets.map((set, i) => {
        const prev = block.previous[i];
        return (
          <SetRow
            key={set.id}
            set={set}
            workingNumber={numbers[i]}
            previousText={prevText(prev)}
            tracking={tracking}
            timePlaceholder={prev?.duration_seconds ? formatDuration(prev.duration_seconds) : tracking === "time" ? (block.repTarget?.split("-")[0] ?? "0:00") : "0:00"}
            distancePlaceholder={prev?.distance_m ? toDistanceDisplay(prev.distance_m, unit) : "0"}
            weightPlaceholder={prev ? toDisplay(prev.weight, unit) || "0" : "0"}
            repPlaceholder={prev ? String(prev.reps) : (block.repTarget?.split("-")[0] ?? "0")}
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
        );
      })}

      {/* Ghost row: what one more set would look like. Tap to add it. */}
      <button
        type="button"
        onClick={onAddSet}
        aria-label="Add set"
        className={cn(ROW_GRID, "hover:bg-accent min-h-14 rounded-xl px-1 py-1 text-center")}
      >
        <Plus className="text-muted-foreground mx-auto size-6" />
        <span aria-hidden className="num text-muted-foreground/70 truncate text-sm">
          {lastPrev ? <LastTime text={prevText(lastPrev)} tight /> : ""}
        </span>
        <span aria-hidden className="num text-foreground/35 text-xl font-bold">{(tracking === "distance_time" ? last?.distance : last?.weight) || ""}</span>
        <span aria-hidden className="num text-foreground/35 text-xl font-bold">{(timed ? last?.time : last?.reps) || ""}</span>
        <span className="text-muted-foreground text-xs font-semibold">Add</span>
      </button>

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
