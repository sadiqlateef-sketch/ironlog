"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Minimize2, Minus, Plus, SkipForward, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { EffortPicker } from "@/components/workout/effort-picker";
import { LastTime, NumField } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import type { Block, UiSet } from "@/hooks/use-workout";
import { toDisplay } from "@/hooks/use-workout";
import { setTitle } from "@/components/workout/current-set";
import { formatClock } from "@/lib/workout-logic";
import { matchPrevious, platesText } from "@/lib/set-logic";
import { stepFor, stepValue } from "@/lib/keypad";
import { useLoggerPrefs, weightStep } from "@/lib/logger-prefs";
import { calculatePlates } from "@/lib/plates";
import { PLATE_LOADED } from "@/lib/labels";
import { ownedPlates } from "@/lib/plates";
import { tap } from "@/lib/native";
import { cn } from "@/lib/utils";
import type { EffortScale } from "@/types/database";

export function FlowStateView({
  blocks,
  currentBlock,
  currentSet,
  onExit,
  onSelectBlock,
  onPatchSet,
  onCommitSet,
  onLogSet,
  effort,
}: {
  blocks: Block[];
  currentBlock: Block | null;
  currentSet: UiSet | null;
  onExit: () => void;
  onSelectBlock: (order: number) => void;
  onPatchSet: (order: number, setId: string, patch: Partial<UiSet>) => void;
  onCommitSet: (order: number, setId: string) => void;
  onLogSet: () => void;
  effort?: { scale: EffortScale; onPick: (rpe: number) => void; onSkip: () => void } | null;
}) {
  const { unit, profile } = useAuth();
  const prefs = useLoggerPrefs();
  const { timer, remaining, adjust, stop } = useRestTimer();
  const [logging, setLogging] = useState(false);

  // Overall workout completion metrics
  const totalSets = blocks.reduce((acc, b) => acc + b.sets.length, 0);
  const doneSets = blocks.reduce((acc, b) => acc + b.sets.filter((s) => s.done).length, 0);
  const u = unit === "imperial" ? "lb" : "kg";

  const resting = !!timer && remaining > 0;
  const isPlateLoaded = currentBlock ? PLATE_LOADED.includes(currentBlock.exercise.equipment) : false;
  const { bar, plates: owned } = ownedPlates(profile, unit);

  // Calculate plates if plate loaded
  const currentWeightNum = currentSet?.weight ? Number(currentSet.weight) : 0;
  const plateBreakdown =
    isPlateLoaded && currentWeightNum > bar ? calculatePlates(currentWeightNum, bar, owned) : null;

  const prev =
    currentBlock && currentSet
      ? matchPrevious(currentBlock.sets.map((s) => s.type), currentBlock.previous)[currentBlock.sets.indexOf(currentSet)]
      : undefined;

  async function handleLog() {
    if (logging) return;
    tap();
    setLogging(true);
    await onLogSet();
    setLogging(false);
  }

  const bump = (field: "weight" | "reps", sign: 1 | -1) => {
    if (!currentBlock || !currentSet) return;
    const kind = field === "weight" ? "weight" : "reps";
    const step = stepFor(kind, weightStep(prefs, unit));
    const next = stepValue(currentSet[field], "0", sign * step, kind);
    onPatchSet(currentBlock.order, currentSet.id, { [field]: next });
    onCommitSet(currentBlock.order, currentSet.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-2xl text-foreground p-4 pb-8 select-none transition-all">
      {/* Top Controls: Exit & Overall Progress */}
      <header className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onExit}
          className="gap-1.5 rounded-full text-xs font-semibold bg-secondary/80 border border-border/60 hover:bg-secondary"
        >
          <Minimize2 className="size-3.5" />
          Exit Flow State
        </Button>

        {/* Mini progress tracker */}
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="num font-bold text-foreground">
            {doneSets}/{totalSets} sets
          </span>
          <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>

      {/* Exercise Navigation Bar */}
      <nav className="flex items-center gap-1.5 overflow-x-auto py-3 no-scrollbar" aria-label="Workout Exercises">
        {blocks.map((b) => {
          const isSelected = currentBlock?.order === b.order;
          const allDone = b.sets.length > 0 && b.sets.every((s) => s.done);
          return (
            <button
              key={b.order}
              type="button"
              onClick={() => onSelectBlock(b.order)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all shrink-0",
                isSelected
                  ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary-text"
                  : allDone
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {allDone && <Check className="size-3" />}
              <span className="truncate max-w-[120px]">{b.exercise.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Focus Zone */}
      <main className="flex-1 flex flex-col justify-center items-center gap-6 max-w-md mx-auto w-full my-auto">
        {currentBlock ? (
          <>
            {/* Exercise Header */}
            <div className="text-center">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary/15 text-primary-text border border-primary/30 mb-2">
                <Sparkles className="size-3" />
                {currentSet ? setTitle(currentBlock, currentSet) : "All sets completed"}
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                {currentBlock.exercise.name}
              </h1>

              {prev && (
                <p className="text-muted-foreground text-xs mt-1">
                  Last session: <span className="text-foreground font-semibold num">{toDisplay(prev.weight, unit)} {u} × {prev.reps}</span>
                </p>
              )}
            </div>

            {/* Rest Timer Overlay / Indicator if Resting */}
            {resting && (
              <div
                role="timer"
                className="w-full flex flex-col items-center justify-center p-5 rounded-3xl bg-secondary/80 border border-primary/40 shadow-xl backdrop-blur-md"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Rest Countdown
                </span>
                <span className="num text-6xl font-black text-primary-text tracking-tight my-1">
                  {formatClock(remaining)}
                </span>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => adjust(-15)} className="h-8 px-3 text-xs">
                    <Minus className="size-3" /> 15s
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => adjust(15)} className="h-8 px-3 text-xs">
                    <Plus className="size-3" /> 15s
                  </Button>
                  <Button variant="ghost" size="sm" onClick={stop} className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground">
                    <SkipForward className="size-3.5" /> Skip
                  </Button>
                </div>
              </div>
            )}

            {/* Giant Metric Fields */}
            {currentSet && !resting && (
              <div className="grid grid-cols-2 gap-4 w-full">
                {/* Weight Column */}
                <div className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-secondary/50 border border-border/80 shadow-md">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Load ({u})
                  </span>
                  <div className="flex items-center justify-between w-full gap-1">
                    <button
                      type="button"
                      onClick={() => bump("weight", -1)}
                      aria-label="Decrease weight"
                      className="size-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground active:scale-90 transition-transform"
                    >
                      <Minus className="size-5" />
                    </button>
                    <input
                      inputMode="decimal"
                      value={currentSet.weight}
                      onChange={(e) => {
                        onPatchSet(currentBlock.order, currentSet.id, { weight: e.target.value });
                        onCommitSet(currentBlock.order, currentSet.id);
                      }}
                      className="num text-4xl font-extrabold text-center bg-transparent w-24 outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => bump("weight", 1)}
                      aria-label="Increase weight"
                      className="size-12 rounded-2xl bg-primary/20 text-primary-text flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>
                  {plateBreakdown && plateBreakdown.perSide.length > 0 && (
                    <span className="text-[11px] text-muted-foreground text-center tabular-nums">
                      {platesText(plateBreakdown.perSide)} / side
                    </span>
                  )}
                </div>

                {/* Reps Column */}
                <div className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-secondary/50 border border-border/80 shadow-md">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Reps
                  </span>
                  <div className="flex items-center justify-between w-full gap-1">
                    <button
                      type="button"
                      onClick={() => bump("reps", -1)}
                      aria-label="Decrease reps"
                      className="size-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground active:scale-90 transition-transform"
                    >
                      <Minus className="size-5" />
                    </button>
                    <input
                      inputMode="numeric"
                      value={currentSet.reps}
                      onChange={(e) => {
                        onPatchSet(currentBlock.order, currentSet.id, { reps: e.target.value.replace(/\D/g, "") });
                        onCommitSet(currentBlock.order, currentSet.id);
                      }}
                      className="num text-4xl font-extrabold text-center bg-transparent w-20 outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => bump("reps", 1)}
                      aria-label="Increase reps"
                      className="size-12 rounded-2xl bg-primary/20 text-primary-text flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Target: {currentBlock.repTarget || "Working set"}
                  </span>
                </div>
              </div>
            )}

            {/* Set Progression Pips */}
            <div className="flex items-center justify-center gap-2 py-1">
              {currentBlock.sets.map((s, idx) => (
                <div
                  key={s.id}
                  className={cn(
                    "size-3 rounded-full transition-all",
                    s.done
                      ? "bg-emerald-400 shadow-sm"
                      : s.id === currentSet?.id
                      ? "bg-primary ring-4 ring-primary/20 scale-125"
                      : "bg-muted-foreground/30",
                  )}
                  title={`Set ${idx + 1}`}
                />
              ))}
            </div>

            {/* Post-set RPE prompt if requested */}
            {effort && (
              <div className="w-full">
                <EffortPicker scale={effort.scale} onPick={effort.onPick} onSkip={effort.onSkip} />
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-muted-foreground">
            <p>No active exercise selected.</p>
          </div>
        )}
      </main>

      {/* Massive LOG SET Trigger */}
      <footer className="w-full max-w-md mx-auto pt-2">
        <button
          type="button"
          onClick={handleLog}
          disabled={!currentBlock || logging}
          className={cn(
            "w-full h-18 rounded-3xl font-extrabold text-lg uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-[0.98]",
            currentSet
              ? "bg-primary text-primary-foreground hover:brightness-110 shadow-primary/25"
              : "bg-emerald-500 text-white shadow-emerald-500/25",
          )}
        >
          <Check className="size-6 stroke-[3]" />
          <span>{currentSet ? "Complete Set" : "Next Exercise"}</span>
        </button>
      </footer>
    </div>
  );
}
