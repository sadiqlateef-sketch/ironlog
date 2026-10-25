"use client";

import { X } from "lucide-react";
import { effortChoices } from "@/lib/set-logic";
import type { EffortScale } from "@/types/database";

/**
 * One tap after a set: how many more reps could you have done (or RPE).
 * Feeds "go up next time?". Skipping is fine.
 */
export function EffortPicker({
  scale,
  onPick,
  onSkip,
}: {
  scale: EffortScale;
  onPick: (rpe: number) => void;
  onSkip: () => void;
}) {
  return (
    <div className="bg-secondary/60 flex items-center gap-1.5 rounded-xl px-2 py-1.5" data-testid="effort-picker">
      <p className="text-muted-foreground w-16 shrink-0 text-xs leading-tight font-semibold">
        {scale === "rpe" ? "RPE?" : "Reps left?"}
      </p>
      <div className="grid flex-1 grid-cols-5 gap-1.5">
        {effortChoices(scale).map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onPick(c.rpe)}
            aria-label={c.aria}
            className="bg-secondary hover:bg-accent h-10 rounded-lg text-base font-bold tabular-nums"
          >
            {c.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onSkip} aria-label="Don't rate this set" className="text-muted-foreground grid size-10 shrink-0 place-items-center">
        <X className="size-4" />
      </button>
    </div>
  );
}
