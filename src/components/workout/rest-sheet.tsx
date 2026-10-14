"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REST_PRESETS, formatClock } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

/** Pick how long to rest after each set of this exercise. */
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rest timer</DialogTitle>
          <DialogDescription>Starts by itself after each set of {exerciseName}. Remembered for next time.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-4">
          <Button variant="secondary" size="icon" aria-label="15 seconds less" onClick={() => onChange(Math.max(0, seconds - 15))}>
            <Minus />
          </Button>
          <p className="w-32 text-center font-mono text-5xl font-extrabold tracking-tight" aria-live="polite">
            {formatClock(seconds)}
          </p>
          <Button variant="secondary" size="icon" aria-label="15 seconds more" onClick={() => onChange(Math.min(1800, seconds + 15))}>
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
                "h-11 rounded-xl border font-mono text-sm font-semibold",
                p === seconds ? "bg-primary text-primary-foreground border-primary" : "bg-secondary",
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
