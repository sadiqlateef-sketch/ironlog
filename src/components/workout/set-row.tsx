"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Check, StickyNote, Trash2, Undo2, X } from "lucide-react";
import type { UiSet } from "@/hooks/use-workout";
import { useKeypad, type KeypadField } from "@/components/workout/keypad";
import { formatDuration, parseDuration } from "@/lib/cardio";
import type { KeypadKind } from "@/lib/keypad";
import { tap } from "@/lib/native";
import type { Tracking } from "@/types/database";
import { setLabel } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

const typeStyles = {
  normal: "bg-secondary text-foreground",
  warmup: "bg-set-warmup/20 text-set-warmup",
  drop: "bg-set-drop/20 text-set-drop",
  failure: "bg-set-failure/20 text-set-failure",
  amrap: "bg-set-amrap/20 text-set-amrap",
} as const;

/** Set · Last time · weight · reps · done. The header and "add set" rows use the same columns. */
export const ROW_GRID = "grid grid-cols-[2.5rem_1fr_4.75rem_4rem_3.5rem] items-center gap-2";
/** One side at a time: Set · weight · left reps · right reps · done. */
export const SIDES_GRID = "grid grid-cols-[2.5rem_4.75rem_1fr_1fr_3.5rem] items-center gap-2";

const inputClass =
  "num h-14 w-full min-w-0 rounded-xl bg-secondary text-center text-xl font-bold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-100";

/** How far to drag a row before letting go completes or deletes it. */
const SWIPE = 72;
const LONG_PRESS_MS = 450;

/** "160×5" with a spaced, quieter "×". `tight` drops the spaces for narrow columns. */
export function LastTime({ text, tight }: { text: string; tight?: boolean }) {
  const [a, b] = text.split("×");
  if (b === undefined) return <>{text}</>;
  const gap = tight ? "" : " ";
  return (
    <>
      {a}
      <span className="text-muted-foreground/80 font-normal">{`${gap}×${gap}`}</span>
      {b}
    </>
  );
}

export function SetRow({
  set,
  workingNumber,
  weightPlaceholder,
  previousText,
  repPlaceholder,
  tracking = "weight_reps",
  timePlaceholder = "0:00",
  distancePlaceholder = "0",
  weightUnit,
  distanceLabel,
  sides = false,
  leftPlaceholder = "0",
  effort = null,
  current,
  editing,
  onChange,
  onCommit,
  onCycleType,
  onToggleDone,
  onRemove,
  onLongPress,
}: {
  set: UiSet;
  workingNumber: number;
  weightPlaceholder: string;
  previousText: string;
  repPlaceholder: string;
  /** weight_reps: weight + reps; time: added weight + time; distance_time: distance + time. */
  tracking?: Tracking;
  timePlaceholder?: string;
  distancePlaceholder?: string;
  /** "lb" / "kg", for the number pad's label. */
  weightUnit: string;
  /** "mi" / "km" */
  distanceLabel: string;
  /** One side at a time: left and right reps instead of "last time" and reps. */
  sides?: boolean;
  leftPlaceholder?: string;
  /** How hard it was ("2" reps left or RPE "8"), shown on the tick. */
  effort?: string | null;
  /** The next set to do: highlighted so it is easy to find mid-workout. */
  current: boolean;
  editing: boolean;
  onChange: (patch: Partial<UiSet>) => void;
  onCommit: () => void;
  onCycleType: () => void;
  onToggleDone: () => Promise<boolean>;
  onRemove: () => void;
  /** Hold the row: duplicate, warm-up, drop set... */
  onLongPress: () => void;
}) {
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const secondRef = useRef<HTMLInputElement>(null);
  const swipe = useSwipe({
    onRight: () => done(),
    onLeft: onRemove,
    onLongPress,
  });

  async function done() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await onToggleDone();
      if (!ok) {
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const logNext = { label: set.done ? "Done" : "Log set", run: () => (blurActive(), !set.done && done()) };
  const leftRef = useRef<HTMLInputElement>(null);
  const toSecond = sides
    ? { label: "Left reps", run: () => leftRef.current?.focus() }
    : { label: tracking === "weight_reps" ? "Reps" : "Time", run: () => secondRef.current?.focus() };

  return (
    <div className="relative overflow-hidden rounded-xl" data-testid="set-row">
      {swipe.offset !== 0 && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-between rounded-xl text-sm font-bold">
          <span
            className={cn(
              "flex h-full flex-1 items-center gap-2 px-4 transition-colors",
              swipe.offset > 0 && (swipe.offset >= SWIPE ? "bg-success text-[#08200d]" : "bg-success/25 text-success"),
            )}
          >
            {swipe.offset > 0 && (set.done ? <><Undo2 className="size-5" /> Undo</> : <><Check className="size-5" strokeWidth={3} /> Done</>)}
          </span>
          <span
            className={cn(
              "flex h-full flex-1 items-center justify-end gap-2 px-4 transition-colors",
              swipe.offset < 0 && (swipe.offset <= -SWIPE ? "bg-[#c4282d] text-white" : "bg-destructive/25 text-destructive"),
            )}
          >
            {swipe.offset < 0 && <><Trash2 className="size-5" /> Delete</>}
          </span>
        </div>
      )}
      <div
        {...swipe.handlers}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
        className={cn(
          sides ? SIDES_GRID : ROW_GRID,
          "relative touch-pan-y rounded-xl px-1 py-1 select-none",
          !swipe.dragging && "transition-[transform,background-color] duration-200",
          swipe.offset !== 0 && "bg-[var(--card-solid)]",
          set.done && "bg-success/10",
          current && "bg-primary/15 ring-primary/60 ring-1",
          shake && "ring-destructive animate-pulse ring-2",
        )}
      >
        <button
          type="button"
          onClick={onCycleType}
          aria-label={`Set ${workingNumber}, type ${set.type}. Tap to change type, hold for more.`}
          className={cn("num relative h-12 rounded-xl text-base font-bold", typeStyles[set.type])}
        >
          {setLabel(set.type, workingNumber)}
          {set.note && <StickyNote data-testid="set-note-icon" aria-label="Has a note" className="absolute right-0.5 top-0.5 size-3 opacity-80" />}
        </button>

        {!sides && (
          <span
            className="num text-muted-foreground truncate text-center text-sm font-semibold"
            title={set.type === "warmup" ? "Plates per side" : "Last time"}
          >
            <LastTime text={previousText} tight />
          </span>
        )}

        {tracking === "distance_time" ? (
          <NumField
            fieldKey={`${set.id}:distance`}
            kind="distance"
            label={`Distance · ${distanceLabel}`}
            ariaLabel="Distance"
            value={set.distance}
            placeholder={distancePlaceholder}
            onValue={(distance) => onChange({ distance })}
            onCommit={onCommit}
            next={toSecond}
          />
        ) : (
          <NumField
            fieldKey={`${set.id}:weight`}
            kind="weight"
            label={tracking === "time" ? `Added weight · ${weightUnit}` : `Weight · ${weightUnit}`}
            ariaLabel={tracking === "time" ? "Added weight" : "Weight"}
            value={set.weight}
            placeholder={weightPlaceholder}
            onValue={(weight) => onChange({ weight })}
            onCommit={onCommit}
            next={toSecond}
          />
        )}
        {sides && (
          <NumField
            fieldKey={`${set.id}:left`}
            kind="reps"
            label="Left reps"
            ariaLabel="Left reps"
            inputRef={leftRef}
            value={set.repsLeft}
            placeholder={leftPlaceholder}
            onValue={(repsLeft) => onChange({ repsLeft: repsLeft.replace(/\D/g, "") })}
            onCommit={onCommit}
            next={{ label: "Right reps", run: () => secondRef.current?.focus() }}
          />
        )}
        {tracking === "weight_reps" ? (
          <NumField
            fieldKey={`${set.id}:reps`}
            kind="reps"
            label={sides ? "Right reps" : "Reps"}
            ariaLabel={sides ? "Right reps" : "Reps"}
            inputRef={secondRef}
            value={set.reps}
            placeholder={repPlaceholder}
            onValue={(reps) => onChange({ reps: reps.replace(/\D/g, "") })}
            onCommit={onCommit}
            next={logNext}
            onEnter={done}
          />
        ) : (
          <NumField
            fieldKey={`${set.id}:time`}
            kind="time"
            label="Time (min:sec)"
            ariaLabel="Time (seconds or minutes:seconds)"
            inputRef={secondRef}
            className="text-base"
            value={set.time}
            placeholder={timePlaceholder}
            onValue={(time) => onChange({ time: time.replace(/[^\d:]/g, "") })}
            onCommit={() => {
              // "90" reads as 1:30.
              const sec = parseDuration(set.time);
              if (sec != null) onChange({ time: formatDuration(sec) });
              onCommit();
            }}
            next={logNext}
            onEnter={done}
          />
        )}

        {editing ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Delete set"
            className="bg-destructive/20 text-destructive grid h-14 w-full place-items-center rounded-xl"
          >
            <X className="size-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={done}
            disabled={submitting}
            aria-busy={submitting}
            aria-label={set.done ? `Mark set not done${effort ? ` (effort ${effort})` : ""}` : "Complete set"}
            aria-pressed={set.done}
            className={cn(
              "relative grid h-14 w-full place-items-center rounded-xl transition-colors",
              set.done ? "bg-success text-[#08200d] animate-set-stamp" : "bg-secondary text-muted-foreground active:scale-95",
              "transition-all",
              submitting && "opacity-75 cursor-not-allowed pointer-events-none",
            )}
          >
            <Check className="size-7" strokeWidth={3} />
            {set.done && effort && (
              <span
                className="num bg-background text-foreground absolute top-0.5 right-0.5 min-w-5 rounded-full px-1 text-[11px] leading-5 font-bold"
                data-testid="effort-badge"
              >
                {effort}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function blurActive() {
  (document.activeElement as HTMLElement | null)?.blur();
}

/** A weight / reps / time box. With the Ironlog pad on, the phone keyboard stays hidden. */
export function NumField({
  fieldKey,
  kind,
  label,
  ariaLabel,
  value,
  placeholder,
  onValue,
  onCommit,
  next,
  onEnter,
  inputRef,
  className,
}: {
  fieldKey: string;
  kind: KeypadKind;
  label: string;
  ariaLabel: string;
  value: string;
  placeholder: string;
  onValue: (v: string) => void;
  onCommit: () => void;
  next?: KeypadField["next"];
  onEnter?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}) {
  const keypad = useKeypad();
  // The pad reads the newest value on every key, even between renders.
  const latest = useRef({ value, placeholder, onValue });
  useEffect(() => {
    latest.current = { value, placeholder, onValue };
  });
  const active = keypad.active === fieldKey;

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      inputMode={keypad.enabled ? "none" : kind === "reps" ? "numeric" : kind === "time" ? "numeric" : "decimal"}
      className={cn(inputClass, active && "ring-primary bg-primary/15 ring-2", className)}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      onBlur={() => {
        onCommit();
        keypad.close(fieldKey);
      }}
      onFocus={(e) => {
        e.target.select();
        if (!keypad.enabled) return;
        const el = e.target;
        keypad.open({
          key: fieldKey,
          kind,
          label,
          get: () => latest.current.value,
          placeholder: () => latest.current.placeholder,
          set: (v) => {
            latest.current.value = v;
            latest.current.onValue(v);
          },
          next,
        });
        // Keep the row above the pad.
        setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          (e.target as HTMLInputElement).blur();
          onEnter();
        }
      }}
    />
  );
}

/**
 * Swipe a row right to complete it or left to delete it, and hold it for more
 * options. Vertical drags are left to the page so scrolling still works.
 */
function useSwipe({ onRight, onLeft, onLongPress }: { onRight: () => void; onLeft: () => void; onLongPress: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const mode = useRef<"idle" | "swipe" | "scroll">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallowClick = useRef(false);
  const pressedAt = useRef(0);
  const crossed = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const longPress = () => {
    // Android also fires a context menu on a long touch; only open once.
    if (Date.now() - pressedAt.current < 800) return;
    pressedAt.current = Date.now();
    swallowClick.current = true;
    tap();
    onLongPress();
  };
  const reset = () => {
    clearTimer();
    start.current = null;
    mode.current = "idle";
    crossed.current = false;
    setDragging(false);
    setOffset(0);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      mode.current = "idle";
      swallowClick.current = false;
      clearTimer();
      timer.current = setTimeout(longPress, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId || mode.current === "scroll") return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (mode.current === "idle") {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          mode.current = "scroll";
          clearTimer();
          return;
        }
        if (Math.abs(dx) < 12) return;
        mode.current = "swipe";
        clearTimer();
        setDragging(true);
        // A swipe that started on a number box shouldn't leave it open for typing.
        const el = e.currentTarget as HTMLElement;
        if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }
      const clamped = Math.max(-130, Math.min(130, dx));
      const over = Math.abs(clamped) >= SWIPE;
      if (over !== crossed.current) {
        crossed.current = over;
        if (over) tap();
      }
      setOffset(clamped);
    },
    onPointerUp: () => {
      const wasSwipe = mode.current === "swipe";
      const final = offset;
      reset();
      if (!wasSwipe) return;
      swallowClick.current = true;
      if (final >= SWIPE) onRight();
      else if (final <= -SWIPE) onLeft();
    },
    onPointerCancel: reset,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clearTimer();
      if (mode.current !== "swipe") longPress();
    },
    // A swipe or hold shouldn't also count as a tap on the button under it.
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return { offset, dragging, handlers };
}

