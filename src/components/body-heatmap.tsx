"use client";

import { useState } from "react";
import { MUSCLE_LABELS } from "@/lib/labels";
import { recoveryLabel, type MuscleRecovery } from "@/lib/recovery";
import type { MuscleGroup } from "@/types/database";

// Stylised front/back figures. Each shape is tagged with the muscle it shows;
// left and right sides share one muscle. Coordinates are in a 200 × 420 box.
type Shape = { m: MuscleGroup; d: string };

const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
/** A shape and its mirror across the body's centre line (x = 100). */
const pair = (m: MuscleGroup, cx: number, cy: number, rx: number, ry: number): Shape[] => [
  { m, d: ell(cx, cy, rx, ry) },
  { m, d: ell(200 - cx, cy, rx, ry) },
];
const mirrorPath = (m: MuscleGroup, d: string): Shape[] => [
  { m, d },
  { m, d: d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)},${y}`) },
];

const FRONT: Shape[] = [
  { m: "neck", d: "M91,56 h18 v14 h-18 z" },
  ...mirrorPath("traps", "M90,66 L72,76 L90,76 Z"),
  ...pair("side_delts", 51, 94, 7, 14),
  ...pair("front_delts", 64, 88, 12, 15),
  ...mirrorPath("chest", "M99,80 L76,79 Q66,86 70,104 Q82,116 99,112 Z"),
  ...pair("biceps", 52, 132, 10, 22),
  ...pair("forearms", 45, 184, 9, 27),
  { m: "abs", d: "M87,118 h26 v72 q-13,8 -26,0 z" },
  ...pair("obliques", 76, 152, 9, 30),
  ...pair("abductors", 66, 214, 7, 15),
  ...pair("quads", 79, 262, 15, 46),
  ...pair("adductors", 95, 234, 5, 26),
  ...pair("calves", 79, 352, 10, 34),
];

const BACK: Shape[] = [
  { m: "neck", d: "M91,56 h18 v12 h-18 z" },
  { m: "traps", d: "M100,62 L72,78 L100,110 L128,78 Z" },
  ...pair("side_delts", 51, 94, 7, 14),
  ...pair("rear_delts", 64, 88, 12, 15),
  ...pair("upper_back", 86, 118, 11, 13),
  ...mirrorPath("lats", "M73,102 Q64,130 84,166 L95,152 L94,132 L78,108 Z"),
  { m: "lower_back", d: "M89,150 h22 v36 q-11,6 -22,0 z" },
  ...pair("triceps", 52, 132, 10, 22),
  ...pair("forearms", 45, 184, 9, 27),
  ...pair("glutes", 86, 212, 15, 19),
  ...pair("hamstrings", 81, 268, 14, 42),
  ...pair("calves", 80, 350, 12, 32),
];

/** One-hue ramp (red): 100% recovered recedes toward the surface, fatigue glows. */
export function heatColor(recovery: number): string {
  const f = Math.min(1, Math.max(0, (100 - recovery) / 100));
  const L = 0.41 + f * 0.31;
  const C = 0.04 + f * 0.16;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} var(--heat-hue))`;
}

export function BodyHeatmap({ data }: { data: MuscleRecovery[] }) {
  const byMuscle = new Map(data.map((d) => [d.muscle, d]));
  const [active, setActive] = useState<MuscleGroup | null>(null);
  const a = active ? byMuscle.get(active) : null;

  const figure = (shapes: Shape[], title: string) => (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 200 400" className="h-auto w-full max-w-[150px]" role="group" aria-label={`${title} view`}>
        <circle cx={100} cy={32} r={20} className="fill-secondary" />
        {shapes.map((s, i) => {
          const r = byMuscle.get(s.m);
          const pct = r?.recovery ?? 100;
          return (
            <path
              key={i}
              d={s.d}
              fill={heatColor(pct)}
              stroke={active === s.m ? "var(--foreground)" : "var(--card-solid)"}
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
