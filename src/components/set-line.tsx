"use client";

import { X } from "lucide-react";
import type { WorkoutSet } from "@/lib/workout-api";
import { nextSetType } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

type SetType = WorkoutSet["set_type"];

const typeStyles = {
  normal: "bg-secondary text-foreground",
  warmup: "bg-set-warmup/20 text-set-warmup",
  drop: "bg-set-drop/20 text-set-drop",
  failure: "bg-set-failure/20 text-set-failure",
} as const;

const numInput =
  "h-11 w-full min-w-0 rounded-xl bg-secondary text-center font-mono text-lg font-bold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

/** Grid columns for a header row plus SetLine rows. */
export const SET_GRID = "grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2 px-1";

/**
 * One editable set: type badge (tap to cycle), weight, reps, remove.
 * Renders four cells, so place it inside SET_GRID.
 */
export function SetLine({
  s,
  label,
  onChange,
  onRemove,
}: {
  s: { type: SetType; weight: string; reps: string };
  label: string;
  onChange: (patch: { type?: SetType; weight?: string; reps?: string }) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onChange({ type: nextSetType(s.type) })}
        aria-label={`Set type ${s.type}. Tap to change.`}
        className={cn("h-9 rounded-lg font-mono text-sm font-bold", typeStyles[s.type])}
      >
        {label}
      </button>
      <input
        inputMode="decimal"
        aria-label="Weight"
        placeholder="0"
        value={s.weight}
        onChange={(e) => onChange({ weight: e.target.value.replace(/[^\d.]/g, "") })}
        className={numInput}
      />
      <input
        inputMode="numeric"
        aria-label="Reps"
        placeholder="0"
        value={s.reps}
        onChange={(e) => onChange({ reps: e.target.value.replace(/\D/g, "") })}
        className={numInput}
      />
      <button type="button" onClick={onRemove} aria-label="Remove set" className="text-muted-foreground grid h-11 place-items-center">
        <X className="size-5" />
      </button>
    </>
  );
}
