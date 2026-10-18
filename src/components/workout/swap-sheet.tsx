"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Ban, Search, Sparkles } from "lucide-react";
import { ExerciseList } from "@/components/exercise-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EQUIPMENT_LABELS } from "@/lib/labels";
import { listExercises, type Exercise } from "@/lib/workout-api";
import { smartSwaps } from "@/lib/workout-logic";

/**
 * Swap the current exercise. The best match (same muscles, equipment you have
 * here) is one tap; "Not here" also remembers this place doesn't have it.
 */
export function SwapSheet({
  exercise,
  onOpenChange,
  onSwap,
  kitName,
  allowed,
  inWorkout,
  onMissing,
}: {
  exercise: Exercise | null;
  onOpenChange: (open: boolean) => void;
  onSwap: (exercise: Exercise) => void;
  kitName?: string;
  /** What this place's equipment can do. */
  allowed?: (e: Exercise) => boolean;
  /** Exercises already in the workout, so a swap doesn't duplicate one. */
  inWorkout?: Set<string>;
  onMissing?: (e: Exercise) => void;
}) {
  const [all, setAll] = useState<Exercise[]>([]);
  const [browse, setBrowse] = useState(false);

  useEffect(() => {
    if (exercise && all.length === 0) listExercises().then(setAll).catch(() => {});
  }, [exercise, all.length]);

  const pick = (e: Exercise) => {
    onSwap(e);
    onOpenChange(false);
  };

  const options = exercise ? smartSwaps(exercise, all, { allowed, exclude: inWorkout }) : [];
  const [best, ...rest] = options;

  return (
    <Dialog open={!!exercise} onOpenChange={(o) => (o || setBrowse(false), onOpenChange(o))}>
      <DialogContent className="h-[85dvh]">
        <DialogHeader>
          <DialogTitle>Swap exercise</DialogTitle>
          <DialogDescription>
            Your sets move to the new exercise.{kitName && allowed ? ` Showing what you can do at ${kitName}.` : ""}
          </DialogDescription>
        </DialogHeader>
        {exercise && !browse && (
          <div className="-mx-2 flex min-h-0 flex-col gap-2 overflow-y-auto">
            <div className="bg-primary/15 flex items-center gap-3 rounded-xl px-3 py-3">
              <span className="font-semibold">{exercise.name}</span>
              <span className="text-muted-foreground ml-auto text-xs">Current</span>
            </div>
            {best && (
              <div className="glass flex flex-col gap-2 rounded-2xl p-3">
                <p className="text-primary-text flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
                  <Sparkles className="size-3" /> Best match
                </p>
                <p className="font-semibold">
                  {best.name} <span className="text-muted-foreground text-xs font-normal">{EQUIPMENT_LABELS[best.equipment]}</span>
                </p>
                <div className={onMissing ? "grid grid-cols-2 gap-2" : "grid"}>
                  <Button onClick={() => pick(best)} data-testid="swap-best">
                    <ArrowLeftRight /> Swap
                  </Button>
                  {onMissing && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onMissing(exercise);
                        pick(best);
                      }}
                    >
                      <Ban /> Not here
                    </Button>
                  )}
                </div>
                {onMissing && kitName && <p className="text-muted-foreground text-xs">&ldquo;Not here&rdquo; swaps it and leaves {exercise.name} out at {kitName} from now on.</p>}
              </div>
            )}
            {!best && all.length > 0 && <p className="text-muted-foreground px-3 text-sm">No close match with the equipment here. Find any exercise below.</p>}
            <ul className="flex flex-col">
              {rest.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e)} className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.name}</span>
                      <span className="text-muted-foreground text-xs">{EQUIPMENT_LABELS[e.equipment]}</span>
                    </span>
                    <ArrowLeftRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => setBrowse(true)} className="text-primary-text flex w-full items-center gap-2 px-3 py-3 text-sm font-semibold">
                  <Search className="size-4" /> Find any exercise
                </button>
              </li>
            </ul>
          </div>
        )}
        {browse && <ExerciseList exercises={all} onSelect={pick} />}
      </DialogContent>
    </Dialog>
  );
}
