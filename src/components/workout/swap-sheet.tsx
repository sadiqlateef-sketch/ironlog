"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Ban, Info, Search, Sparkles } from "lucide-react";
import { ExerciseList } from "@/components/exercise-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EQUIPMENT_LABELS } from "@/lib/labels";
import { listExercises, type Exercise } from "@/lib/workout-api";
import { smartSwaps } from "@/lib/workout-logic";
import { explainSubstitution, type SwapExplanation } from "@/lib/substitution-engine";
import { cn } from "@/lib/utils";

/**
 * Smart Exercise Substitution Sheet:
 * Provides contextual, biomechanically-sound rationales for swapping exercises.
 * Compares muscle recruitment, joint stress, and equipment advantages.
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

  const bestExplanation = exercise && best ? explainSubstitution(exercise, best) : null;

  return (
    <Dialog open={!!exercise} onOpenChange={(o) => (o || setBrowse(false), onOpenChange(o))}>
      <DialogContent className="h-[85dvh]">
        <DialogHeader>
          <DialogTitle>Exercise Substitution</DialogTitle>
          <DialogDescription>
            Smart biomechanical alternatives for your workout.{kitName && allowed ? ` Showing what fits ${kitName}.` : ""}
          </DialogDescription>
        </DialogHeader>
        {exercise && !browse && (
          <div className="-mx-2 flex min-h-0 flex-col gap-2 overflow-y-auto px-1">
            <div className="bg-primary/15 flex items-center justify-between rounded-xl px-3 py-2.5">
              <span className="font-semibold text-sm">{exercise.name}</span>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Current</span>
            </div>

            {best && bestExplanation && (
              <div className="glass flex flex-col gap-2 rounded-2xl p-3.5 border border-primary/40 shadow-md">
                <div className="flex items-center justify-between">
                  <p className="text-primary-text flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
                    <Sparkles className="size-3.5" /> Best Match
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary-text border border-primary/30">
                    {bestExplanation.badge}
                  </span>
                </div>

                <div>
                  <p className="font-bold text-base text-foreground">
                    {best.name}{" "}
                    <span className="text-muted-foreground text-xs font-normal">
                      · {EQUIPMENT_LABELS[best.equipment]}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {bestExplanation.rationale}
                  </p>
                </div>

                {bestExplanation.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {bestExplanation.tags.map((tag) => (
                      <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-foreground/80">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className={onMissing ? "grid grid-cols-2 gap-2 mt-1" : "grid mt-1"}>
                  <Button onClick={() => pick(best)} data-testid="swap-best">
                    <ArrowLeftRight className="size-4" /> Swap Exercise
                  </Button>
                  {onMissing && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onMissing(exercise);
                        pick(best);
                      }}
                    >
                      <Ban className="size-4" /> Not here
                    </Button>
                  )}
                </div>
                {onMissing && kitName && (
                  <p className="text-muted-foreground text-[11px] text-center">
                    &ldquo;Not here&rdquo; remembers to exclude {exercise.name} when at {kitName}.
                  </p>
                )}
              </div>
            )}

            {!best && all.length > 0 && (
              <p className="text-muted-foreground px-3 text-sm">
                No close match with the equipment here. Find any exercise below.
              </p>
            )}

            <div className="flex flex-col gap-1 mt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2 pt-1">
                More Alternatives
              </span>
              <ul className="flex flex-col gap-1">
                {rest.slice(0, 6).map((e) => {
                  const expl = explainSubstitution(exercise, e);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => pick(e)}
                        className="hover:bg-accent/70 bg-secondary/30 border border-border/40 flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{e.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                              {expl.badge}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-1">
                            {expl.rationale}
                          </p>
                        </div>
                        <ArrowLeftRight className="text-muted-foreground size-4 shrink-0 mt-1" aria-hidden />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => setBrowse(true)}
                    className="text-primary-text flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 px-3 py-3 text-sm font-semibold hover:bg-secondary/40 transition-colors"
                  >
                    <Search className="size-4" /> Browse Full Exercise Library
                  </button>
                </li>
              </ul>
            </div>
          </div>
        )}
        {browse && <ExerciseList exercises={all} onSelect={pick} />}
      </DialogContent>
    </Dialog>
  );
}
