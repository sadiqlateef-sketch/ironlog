"use client";

import { useEffect, useState } from "react";
import { Sparkles, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { platesText, warmupRamp, type WarmupProtocol } from "@/lib/set-logic";
import { parseNumber } from "@/lib/workout-logic";
import { computeRecovery, LOOKBACK_HOURS, READY_THRESHOLD, recoveryLabel } from "@/lib/recovery";
import { getMuscleSets } from "@/lib/workout-api";
import { MUSCLE_LABELS } from "@/lib/labels";
import type { MuscleGroup } from "@/types/database";
import { cn } from "@/lib/utils";

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
  primaryMuscle,
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
  primaryMuscle?: MuscleGroup | null;
  onAdd: (sets: { weight: number; reps: number }[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Warm-up Sequencer
          </DialogTitle>
          <DialogDescription>
            Intelligent ramp-up sets for {exerciseName}.
          </DialogDescription>
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
            primaryMuscle={primaryMuscle}
            onAdd={(sets) => {
              onAdd(sets);
              onOpenChange(false);
            }}
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
  primaryMuscle,
  onAdd,
}: {
  initial: number | null;
  unitLabel: string;
  plateLoaded: boolean;
  bar: number;
  plates: number[];
  step: number;
  primaryMuscle?: MuscleGroup | null;
  onAdd: (sets: { weight: number; reps: number }[]) => void;
}) {
  const [text, setText] = useState(initial ? String(initial) : "");
  const [protocol, setProtocol] = useState<WarmupProtocol>("standard");
  const [muscleRecovery, setMuscleRecovery] = useState<number | null>(null);

  useEffect(() => {
    if (!primaryMuscle) return;
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => {
        const recs = computeRecovery(sets);
        const match = recs.find((m) => m.muscle === primaryMuscle);
        if (match) {
          setMuscleRecovery(match.recovery);
          if (match.recovery < 70) {
            // Automatically suggest thorough protocol for fatigued muscles
            setProtocol("thorough");
          }
        }
      })
      .catch(() => {});
  }, [primaryMuscle]);

  const working = parseNumber(text) ?? 0;
  const ramp = warmupRamp(working, { plateLoaded, bar, plates, step, protocol });

  return (
    <>
      {primaryMuscle && muscleRecovery !== null && (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium border",
            muscleRecovery < READY_THRESHOLD
              ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
          )}
        >
          <div className="flex items-center gap-1.5">
            {muscleRecovery < READY_THRESHOLD ? (
              <ShieldAlert className="size-4 shrink-0 text-amber-400" />
            ) : (
              <Sparkles className="size-4 shrink-0 text-emerald-400" />
            )}
            <span>
              {MUSCLE_LABELS[primaryMuscle]} · {muscleRecovery}% recovered ({recoveryLabel(muscleRecovery)})
            </span>
          </div>
          {muscleRecovery < 70 && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20">
              Thorough Advised
            </span>
          )}
        </div>
      )}

      {/* Protocol Selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Ramp Protocol
        </span>
        <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Warm-up Protocol">
          <button
            type="button"
            onClick={() => setProtocol("express")}
            className={cn(
              "flex flex-col items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-colors",
              protocol === "express"
                ? "bg-foreground text-background shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1">
              <Zap className="size-3" /> Express
            </span>
            <span className="text-[9px] font-normal opacity-75">2 sets</span>
          </button>
          <button
            type="button"
            onClick={() => setProtocol("standard")}
            className={cn(
              "flex flex-col items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-colors",
              protocol === "standard"
                ? "bg-foreground text-background shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Balanced</span>
            <span className="text-[9px] font-normal opacity-75">3-4 sets</span>
          </button>
          <button
            type="button"
            onClick={() => setProtocol("thorough")}
            className={cn(
              "flex flex-col items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-colors",
              protocol === "thorough"
                ? "bg-foreground text-background shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Thorough</span>
            <span className="text-[9px] font-normal opacity-75">4-5 sets</span>
          </button>
        </div>
      </div>

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
              <span className="bg-set-warmup/20 text-set-warmup grid size-8 place-items-center rounded-lg text-sm font-bold">
                W{i + 1}
              </span>
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
