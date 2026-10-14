"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { UiSet } from "@/hooks/use-workout";
import { setLabel } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

const typeStyles = {
  normal: "bg-secondary text-foreground",
  warmup: "bg-set-warmup/20 text-set-warmup",
  drop: "bg-set-drop/20 text-set-drop",
  failure: "bg-set-failure/20 text-set-failure",
} as const;

const inputClass =
  "h-12 w-full min-w-0 rounded-xl bg-secondary text-center font-mono text-xl font-extrabold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-100";

export function SetRow({
  set,
  workingNumber,
  weightPlaceholder,
  previousText,
  repPlaceholder,
  current,
  editing,
  onChange,
  onCommit,
  onCycleType,
  onToggleDone,
  onRemove,
}: {
  set: UiSet;
  workingNumber: number;
  weightPlaceholder: string;
  previousText: string;
  repPlaceholder: string;
  /** The next set to do: highlighted so it is easy to find mid-workout. */
  current: boolean;
  editing: boolean;
  onChange: (patch: Partial<UiSet>) => void;
  onCommit: () => void;
  onCycleType: () => void;
  onToggleDone: () => Promise<boolean>;
  onRemove: () => void;
}) {
  const [shake, setShake] = useState(false);

  async function done() {
    const ok = await onToggleDone();
    if (!ok) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[2.5rem_1fr_4.5rem_4rem_3rem] items-center gap-2 rounded-lg px-1 py-1 transition-colors",
        set.done && "bg-success/10",
        current && "bg-primary/15 ring-primary/60 ring-1",
        shake && "animate-pulse ring-destructive ring-2",
      )}
      data-testid="set-row"
    >
      <button
        type="button"
        onClick={onCycleType}
        aria-label={`Set ${workingNumber}, type ${set.type}. Tap to change type.`}
        className={cn("h-9 rounded-lg font-mono text-sm font-bold", typeStyles[set.type])}
      >
        {setLabel(set.type, workingNumber)}
      </button>

      <span className="text-muted-foreground truncate text-center font-mono text-sm" title="Last time">
        {previousText}
      </span>

      <input
        aria-label="Weight"
        inputMode="decimal"
        className={inputClass}
        placeholder={weightPlaceholder}
        value={set.weight}
        onChange={(e) => onChange({ weight: e.target.value })}
        onBlur={onCommit}
        onFocus={(e) => e.target.select()}
      />
      <input
        aria-label="Reps"
        inputMode="numeric"
        className={inputClass}
        placeholder={repPlaceholder}
        value={set.reps}
        onChange={(e) => onChange({ reps: e.target.value.replace(/\D/g, "") })}
        onBlur={onCommit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
            done();
          }
        }}
      />

      {editing ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete set"
          className="bg-destructive/20 text-destructive grid size-12 place-items-center rounded-xl"
        >
          <X className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={done}
          aria-label={set.done ? "Mark set not done" : "Complete set"}
          aria-pressed={set.done}
          className={cn(
            "grid size-12 place-items-center rounded-xl transition-colors",
            set.done ? "bg-success text-[#08200d]" : "bg-secondary text-muted-foreground",
          )}
        >
          <Check className="size-6" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
