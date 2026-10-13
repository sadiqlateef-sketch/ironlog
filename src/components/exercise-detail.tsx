"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { ExerciseAnimation } from "@/components/exercise-animation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getLastPerformance, type Exercise, type LastPerformance } from "@/lib/workout-api";
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import { formatWeight } from "@/lib/units";

export function ExerciseDetail({
  exercise,
  onOpenChange,
}: {
  exercise: Exercise | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { unit } = useAuth();
  const [history, setHistory] = useState<{ id: string; sets: LastPerformance } | null>(null);
  const last = exercise && history?.id === exercise.id ? history.sets : null;

  useEffect(() => {
    if (!exercise) return;
    getLastPerformance(exercise.id)
      .then((sets) => setHistory({ id: exercise.id, sets }))
      .catch(() => setHistory({ id: exercise.id, sets: [] }));
  }, [exercise]);

  return (
    <Dialog open={!!exercise} onOpenChange={onOpenChange}>
      <DialogContent>
        {exercise && (
          <>
            <DialogHeader>
              <DialogTitle>{exercise.name}</DialogTitle>
              <DialogDescription>
                {EQUIPMENT_LABELS[exercise.equipment]} · {exercise.mechanic === "compound" ? "Compound" : "Isolation"}
              </DialogDescription>
            </DialogHeader>
            <ExerciseAnimation exercise={exercise} />
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-1 font-semibold">
                {MUSCLE_LABELS[exercise.primary_muscle]}
              </span>
              {exercise.secondary_muscles.map((m) => (
                <span key={m} className="bg-secondary rounded-full px-2.5 py-1">
                  {MUSCLE_LABELS[m]}
                </span>
              ))}
            </div>
            {exercise.instructions && <p className="text-sm leading-relaxed">{exercise.instructions}</p>}
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Last time</h3>
              {last === null ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : last.length === 0 ? (
                <p className="text-muted-foreground text-sm">You haven&apos;t logged this yet.</p>
              ) : (
                <ul className="font-mono text-sm">
                  {last.map((s) => (
                    <li key={s.set_number} className="flex gap-3">
                      <span className="text-muted-foreground w-6">{s.set_type === "warmup" ? "W" : s.set_number}</span>
                      <span>
                        {formatWeight(s.weight, unit)} × {s.reps}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
