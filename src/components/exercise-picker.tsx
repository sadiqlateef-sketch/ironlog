"use client";

import { useEffect, useState } from "react";
import { ExerciseList } from "@/components/exercise-list";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listExercises, type Exercise } from "@/lib/workout-api";

export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
  title = "Add exercise",
}: {
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: Exercise) => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (open && exercises.length === 0) listExercises().then(setExercises).catch(() => {});
  }, [open, exercises.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85dvh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ExerciseList
          exercises={exercises}
          onSelect={(e) => {
            onPick(e);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
