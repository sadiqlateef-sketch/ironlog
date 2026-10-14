"use client";

import { useState } from "react";
import { MUSCLE_LABELS } from "@/lib/labels";
import { recoveryLabel, type MuscleRecovery } from "@/lib/recovery";
import { BACK, BodyOutline, FRONT, type Shape } from "@/components/muscle-map";
import type { MuscleGroup } from "@/types/database";

/** Recovered muscles stay the body's grey; the more tired, the warmer the red. */
export function heatColor(recovery: number): string {
  const f = Math.min(1, Math.max(0, (100 - recovery) / 100));
  return `color-mix(in oklab, var(--heat) ${Math.round(f * 100)}%, var(--body-muscle))`;
}

export function BodyHeatmap({ data }: { data: MuscleRecovery[] }) {
  const byMuscle = new Map(data.map((d) => [d.muscle, d]));
  const [active, setActive] = useState<MuscleGroup | null>(null);
  const a = active ? byMuscle.get(active) : null;

  const figure = (shapes: Shape[], title: string) => (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 200 400" className="h-auto w-full max-w-[150px]" role="group" aria-label={`${title} view`}>
        <BodyOutline />
        {shapes.map((s, i) => {
          const r = byMuscle.get(s.m);
          const pct = r?.recovery ?? 100;
          return (
            <path
              key={i}
              d={s.d}
              fill={heatColor(pct)}
              stroke={active === s.m ? "var(--foreground)" : "var(--body-base)"}
              strokeWidth={active === s.m ? 2 : 1.5}
              tabIndex={i === shapes.findIndex((x) => x.m === s.m) ? 0 : -1}
              aria-label={`${MUSCLE_LABELS[s.m]}: ${pct}% recovered`}
              onPointerEnter={() => setActive(s.m)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(s.m)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(s.m)}
              className="cursor-pointer outline-none"
            />
          );
        })}
      </svg>
      <figcaption className="text-muted-foreground text-xs">{title}</figcaption>
    </figure>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {figure(FRONT, "Front")}
        {figure(BACK, "Back")}
      </div>
      <p className="h-5 text-center text-sm" aria-live="polite">
        {a ? (
          <>
            <span className="font-semibold">{MUSCLE_LABELS[a.muscle]}</span>{" "}
            <span className="text-muted-foreground">
              {a.recovery}% · {recoveryLabel(a.recovery)}
              {a.hoursToReady > 0 && ` · ready in ~${a.hoursToReady} h`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Tap a muscle</span>
        )}
      </p>
      {/* Legend for the one-hue scale */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Recovered</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{ background: `linear-gradient(to right, ${heatColor(100)}, ${heatColor(50)}, ${heatColor(0)})` }}
        />
        <span className="text-muted-foreground">Fatigued</span>
      </div>
    </div>
  );
}
