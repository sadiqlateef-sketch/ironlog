"use client";

import { useState } from "react";
import { Calculator, Link2, MoreVertical, Plus, Trash2, Unlink } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { SetRow } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { toDisplay, type Block, type UiSet } from "@/hooks/use-workout";
import { PLATE_LOADED } from "@/lib/labels";
import { parseNumber, workingSetNumbers } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

export function ExerciseBlock({
  block,
  isLast,
  onShowInfo,
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
  onShowInfo: () => void;
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
  const numbers = workingSetNumbers(block.sets.map((s) => s.type));
  const u = unit === "imperial" ? "lb" : "kg";
  const plateLoaded = PLATE_LOADED.includes(block.exercise.equipment);
  const nextUndone = block.sets.find((s) => !s.done);

  return (
    <section
      className={cn(
        "glass flex flex-col gap-2 rounded-2xl p-3",
        block.supersetGroup != null && "border-l-set-drop border-l-4",
      )}
      data-testid="exercise-block"
    >
      <header className="flex items-start gap-2">
        <button type="button" onClick={onShowInfo} className="min-w-0 flex-1 text-left">
          <h2 className="truncate text-xl font-bold tracking-tight">{block.exercise.name}</h2>
          <p className="text-muted-foreground text-xs">
            {block.supersetGroup != null && <span className="text-set-drop mr-2 font-semibold">SUPERSET</span>}
            {block.repTarget && <>Target {block.repTarget} reps · </>}
            Rest {Math.floor(block.restSeconds / 60)}:{String(block.restSeconds % 60).padStart(2, "0")}
          </p>
          {block.targetNote && <p className="text-foreground/80 text-xs">{block.targetNote}</p>}
        </button>
        {plateLoaded && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Plate calculator"
            onClick={() => {
              const w = nextUndone ? parseNumber(nextUndone.weight) : null;
              const prevIdx = nextUndone ? block.sets.indexOf(nextUndone) : -1;
              const prev = block.previous[prevIdx];
              onPlates(w ?? (prev ? parseNumber(toDisplay(prev.weight, unit)) : null));
            }}
          >
            <Calculator />
          </Button>
        )}
        {(block.supersetGroup != null || !isLast) && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={block.supersetGroup != null ? "Remove from superset" : "Superset with next exercise"}
            onClick={onToggleSuperset}
          >
            {block.supersetGroup != null ? <Unlink /> : <Link2 />}
          </Button>
        )}
        <Button
          variant={editing ? "secondary" : "ghost"}
          size="icon"
          aria-label="Edit sets"
          onClick={() => setEditing(!editing)}
        >
          <MoreVertical />
        </Button>
      </header>

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

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onAddSet}>
          <Plus /> Add set
        </Button>
        {editing && (
          <Button variant="destructive" onClick={onRemove}>
            <Trash2 /> Remove
          </Button>
        )}
      </div>
    </section>
  );
}
