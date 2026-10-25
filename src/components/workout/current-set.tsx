"use client";

import { useEffect, useRef } from "react";
import { Minus, Pin, Plus, SkipForward } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { EffortPicker } from "@/components/workout/effort-picker";
import { LastTime, NumField } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { toDisplay, type Block, type UiSet } from "@/hooks/use-workout";
import { distanceUnit, formatDuration, toDistanceDisplay } from "@/lib/cardio";
import { stepFor, stepValue, type KeypadKind } from "@/lib/keypad";
import { useLoggerPrefs, weightStep } from "@/lib/logger-prefs";
import { formatClock, setLabel, workingSetNumbers } from "@/lib/workout-logic";
import { matchPrevious } from "@/lib/set-logic";
import { cn } from "@/lib/utils";
import type { EffortScale } from "@/types/database";

interface FieldSpec {
  kind: KeypadKind;
  field: "weight" | "reps" | "repsLeft" | "time" | "distance";
  label: string;
  placeholder: string;
}

/** The two numbers you enter for this kind of exercise, with last time's values as the grey hint. */
function fieldsFor(block: Block, index: number, unit: "metric" | "imperial"): FieldSpec[] {
  const set = block.sets[index];
  const prev = matchPrevious(block.sets.map((s) => s.type), block.previous)[index];
  const u = unit === "imperial" ? "lb" : "kg";
  const tracking = block.exercise.tracking ?? "weight_reps";
  const time: FieldSpec = {
    kind: "time",
    field: "time",
    label: "Time",
    placeholder: prev?.duration_seconds ? formatDuration(prev.duration_seconds) : tracking === "time" ? (block.repTarget?.split("-")[0] ?? "0:00") : "0:00",
  };
  if (tracking === "distance_time") {
    return [{ kind: "distance", field: "distance", label: distanceUnit(unit), placeholder: prev?.distance_m ? toDistanceDisplay(prev.distance_m, unit) : "0" }, time];
  }
  // Working sets fill in today's suggested weight when there is one.
  const suggested = tracking === "weight_reps" && block.suggestion && set && (set.type === "normal" || set.type === "failure" || set.type === "amrap");
  const weight: FieldSpec = {
    kind: "weight",
    field: "weight",
    label: tracking === "time" ? `+${u}` : u,
    placeholder: suggested ? String(block.suggestion!.weight) : prev ? toDisplay(prev.weight, unit) || "0" : "0",
  };
  if (tracking === "time") return [weight, time];
  const reps = (side: number | null | undefined) => (prev ? String(side ?? prev.reps) : (block.repTarget?.split("-")[0] ?? "0"));
  if (block.unilateral) {
    return [
      weight,
      { kind: "reps", field: "repsLeft", label: "Left", placeholder: set?.reps || reps(prev?.reps_left) },
      { kind: "reps", field: "reps", label: "Right", placeholder: set?.repsLeft || reps(prev?.reps_right) },
    ];
  }
  return [weight, { kind: "reps", field: "reps", label: "Reps", placeholder: reps(null) }];
}

/**
 * The set you're on, with big - / + buttons either side of each number.
 * "big" fills the screen in focus mode; "compact" sits in the bottom bar in one-handed mode.
 */
export function CurrentSetControls({
  block,
  set,
  size,
  onChange,
  onCommit,
}: {
  block: Block;
  set: UiSet;
  size: "big" | "compact";
  onChange: (patch: Partial<UiSet>) => void;
  onCommit: () => void;
}) {
  const { unit } = useAuth();
  const prefs = useLoggerPrefs();
  const index = block.sets.indexOf(set);
  const fields = fieldsFor(block, index, unit);
  // - / + taps save once you pause, not on every tap.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        commitRef.current();
      }
    },
    [set.id],
  );

  const bump = (f: FieldSpec, sign: 1 | -1) => {
    const next = stepValue(set[f.field], f.placeholder, sign * stepFor(f.kind, weightStep(prefs, unit)), f.kind);
    onChange({ [f.field]: next });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      commitRef.current();
    }, 700);
  };

  const big = size === "big";
  return (
    <div className={cn("grid gap-2", big ? "grid-cols-1 gap-4" : "grid-cols-2")}>
      {fields.map((f) => {
        const step = stepFor(f.kind, weightStep(prefs, unit));
        const stepText = f.kind === "time" ? `${step}s` : String(step);
        return (
          <div key={f.field} className="flex flex-col gap-1">
            <p className={cn("text-muted-foreground text-center font-semibold tracking-wide uppercase", big ? "text-xs" : "text-[11px]")}>{f.label}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => bump(f, -1)}
                aria-label={`${f.label} minus ${stepText}`}
                className={cn("bg-secondary grid shrink-0 place-items-center rounded-2xl active:scale-95", big ? "size-16" : "size-12")}
              >
                <Minus className={big ? "size-7" : "size-5"} aria-hidden />
              </button>
              <div className="min-w-0 flex-1 [&_input]:w-full">
                <NumField
                  fieldKey={`${set.id}:${f.field}:${size}`}
                  kind={f.kind}
                  label={f.kind === "reps" ? (f.label === "Reps" ? "Reps" : `${f.label} reps`) : f.label === "Time" ? "Time (min:sec)" : `Weight · ${f.label}`}
                  ariaLabel={f.label}
                  value={set[f.field]}
                  placeholder={f.placeholder}
                  onValue={(v) => onChange({ [f.field]: f.kind === "reps" ? v.replace(/\D/g, "") : v })}
                  onCommit={onCommit}
                  className={big ? "h-20 text-5xl" : "h-12 text-xl"}
                />
              </div>
              <button
                type="button"
                onClick={() => bump(f, 1)}
                aria-label={`${f.label} plus ${stepText}`}
                className={cn("bg-primary/20 text-primary-text grid shrink-0 place-items-center rounded-2xl active:scale-95", big ? "size-16" : "size-12")}
              >
                <Plus className={big ? "size-7" : "size-5"} aria-hidden />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "Set 2 of 4" (warm-ups say "Warm-up"). */
export function setTitle(block: Block, set: UiSet): string {
  const i = block.sets.indexOf(set);
  const n = workingSetNumbers(block.sets.map((s) => s.type))[i];
  const working = block.sets.filter((s) => s.type === "normal").length;
  const label = setLabel(set.type, n);
  if (set.type === "warmup") return "Warm-up set";
  if (set.type === "drop") return "Drop set";
  if (set.type === "failure") return "To failure";
  if (set.type === "amrap") return "AMRAP: as many reps as you can";
  return `Set ${label} of ${working}`;
}

/**
 * Focus mode: nothing but the set you're on and the rest timer, big enough
 * to read from the bench.
 */
export function FocusView({
  block,
  set,
  upNext,
  onChange,
  onCommit,
  effort,
}: {
  block: Block;
  set: UiSet | null;
  /** "How hard was it?" for the set you just finished, when it's waiting for an answer. */
  effort?: { scale: EffortScale; onPick: (rpe: number) => void; onSkip: () => void } | null;
  upNext: string | null;
  onChange: (patch: Partial<UiSet>) => void;
  onCommit: () => void;
}) {
  const { unit } = useAuth();
  const { timer, remaining, adjust, stop, setInline } = useRestTimer();
  useEffect(() => {
    setInline(true);
    return () => setInline(false);
  }, [setInline]);

  const prev = set ? matchPrevious(block.sets.map((s) => s.type), block.previous)[block.sets.indexOf(set)] : undefined;
  const tracking = block.exercise.tracking ?? "weight_reps";
  const resting = !!timer && remaining > 0;

  return (
    <section className="glass flex flex-col gap-5 rounded-3xl p-5" data-testid="focus-view">
      <div className="text-center">
        <h2 className="text-2xl leading-tight font-bold">{block.exercise.name}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {set ? setTitle(block, set) : "All sets done"}
          {prev && tracking === "weight_reps" && (
            <>
              {" "}· Last time{" "}
              <span className="num text-foreground font-semibold">
                <LastTime text={`${toDisplay(prev.weight, unit) || 0}×${prev.reps}`} />
              </span>
            </>
          )}
        </p>
        {block.note && (
          <p className="text-foreground/90 mt-2 inline-flex items-start gap-1.5 text-sm" data-testid="exercise-note">
            <Pin className="text-set-warmup mt-0.5 size-4 shrink-0" aria-hidden /> {block.note}
          </p>
        )}
      </div>

      {effort && <EffortPicker scale={effort.scale} onPick={effort.onPick} onSkip={effort.onSkip} />}

      {timer && (
        <div
          role="timer"
          aria-live="polite"
          className={cn("flex flex-col items-center gap-3 rounded-2xl py-4", resting ? "bg-primary/15" : "bg-primary text-primary-foreground")}
        >
          <p className={cn("text-sm font-semibold", resting && "text-muted-foreground")}>{resting ? "Resting" : "Rest over. Next set!"}</p>
          <p className="num text-7xl leading-none font-bold">{formatClock(remaining)}</p>
          {resting && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => adjust(-15)} aria-label="15 seconds less">
                <Minus /> 15
              </Button>
              <Button variant="secondary" onClick={() => adjust(15)} aria-label="15 seconds more">
                <Plus /> 15
              </Button>
              <Button variant="ghost" onClick={stop} aria-label="Skip rest">
                <SkipForward /> Skip
              </Button>
            </div>
          )}
        </div>
      )}

      {set ? (
        <CurrentSetControls block={block} set={set} size="big" onChange={onChange} onCommit={onCommit} />
      ) : (
        <p className="text-muted-foreground text-center">Tap Next exercise below when you&apos;re ready.</p>
      )}

      {upNext && <p className="text-muted-foreground text-center text-sm">Up next: {upNext}</p>}
    </section>
  );
}
