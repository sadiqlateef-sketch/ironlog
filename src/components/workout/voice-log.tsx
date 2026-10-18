"use client";

// Log a set by saying it: tap the mic, say "bench 185 for 8", and it's ticked
// off on that exercise's next set (or the one you're on, if you don't name
// one). The words are read right here on the phone, so it works with no
// signal too when your phone can turn speech into text offline. Undo puts
// the set back the way it was.

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Undo2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import type { useWorkout } from "@/hooks/use-workout";
import { canDictate, startDictation, type Dictation } from "@/lib/speech";
import { kgToLb, lbToKg } from "@/lib/units";
import { parseSpokenSet } from "@/lib/voice-set";
import { tap } from "@/lib/native";
import { cn } from "@/lib/utils";

type Workout = ReturnType<typeof useWorkout>;

type Status =
  | { kind: "idle" }
  | { kind: "listening"; heard: string }
  | { kind: "logged"; text: string; undo: () => Promise<void> }
  | { kind: "error"; text: string };

const round = (n: number) => String(Math.round(n * 2) / 2);

export function VoiceLogButton({
  w,
  current,
  onLogged,
}: {
  w: Workout;
  /** The exercise you're on (its order), used when you don't say one. */
  current: number | null;
  /** Called with the exercise a set was logged on, so the screen can follow it. */
  onLogged: (order: number) => void;
}) {
  const { unit } = useAuth();
  const restTimer = useRestTimer();
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dictation = useRef<Dictation | null>(null);
  const heard = useRef("");
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    canDictate().then(setAvailable).catch(() => {});
    return () => {
      dictation.current?.stop();
      clearTimeout(hide.current);
    };
  }, []);

  function show(s: Status, ms = 6000) {
    clearTimeout(hide.current);
    setStatus(s);
    if (s.kind !== "listening") hide.current = setTimeout(() => setStatus({ kind: "idle" }), ms);
  }

  async function log(text: string) {
    const blocks = w.blocksNow();
    const parsed = parseSpokenSet(
      text,
      blocks.map((b) => ({ key: b.order, name: b.exercise.name, aliases: b.exercise.aliases })),
    );
    if (!parsed) return show({ kind: "error", text: `Heard "${text}". Try "185 for 8".` });
    if (parsed.unknownExercise) return show({ kind: "error", text: `Heard "${text}", but that exercise isn't in this workout.` });

    const order = parsed.exercise ?? current ?? blocks.find((b) => b.sets.some((s) => !s.done))?.order ?? null;
    const block = blocks.find((b) => b.order === order);
    if (order == null || !block) return show({ kind: "error", text: "Add an exercise first, then say your set." });
    if (block.exercise.tracking !== "weight_reps") {
      return show({ kind: "error", text: `Voice works for weight and reps. Type ${block.exercise.name} in.` });
    }
    if (parsed.reps == null || parsed.reps <= 0) {
      return show({ kind: "error", text: `Heard ${parsed.weight ?? text} but no reps. Try "${parsed.weight ?? 185} for 8".` });
    }

    // The exercise's next set, or a new one when they're all done.
    let set = block.sets.find((s) => !s.done);
    let added = false;
    if (!set) {
      await w.addSet(order);
      set = w.blocksNow().find((b) => b.order === order)?.sets.at(-1);
      if (!set || set.done) return show({ kind: "error", text: "Couldn't add a set. Try again." });
      added = true;
    }

    // Said in the other unit ("60 kilos" in a pounds app): convert and round to a loadable half.
    const mine = unit === "imperial" ? "lb" : "kg";
    const said = parsed.unit ?? mine;
    const weight =
      parsed.weight == null ? null : said === mine ? String(parsed.weight) : round(said === "kg" ? kgToLb(parsed.weight) : lbToKg(parsed.weight));

    const id = set.id;
    const before = { weight: set.weight, reps: set.reps };
    w.patchSet(order, id, { ...(weight != null && { weight }), reps: String(parsed.reps) });
    const ok = await w.toggleDone(order, id);
    if (!ok) return show({ kind: "error", text: "Couldn't log that set. Try again." });
    tap();
    onLogged(order);

    const now = w.blocksNow().find((b) => b.order === order)?.sets.find((s) => s.id === id);
    const unitLabel = unit === "imperial" ? "lb" : "kg";
    const shown = now?.weight && Number(now.weight) > 0 ? `${now.weight} ${unitLabel} × ${now.reps}` : `${now?.reps ?? parsed.reps} reps`;
    show(
      {
        kind: "logged",
        text: `${block.exercise.name}: ${shown}`,
        undo: async () => {
          restTimer.stop();
          if (added) return w.removeSet(order, id);
          await w.toggleDone(order, id);
          w.patchSet(order, id, before);
          await w.commitSet(order, id);
        },
      },
      8000,
    );
  }

  async function toggle() {
    if (status.kind === "listening") {
      dictation.current?.stop();
      return;
    }
    tap();
    heard.current = "";
    show({ kind: "listening", heard: "" });
    let failed = false;
    dictation.current = await startDictation(
      {
        onText: (t) => {
          heard.current = t;
          setStatus({ kind: "listening", heard: t });
        },
        onError: (message) => {
          failed = true;
          show({ kind: "error", text: message });
        },
        onEnd: () => {
          dictation.current = null;
          const text = heard.current.trim();
          if (text) log(text);
          else if (!failed) setStatus({ kind: "idle" });
        },
      },
      { once: true },
    );
  }

  if (!available) return null;
  const listening = status.kind === "listening";

  return (
    <>
      {status.kind !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          data-testid="voice-status"
          className={cn(
            "glass-strong absolute -top-14 right-3 left-3 flex min-h-11 items-center gap-2 rounded-full py-1 pr-1 pl-4 text-sm font-semibold",
            status.kind === "error" && "text-set-warmup",
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {status.kind === "listening" ? status.heard || 'Listening… say "185 for 8"' : status.text}
          </span>
          {status.kind === "logged" && (
            <button
              type="button"
              onClick={() => {
                const undo = status.undo;
                setStatus({ kind: "idle" });
                undo();
              }}
              className="bg-secondary flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3"
            >
              <Undo2 className="size-4" aria-hidden /> Undo
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "Stop listening" : "Say your set"}
        aria-pressed={listening}
        data-testid="voice-log"
        className={cn(
          "glass-strong grid size-14 shrink-0 place-items-center rounded-2xl",
          listening && "bg-destructive text-white",
        )}
      >
        {listening ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
      </button>
    </>
  );
}
