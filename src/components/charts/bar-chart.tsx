"use client";

import { useState } from "react";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useWidth } from "@/components/charts/use-width";
import { compact, niceTicks } from "@/lib/chart-scale";

export interface BarDatum {
  id: string;
  /** x-axis label, e.g. "Oct 3" */
  label: string;
  value: number;
  /** Tooltip value text, e.g. "12,400 lb" */
  display: string;
}

const M = { top: 22, right: 8, bottom: 22, left: 36 };

/** Single-series column chart: thin bars, 4px rounded tops, value on the latest bar. */
export function BarChart({ data, height = 190, ariaLabel }: { data: BarDatum[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const ticks = niceTicks(0, Math.max(1, ...data.map((d) => d.value)), 3);
  const yMax = ticks.at(-1)!;
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const cx = (i: number) => M.left + band * i + band / 2;
  const labelIdx = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {compact(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const top = y(d.value);
            const h = Math.max(0, y(0) - top);
            const r = Math.min(4, h, barW / 2);
            const x0 = cx(i) - barW / 2;
            // Rounded data-end, square at the baseline.
            const path = `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`;
            return (
              <g key={d.id}>
                <path d={path} fill="var(--chart-1)" opacity={hover == null || hover === i ? 1 : 0.55} />
                {/* Hit target: the whole column band, not just the painted bar */}
                <rect
                  x={M.left + band * i}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${d.display}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
                {labelIdx.has(i) && (
                  <text x={cx(i)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          {/* Label the latest bar, unless a taller neighbour would sit under the text
              (the tooltip and table still carry its value). */}
          {data.length > 0 && hover == null && (data.length < 2 || data.at(-2)!.value <= data.at(-1)!.value * 1.15) && (
            <text
              x={cx(data.length - 1)}
              y={y(data.at(-1)!.value) - 6}
              textAnchor={data.length > 1 ? "end" : "middle"}
              dx={data.length > 1 ? barW / 2 : 0}
              className="fill-foreground text-[11px] font-semibold"
            >
              {compact(data.at(-1)!.value)}
            </text>
          )}
        </svg>
      )}
      {hover != null && data[hover] && (
        <ChartTooltip
          x={Math.min(Math.max(cx(hover), 60), width - 60)}
          y={y(data[hover].value)}
          value={data[hover].display}
          label={data[hover].label}
        />
      )}
    </div>
  );
}
