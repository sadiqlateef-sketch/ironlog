"use client";

import { useEffect, useState } from "react";
import { PersonStanding } from "lucide-react";
import type { Exercise } from "@/lib/workout-api";
import { MUSCLE_LABELS } from "@/lib/labels";

/**
 * Form demo for an exercise: the GIF/video in exercises.animation_url if set,
 * else the start and end photos flipping back and forth, else a placeholder.
 */
export function ExerciseAnimation({ exercise }: { exercise: Exercise }) {
  const frames = exercise.image_urls;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frames.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1200);
    return () => clearInterval(t);
  }, [frames.length]);

  if (exercise.animation_url) {
    const isVideo = /\.(mp4|webm)$/i.test(exercise.animation_url);
    return isVideo ? (
      <video
        src={exercise.animation_url}
        autoPlay
        loop
        muted
        playsInline
        className="aspect-square w-full rounded-xl bg-black object-contain"
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={exercise.animation_url}
        alt={`${exercise.name} form demonstration`}
        className="aspect-square w-full rounded-xl bg-white object-contain"
      />
    );
  }

  if (frames.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={frames[frame % frames.length]}
        alt={`${exercise.name}: ${frame % 2 ? "end" : "start"} position`}
        className="aspect-[4/3] w-full rounded-2xl bg-white object-cover"
      />
    );
  }

  return (
    <div className="bg-secondary flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
      <PersonStanding className="text-muted-foreground size-12" strokeWidth={1.5} />
      <p className="text-muted-foreground text-xs">
        Form demo coming soon · {MUSCLE_LABELS[exercise.primary_muscle]}
      </p>
    </div>
  );
}
