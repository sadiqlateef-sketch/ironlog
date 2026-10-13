"use client";

import { Minus, Plus, SkipForward } from "lucide-react";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/workout-logic";

/** Sticky bar above the bottom nav while resting. */
export function RestTimerBar() {
  const { timer, remaining, adjust, stop } = useRestTimer();
  if (!timer) return null;

  const done = remaining <= 0;
  const progress = Math.min(1, remaining / timer.duration);

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`relative overflow-hidden border-t ${done ? "bg-primary text-primary-foreground" : "bg-card"}`}
    >
      {!done && (
        <div
          className="bg-primary/15 absolute inset-y-0 left-0 transition-[width] duration-300 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      )}
      <div className="relative mx-auto flex max-w-md items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className={`text-xs ${done ? "" : "text-muted-foreground"} truncate`}>
            {done ? "Rest over. Next set!" : `Resting · ${timer.label}`}
          </p>
          <p className="font-mono text-2xl font-bold leading-tight">{formatClock(remaining)}</p>
        </div>
        {!done && (
          <>
            <Button variant="secondary" size="sm" onClick={() => adjust(-15)} aria-label="15 seconds less">
              <Minus /> 15
            </Button>
            <Button variant="secondary" size="sm" onClick={() => adjust(15)} aria-label="15 seconds more">
              <Plus /> 15
            </Button>
          </>
        )}
        <Button variant={done ? "secondary" : "ghost"} size="icon" onClick={stop} aria-label="Skip rest">
          <SkipForward />
        </Button>
      </div>
    </div>
  );
}
