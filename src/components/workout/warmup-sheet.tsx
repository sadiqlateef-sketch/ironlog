"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { platesText, warmupRamp } from "@/lib/set-logic";
import { parseNumber } from "@/lib/workout-logic";

/** Warm-up sets worked out from today's working weight, with the plates for each. */
export function WarmupSheet({
  open,
  onOpenChange,
  exerciseName,
  working,
  unitLabel,
  plateLoaded,
  bar,
  plates,
  step,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  /** Today's working weight in your unit, if known. */
  working: number | null;
  unitLabel: string;
  plateLoaded: boolean;
  bar: number;
  plates: number[];
  step: number;
  onAdd: (sets: { weight: number; reps: number }[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Warm-up sets</DialogTitle>
          <DialogDescription>Builds up to your working weight on {exerciseName}.</DialogDescription>
        </DialogHeader>
        {/* Mounted fresh each time it opens, so it starts from today's weight. */}
        {open && (
          <WarmupForm
            initial={working}
            unitLabel={unitLabel}
            plateLoaded={plateLoaded}
            bar={bar}
            plates={plates}
            step={step}
            onAdd={(sets) => (onAdd(sets), onOpenChange(false))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WarmupForm({
  initial,
  unitLabel,
  plateLoaded,
  bar,
  plates,
  step,
  onAdd,
}: {
  initial: number | null;
  unitLabel: string;
  plateLoaded: boolean;
  bar: number;
  plates: number[];
  step: number;
  onAdd: (sets: { weight: number; reps: number }[]) => void;
}) {
  const [text, setText] = useState(initial ? String(initial) : "");
  const working = parseNumber(text) ?? 0;
  const ramp = warmupRamp(working, { plateLoaded, bar, plates, step });

  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Working weight</span>
        <span className="flex items-center gap-2">
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label={`Working weight in ${unitLabel}`}
            className="bg-secondary focus:ring-ring h-11 w-24 rounded-xl text-center text-lg font-bold tabular-nums outline-none focus:ring-2"
          />
          <span className="text-muted-foreground text-sm">{unitLabel}</span>
        </span>
      </label>

      {ramp.length ? (
        <ol className="flex flex-col gap-1.5" data-testid="warmup-list">
          {ramp.map((w, i) => (
            <li key={i} className="bg-secondary/60 flex items-center gap-3 rounded-xl px-3 py-2">
              <span className="bg-set-warmup/20 text-set-warmup grid size-8 place-items-center rounded-lg text-sm font-bold">W</span>
              <span className="text-lg font-bold tabular-nums">
                {w.weight} <span className="text-muted-foreground text-sm font-normal">{unitLabel} ×</span> {w.reps}
              </span>
              {w.plates && (
                <span className="text-muted-foreground ml-auto text-right text-xs">
                  {w.plates.length ? (
                    <>
                      <span className="text-foreground/90 font-semibold tabular-nums">{platesText(w.plates)}</span>
                      <br />
                      each side
                    </>
                  ) : (
                    "Empty bar"
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          {working > 0 ? "That's light enough to start without warm-ups." : "Type your working weight to see the warm-ups."}
        </p>
      )}

      <Button disabled={!ramp.length} onClick={() => onAdd(ramp.map(({ weight, reps }) => ({ weight, reps })))}>
        Add {ramp.length || ""} warm-up set{ramp.length === 1 ? "" : "s"}
      </Button>
    </>
  );
}
