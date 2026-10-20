"use client";

import { useState, useSyncExternalStore } from "react";
import { Pause, PersonStanding, Play } from "lucide-react";
import type { Exercise } from "@/lib/workout-api";
import { MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const q = matchMedia(REDUCED);
      q.addEventListener("change", on);
      return () => q.removeEventListener("change", on);
    },
    () => matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * Form demo for an exercise. In order of preference:
 *  1. the GIF/video in exercises.animation_url,
 *  2. the start and end photos cross-fading on a loop like a GIF (tap to pause;
 *     with reduced motion they sit side by side instead),
 *  3. a placeholder.
 * `compact` is the shorter version shown inline in the workout logger.
 */
export function ExerciseAnimation({ exercise, compact }: { exercise: Exercise; compact?: boolean }) {
  const frames = exercise.image_urls ?? [];
  const note = exercise.demo_note ?? null;
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  // Keyed by exercise so swapping to another exercise tries its photos again.
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === exercise.id;
  const setFailed = () => setFailedId(exercise.id);

  const box = compact ? "h-44 w-full" : "aspect-[4/3] w-full";
  const caption = note && <p className="text-muted-foreground text-xs">{note}</p>;

  if (exercise.animation_url && !failed) {
    const isVideo = /\.(mp4|webm)$/i.test(exercise.animation_url);
    return isVideo ? (
      <video
        src={exercise.animation_url}
        autoPlay={!reduced}
        controls={reduced}
        loop
        muted
        playsInline
        onError={() => setFailed()}
        className={cn(box, "rounded-xl bg-black object-contain")}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={exercise.animation_url}
        alt={`${exercise.name} form demonstration`}
        onError={() => setFailed()}
        className={cn(box, "rounded-xl bg-white object-contain")}
      />
    );
  }

  if (frames.length && !failed) {
    const [start, end] = frames;
    if (!end) {
      return (
        <figure className="flex flex-col gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={start} alt={`${exercise.name} form`} onError={() => setFailed()} className={cn(box, "rounded-2xl bg-white object-contain")} />
          {caption}
        </figure>
      );
    }

    if (reduced) {
      return (
        <figure className="flex flex-col gap-1.5" data-testid="form-demo">
          <div className="grid grid-cols-2 gap-2">
            {[start, end].map((src, i) => (
              <div key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${exercise.name}: ${i ? "end" : "start"} position`}
                  onError={() => setFailed()}
                  className={cn(compact ? "h-36" : "aspect-[4/3]", "w-full rounded-xl bg-white object-contain")}
                />
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {i ? "End" : "Start"}
                </span>
              </div>
            ))}
          </div>
          {caption}
        </figure>
      );
    }

    return (
      <figure className="flex flex-col gap-1.5" data-testid="form-demo">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? `Play ${exercise.name} form demo` : `Pause ${exercise.name} form demo`}
          aria-pressed={paused}
          className={cn(box, "relative overflow-hidden rounded-2xl bg-white")}
        >
          {/* Both frames stay loaded; the end photo fades in and out over the start one. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={start} alt={`${exercise.name} form demonstration`} onError={() => setFailed()} className="absolute inset-0 size-full object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={end}
            alt=""
            onError={() => setFailed()}
            className="demo-flip absolute inset-0 size-full object-contain"
            style={{ animationPlayState: paused ? "paused" : "running" }}
          />
          <span className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-white">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </span>
        </button>
        {caption}
      </figure>
    );
  }

  return (
    <div
      className={cn(
        compact ? "h-28" : "aspect-video",
        "bg-secondary flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed",
      )}
    >
      <PersonStanding className="text-muted-foreground size-12" strokeWidth={1.5} />
      <p className="text-muted-foreground px-4 text-center text-xs">
        {failed ? "Couldn't load the form demo. Check your connection." : `No form demo for this one yet · ${MUSCLE_LABELS[exercise.primary_muscle]}`}
      </p>
    </div>
  );
}
