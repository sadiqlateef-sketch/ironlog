import type { MuscleGroup } from "@/types/database";

// Stylised front/back figures. Each shape is tagged with the muscle it shows;
// left and right sides share one muscle. Coordinates are in a 200 × 420 box.
export type Shape = { m: MuscleGroup; d: string };

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

export const FRONT: Shape[] = [
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

export const BACK: Shape[] = [
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

/** Which side of the body shows a muscle best. */
export function sideOf(m: MuscleGroup): "front" | "back" {
  return FRONT.some((s) => s.m === m) && !["traps", "side_delts", "forearms", "calves"].includes(m) ? "front" : "back";
}

/**
 * A static front or back figure. `fill` picks each muscle's colour; muscles it
 * returns nothing for are drawn in the quiet surface colour.
 */
export function MuscleFigure({
  side,
  fill,
  className,
}: {
  side: "front" | "back";
  fill: (m: MuscleGroup) => string | undefined;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 200 400" className={className} aria-hidden>
      <circle cx={100} cy={32} r={20} className="fill-secondary" />
      {(side === "front" ? FRONT : BACK).map((s, i) => (
        <path key={i} d={s.d} fill={fill(s.m) ?? "var(--secondary)"} stroke="var(--card-solid)" strokeWidth={1.5} />
      ))}
    </svg>
  );
}
