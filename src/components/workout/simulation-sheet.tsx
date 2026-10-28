"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Flame, Sparkles, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { simulateWorkout, type SimulatedExercise, type WorkoutSimulationResult } from "@/lib/simulation";
import { getMuscleSets } from "@/lib/workout-api";
import { LOOKBACK_HOURS, type MuscleSet } from "@/lib/recovery";
import { MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function SimulationSheet({
  open,
  onOpenChange,
  routineName,
  exercises,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineName: string;
  exercises: SimulatedExercise[];
  onStart?: () => void;
}) {
  const [history, setHistory] = useState<MuscleSet[]>([]);
  const [result, setResult] = useState<WorkoutSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || exercises.length === 0) return;
    setLoading(true);
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => {
        setHistory(sets);
        const sim = simulateWorkout(exercises, sets, new Date());
        setResult(sim);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, exercises]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4 text-primary-text" />
            Workout Fatigue Simulator
          </DialogTitle>
          <DialogDescription>
            Predictive recovery and strain projection for {routineName}.
          </DialogDescription>
        </DialogHeader>

        {loading || !result ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            <Activity className="size-6 animate-pulse text-primary" />
            <span>Simulating biomechanical load...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto -mx-2 px-2 flex flex-col gap-4">
            {/* Readiness Verdict Banner */}
            <div
              className={cn(
                "rounded-2xl p-4 border flex flex-col gap-1.5 shadow-sm",
                result.readinessVerdict === "optimal" && "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
                result.readinessVerdict === "moderate" && "bg-sky-500/10 border-sky-500/30 text-sky-300",
                result.readinessVerdict === "caution" && "bg-amber-500/10 border-amber-500/30 text-amber-300",
              )}
            >
              <div className="flex items-center gap-2">
                {result.readinessVerdict === "caution" ? (
                  <AlertTriangle className="size-5 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
                )}
                <span className="font-bold text-sm tracking-tight">{result.verdictTitle}</span>
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">{result.verdictMessage}</p>
            </div>

            {/* Projected Overview Metrics */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-secondary/60 rounded-xl p-3 border border-border/50">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Projected Strain
                </span>
                <span className="num text-2xl font-black text-foreground">
                  {result.projectedStrain} <span className="text-xs text-muted-foreground font-normal">/ 100</span>
                </span>
              </div>
              <div className="bg-secondary/60 rounded-xl p-3 border border-border/50">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Working Volume
                </span>
                <span className="num text-2xl font-black text-foreground">
                  {result.totalWorkingSets} <span className="text-xs text-muted-foreground font-normal">sets</span>
                </span>
              </div>
            </div>

            {/* Target Muscle Fatigue Impact */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Target Muscle Depletion
              </span>
              <div className="flex flex-col gap-2">
                {result.impactedMuscles.slice(0, 5).map((m) => {
                  return (
                    <div
                      key={m.muscle}
                      className="bg-secondary/40 border border-border/40 rounded-xl p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground text-sm">{MUSCLE_LABELS[m.muscle]}</span>
                        <span className="num font-semibold text-muted-foreground">
                          {m.currentRecovery}% →{" "}
                          <span className={cn("font-bold", m.projectedRecovery < 60 ? "text-amber-400" : "text-foreground")}>
                            {m.projectedRecovery}%
                          </span>
                        </span>
                      </div>

                      {/* Visual Delta Bar */}
                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${m.projectedRecovery}%` }}
                        />
                        <div
                          className="h-full bg-amber-500/60 transition-all"
                          style={{ width: `${m.recoveryDrop}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Drop: -{m.recoveryDrop}%</span>
                        {m.hoursToReady > 0 && <span>~{m.hoursToReady}h until full recovery</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border mt-auto flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onStart && (
            <Button
              className="flex-1 gap-1.5 font-bold"
              onClick={() => {
                onOpenChange(false);
                onStart();
              }}
            >
              Start Workout <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
