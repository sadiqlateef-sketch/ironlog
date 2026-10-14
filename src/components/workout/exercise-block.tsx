"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  Calculator,
  ChartColumn,
  Check,
  Clock,
  Dumbbell,
  Link2,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Timer,
  Trash2,
  Unlink,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { SetRow } from "@/components/workout/set-row";
import { ActionSheet, type SheetAction } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { toDisplay, type Block, type UiSet } from "@/hooks/use-workout";
import { PLATE_LOADED } from "@/lib/labels";
import { formatWeight } from "@/lib/units";
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
  onAddSet,
  onRemoveSet,
  onChangeSet,
  onCommitSet,
  onCycleType,
  onToggleDone,
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
  onAddSet: () => void;
  onRemoveSet: (id: string) => void;
  onChangeSet: (id: string, patch: Partial<UiSet>) => void;
  onCommitSet: (id: string) => void;
  onCycleType: (id: string) => void;
  onToggleDone: (id: string) => Promise<boolean>;
}) {
  const { unit } = useAuth();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const numbers = workingSetNumbers(block.sets.map((s) => s.type));
  const u = unit === "imperial" ? "lb" : "kg";
  const plateLoaded = PLATE_LOADED.includes(block.exercise.equipment);
  const nextUndone = block.sets.find((s) => !s.done);
  const last = block.sets.at(-1);
  const lastPrev = block.previous.at(-1);

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
            {bestPrev ? (
              <>
                Last time: {formatWeight(bestPrev.weight, unit)} × {bestPrev.reps}
              </>
            ) : (
              "First time logging this"
            )}
            {block.repTarget && <> · Target {block.repTarget}</>}
          </p>
          {block.targetNote && <p className="text-foreground/80 text-xs">{block.targetNote}</p>}
        </button>
        {e1rm > 0 && (
          <div className="shrink-0 px-1 text-right" aria-label={`Estimated one rep max ${e1rm} ${u}`}>
            <p className="text-muted-foreground text-[11px] font-bold tracking-wider">EST. 1RM</p>
            <p className="text-primary-text font-mono text-xl font-extrabold">{e1rm}</p>
          </div>
        )}
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRest}
          className="bg-secondary flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium"
          aria-label={`Rest timer ${formatClock(block.restSeconds)}. Tap to change.`}
        >
          <Clock className="size-4" /> Rest <span className="text-primary-text font-mono font-bold">{formatClock(block.restSeconds)}</span>
        </button>
        <button type="button" onClick={onInterval} className="bg-secondary flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium">
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

      <div className="text-muted-foreground grid grid-cols-[2.5rem_1fr_4.5rem_4rem_3rem] gap-2 px-1 text-center text-[11px] font-semibold tracking-wide uppercase">
        <span>Set</span>
        <span>Last time</span>
        <span>{u}</span>
        <span>Reps</span>
        <span />
      </div>

      {block.sets.map((set, i) => {
        const prev = block.previous[i];
        return (
          <SetRow
            key={set.id}
            set={set}
            workingNumber={numbers[i]}
            previousText={prev ? `${toDisplay(prev.weight, unit) || "0"}×${prev.reps}` : "–"}
            weightPlaceholder={prev ? toDisplay(prev.weight, unit) || "0" : "0"}
            repPlaceholder={prev ? String(prev.reps) : (block.repTarget?.split("-")[0] ?? "0")}
            current={set === nextUndone}
            editing={editing}
            onChange={(patch) => onChangeSet(set.id, patch)}
            onCommit={() => onCommitSet(set.id)}
            onCycleType={() => onCycleType(set.id)}
            onToggleDone={() => onToggleDone(set.id)}
            onRemove={() => onRemoveSet(set.id)}
          />
        );
      })}

      {/* Ghost row: what one more set would look like. Tap to add it. */}
      <button
        type="button"
        onClick={onAddSet}
        aria-label="Add set"
        className="hover:bg-accent grid grid-cols-[2.5rem_1fr_4.5rem_4rem_3rem] items-center gap-2 rounded-lg px-1 py-1 text-center"
      >
        <Plus className="text-muted-foreground mx-auto size-5" />
        <span aria-hidden className="text-muted-foreground/70 font-mono text-sm">
          {lastPrev ? `${toDisplay(lastPrev.weight, unit) || "0"}×${lastPrev.reps}` : ""}
        </span>
        <span aria-hidden className="text-foreground/35 font-mono text-xl font-extrabold">{last?.weight || ""}</span>
        <span aria-hidden className="text-foreground/35 font-mono text-xl font-extrabold">{last?.reps || ""}</span>
        <span className="text-muted-foreground text-xs font-semibold">Add</span>
      </button>

      <ActionSheet open={menu} onOpenChange={setMenu} title={block.exercise.name} actions={actions} />
    </section>
  );
}
