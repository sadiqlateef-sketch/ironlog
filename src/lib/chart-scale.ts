// Tiny scale helpers for the hand-rolled SVG charts.

/** 3-5 round tick values from 0 (or a floor) up past max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v < max + step - 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** 0 / 950 / 1.2K / 12K / 1.5M */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return trim(n);
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
