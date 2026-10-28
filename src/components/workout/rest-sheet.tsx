"use client";

import { Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REST_PRESETS, formatClock } from "@/lib/workout-logic";
import { recommendRestTime } from "@/lib/dynamic-rest";
import { cn } from "@/lib/utils";

/** Pick how long to rest after each set of this exercise with dynamic recommendation guidance. */
export function RestSheet({
  open,
  onOpenChange,
  exerciseName,
  seconds,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  const rec = recommendRestTime({ exerciseName });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rest timer</DialogTitle>
          <DialogDescription>
            Starts automatically after each set of {exerciseName}. Saved for next time.
          </DialogDescription>
        </DialogHeader>

        {/* Dynamic Rest Recommendation Banner */}
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-text">
              <Sparkles className="size-3.5" />
              Optimal: {rec.category} ({formatClock(rec.seconds)})
            </span>
            <p className="text-muted-foreground mt-0.5 text-xs line-clamp-2">
              {rec.rationale}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 h-8 text-xs font-bold border-primary/50 text-primary-text hover:bg-primary/20"
            onClick={() => onChange(rec.seconds)}
          >
            Apply {formatClock(rec.seconds)}
          </Button>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Button
            variant="secondary"
            size="icon"
            aria-label="15 seconds less"
            onClick={() => onChange(Math.max(0, seconds - 15))}
          >
            <Minus />
          </Button>
          <p className="w-32 text-center num text-5xl font-bold tracking-tight" aria-live="polite">
            {formatClock(seconds)}
          </p>
          <Button
            variant="secondary"
            size="icon"
            aria-label="15 seconds more"
            onClick={() => onChange(Math.min(1800, seconds + 15))}
          >
            <Plus />
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {REST_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                "h-11 rounded-xl border num text-sm font-semibold transition-colors",
                p === seconds ? "bg-primary text-primary-foreground border-primary" : "bg-secondary hover:bg-secondary/80",
              )}
            >
              {formatClock(p)}
            </button>
          ))}
        </div>

        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </DialogContent>
    </Dialog>
  );
}
