import { PersonStanding } from "lucide-react";
import type { Exercise } from "@/lib/workout-api";
import { MUSCLE_LABELS } from "@/lib/labels";

/**
 * Form demo for an exercise. Shows the GIF/video when exercises.animation_url
 * is set, otherwise a placeholder so the layout is final today.
 */
export function ExerciseAnimation({ exercise }: { exercise: Exercise }) {
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

  return (
    <div className="bg-secondary flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
      <PersonStanding className="text-muted-foreground size-12" strokeWidth={1.5} />
      <p className="text-muted-foreground text-xs">
        Form demo coming soon · {MUSCLE_LABELS[exercise.primary_muscle]}
      </p>
    </div>
  );
}
