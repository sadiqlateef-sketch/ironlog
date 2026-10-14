"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatWeight } from "@/lib/units";
import { applyAdjustment, dismissAdjustment, type AdjustmentWithContext, type LastPerformance } from "@/lib/workout-api";
import { splitNumbers } from "@/lib/workout-logic";

const HEADLINE = {
  increase: "Time to go heavier",
  hold: "Same weight again",
  deload: "Lighter this time",
  adjust_reps: "New rep target",
} as const;

/**
 * The AI's progression call for one exercise, right inside the workout: the
 * new weight, why (in plain English), and how each set went last time against
 * your target rep range.
 */
export function ProgressionSheet({
  exerciseName,
  adjustment,
  previous,
  repMin,
  repMax,
  onOpenChange,
  onApplied,
  onDismissed,
}: {
  exerciseName: string;
  adjustment: AdjustmentWithContext | null;
  previous: LastPerformance;
  repMin: number | null;
  repMax: number | null;
  onOpenChange: (open: boolean) => void;
  onApplied: (a: AdjustmentWithContext) => void;
  onDismissed: (a: AdjustmentWithContext) => void;
}) {
  const { unit } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = adjustment;

  async function act(fn: (id: string) => Promise<void>, then: (a: AdjustmentWithContext) => void) {
    if (!a) return;
    setBusy(true);
    setError(null);
    try {
      await fn(a.id);
      then(a);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const newWeight = a?.suggested_weight_kg ?? a?.current_weight_kg ?? null;
  const newReps = a?.suggested_reps != null ? `${a.suggested_reps}${a.suggested_reps_max ? `–${a.suggested_reps_max}` : ""} reps` : null;
  const sets = previous.filter((s) => s.set_type !== "warmup");
  const lo = a?.suggested_reps ?? repMin;
  const hi = a?.suggested_reps_max ?? repMax ?? lo;
  const scale = Math.max(12, ...sets.map((s) => s.reps), (hi ?? 0) + 4);

  return (
    <Dialog open={!!a} onOpenChange={onOpenChange}>
      <DialogContent>
        {a && (
          <>
            <DialogHeader className="items-center pr-0 text-center">
              <Sparkles className="text-ai size-6" aria-hidden />
              <DialogTitle>{exerciseName}</DialogTitle>
              <DialogDescription>{HEADLINE[a.action]}</DialogDescription>
            </DialogHeader>

            <div className="bg-secondary flex flex-col gap-3 rounded-2xl p-4">
              <div>
                <p className="text-muted-foreground text-sm font-medium">New weight</p>
                <p className="font-mono text-3xl font-extrabold tracking-tight">
                  {newWeight != null ? formatWeight(newWeight, unit) : "Same weight"}
                  {newReps && <span className="text-muted-foreground ml-2 text-lg font-semibold">× {newReps}</span>}
                </p>
                {a.current_weight_kg != null && newWeight != null && Math.abs(newWeight - a.current_weight_kg) > 0.01 && (
                  <p className="text-muted-foreground text-sm">was {formatWeight(a.current_weight_kg, unit)}</p>
                )}
              </div>
              <p className="border-border border-t pt-3 text-base leading-relaxed">
                {splitNumbers(a.reason).map((part, i) =>
                  i % 2 ? (
                    <strong key={i} className="text-primary-text font-bold">
                      {part}
                    </strong>
                  ) : (
                    part
                  ),
                )}
              </p>

              {sets.length > 0 && lo != null && (
                <figure className="flex flex-col gap-2">
                  <figcaption className="text-muted-foreground flex justify-between text-xs font-semibold">
                    <span>
                      Last time vs target ({lo}
                      {hi && hi !== lo ? `–${hi}` : ""} reps)
                    </span>
                    <span>Logged</span>
                  </figcaption>
                  {sets.map((s, i) => {
                    const hit = s.reps >= lo;
                    return (
                      <div key={s.set_number} className="flex items-center gap-3">
                        <span className="text-muted-foreground w-4 text-sm">{i + 1}</span>
                        <div className="bg-foreground/10 relative h-6 flex-1 overflow-hidden rounded-md" aria-hidden>
                          {/* target band */}
                          <div
                            className="bg-ai/25 border-ai absolute inset-y-0 border-x-2"
                            style={{ left: `${(lo / scale) * 100}%`, width: `${Math.max(2, (((hi ?? lo) - lo) / scale) * 100)}%` }}
                          />
                          <div
                            className={hit ? "bg-success/80 h-full rounded-md" : "bg-foreground/40 h-full rounded-md"}
                            style={{ width: `${(s.reps / scale) * 100}%` }}
                          />
                        </div>
                        <span className="w-28 text-right font-mono text-sm font-semibold">
                          {formatWeight(s.weight, unit).replace(/ (lb|kg)$/, "")} × {s.reps}
                        </span>
                      </div>
                    );
                  })}
                </figure>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => act(dismissAdjustment, onDismissed)}>
                Keep my plan
              </Button>
              <Button disabled={busy} onClick={() => act(applyAdjustment, onApplied)} className="bg-[#6a4be0] hover:bg-[#6a4be0]/90 shadow-[0_6px_20px_rgb(106_75_224/0.4)]">
                <Sparkles /> Use it
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
