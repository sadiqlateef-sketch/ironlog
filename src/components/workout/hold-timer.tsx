"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buzz } from "@/lib/native";
import { formatClock } from "@/lib/workout-logic";

/**
 * Stopwatch for a timed hold (plank, wall sit, dead hang). Buzzes when you
 * reach the target; Stop logs the time on the next set.
 */
export function HoldTimer({
  open,
  onOpenChange,
  exerciseName,
  targetSeconds,
  onLog,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  targetSeconds: number | null;
  onLog: (seconds: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hold timer</DialogTitle>
          <DialogDescription>
            {exerciseName}
            {targetSeconds ? ` · target ${formatClock(targetSeconds)}` : ""}. Stop when you let go and it&apos;s logged.
          </DialogDescription>
        </DialogHeader>
        {open && <Stopwatch target={targetSeconds} onLog={(s) => (onLog(s), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  );
}

function Stopwatch({ target, onLog }: { target: number | null; onLog: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef(false);
  const elapsed = startedAt == null ? 0 : Math.floor((now - startedAt) / 1000);

  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (target && elapsed >= target && !buzzed.current) {
      buzzed.current = true;
      if (!buzz()) navigator.vibrate?.(300);
    }
  }, [elapsed, target]);

  const reached = target != null && elapsed >= target;
  return (
    <>
      <p
        className={`text-center text-6xl font-bold tracking-tight tabular-nums ${reached ? "text-success" : ""}`}
        aria-live="off"
        data-testid="hold-clock"
      >
        {formatClock(elapsed)}
      </p>
      {startedAt == null ? (
        <Button
          size="lg"
          onClick={() => {
            const t = Date.now();
            setNow(t);
            setStartedAt(t);
          }}
        >
          <Play /> Start
        </Button>
      ) : (
        <Button size="lg" onClick={() => onLog(Math.max(1, elapsed))}>
          <Square /> Stop and log {formatClock(Math.max(1, elapsed))}
        </Button>
      )}
    </>
  );
}
