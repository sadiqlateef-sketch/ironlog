"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Search } from "lucide-react";
import { ExerciseList } from "@/components/exercise-list";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EQUIPMENT_LABELS } from "@/lib/labels";
import { listExercises, type Exercise } from "@/lib/workout-api";
import { similarExercises } from "@/lib/workout-logic";

/** Swap the current exercise for a similar one (same main muscle). */
export function SwapSheet({
  exercise,
  onOpenChange,
  onSwap,
}: {
  exercise: Exercise | null;
  onOpenChange: (open: boolean) => void;
  onSwap: (exercise: Exercise) => void;
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

  return (
    <Dialog open={!!exercise} onOpenChange={(o) => (o || setBrowse(false), onOpenChange(o))}>
      <DialogContent className="h-[85dvh]">
        <DialogHeader>
          <DialogTitle>Swap exercise</DialogTitle>
          <DialogDescription>Your sets move to the new exercise.</DialogDescription>
        </DialogHeader>
        {exercise && !browse && (
          <ul className="-mx-2 flex flex-col">
            <li className="bg-primary/15 flex items-center gap-3 rounded-xl px-3 py-3">
              <span className="font-semibold">{exercise.name}</span>
              <span className="text-muted-foreground ml-auto text-xs">Current</span>
            </li>
            {similarExercises(exercise, all).map((e) => (
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
        )}
        {browse && <ExerciseList exercises={all} onSelect={pick} />}
      </DialogContent>
    </Dialog>
  );
}
