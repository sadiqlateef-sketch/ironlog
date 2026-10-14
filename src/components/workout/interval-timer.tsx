"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buzz } from "@/lib/native";
import { formatClock, intervalPhase } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

function beep(times: number) {
  try {
    if (!buzz()) navigator.vibrate?.(200);
  } catch {}
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.15);
    }
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

/** Timed work/rest rounds, e.g. 40 s on, 20 s off, 8 rounds. */
export function IntervalTimer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [work, setWork] = useState(40);
  const [rest, setRest] = useState(20);
  const [rounds, setRounds] = useState(8);
  // Like the rest timer, store when it started rather than counting down,
  // so it stays right if the phone sleeps.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastPhase = useRef<string>("");

  const running = startedAt != null && pausedAt == null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = startedAt == null ? 0 : ((pausedAt ?? now) - startedAt) / 1000;
  const state = intervalPhase(elapsed, work, rest, rounds);

  // Beep when the phase changes: two for "go", one for "rest", three when done.
  useEffect(() => {
    if (startedAt == null) return;
    const key = `${state.phase}-${state.round}`;
    if (key === lastPhase.current) return;
    lastPhase.current = key;
    beep(state.phase === "work" ? 2 : state.phase === "rest" ? 1 : 3);
  }, [state.phase, state.round, startedAt]);

  function reset() {
    setStartedAt(null);
    setPausedAt(null);
    lastPhase.current = "";
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o || reset(), onOpenChange(o))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Interval timer</DialogTitle>
          <DialogDescription>Work and rest rounds, with beeps so you don&apos;t have to watch the screen.</DialogDescription>
        </DialogHeader>
        {startedAt == null ? (
          <>
            <Stepper label="Work" value={formatClock(work)} onMinus={() => setWork(Math.max(5, work - 5))} onPlus={() => setWork(work + 5)} />
            <Stepper label="Rest" value={formatClock(rest)} onMinus={() => setRest(Math.max(0, rest - 5))} onPlus={() => setRest(rest + 5)} />
            <Stepper label="Rounds" value={String(rounds)} onMinus={() => setRounds(Math.max(1, rounds - 1))} onPlus={() => setRounds(rounds + 1)} />
            <Button size="lg" onClick={() => (setNow(Date.now()), setStartedAt(Date.now()))}>
              <Play /> Start
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2" aria-live="polite">
            <p
              className={cn(
                "text-sm font-bold tracking-widest uppercase",
                state.phase === "work" ? "text-success" : state.phase === "rest" ? "text-set-warmup" : "text-primary-text",
              )}
            >
              {state.phase === "done" ? "Done" : state.phase === "work" ? "Work" : "Rest"}
            </p>
            <p className="font-mono text-7xl font-extrabold tracking-tight">{formatClock(state.left)}</p>
            <p className="text-muted-foreground text-sm">
              Round {state.round} of {rounds}
            </p>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="secondary" onClick={reset}>
                <RotateCcw /> Reset
              </Button>
              {state.phase !== "done" &&
                (pausedAt == null ? (
                  <Button onClick={() => setPausedAt(Date.now())}>
                    <Pause /> Pause
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setStartedAt(startedAt + (Date.now() - pausedAt));
                      setPausedAt(null);
                      setNow(Date.now());
                    }}
                  >
                    <Play /> Resume
                  </Button>
                ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground w-20 text-sm font-semibold">{label}</span>
      <Button variant="secondary" size="icon" aria-label={`Less ${label.toLowerCase()}`} onClick={onMinus}>
        <Minus />
      </Button>
      <span className="flex-1 text-center font-mono text-2xl font-extrabold">{value}</span>
      <Button variant="secondary" size="icon" aria-label={`More ${label.toLowerCase()}`} onClick={onPlus}>
        <Plus />
      </Button>
    </div>
  );
}
