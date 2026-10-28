"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useWidth } from "@/components/charts/use-width";
import { compact, niceTicks, shortDate } from "@/lib/chart-scale";

export interface LinePoint {
  id: string;
  date: string; // ISO
  value: number;
  /** Tooltip value, e.g. "263 lb" */
  display: string;
  /** Tooltip context, e.g. "225 × 5 · Oct 3" */
  detail: string;
}

const M = { top: 16, right: 44, bottom: 22, left: 36 };

/** Single-series trend: 2px line, faint area wash, ringed end-dot with its value. Supports "mountain" gradient aesthetic. */
export function LineChart({
  data,
  height = 200,
  ariaLabel,
  goal,
  variant = "standard",
}: {
  data: LinePoint[];
  height?: number;
  ariaLabel: string;
  /** Optional dashed target line, e.g. your goal weight. */
  goal?: { value: number; label: string } | null;
  variant?: "standard" | "mountain";
}) {
  const gradientId = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const values = [...data.map((d) => d.value), ...(goal ? [goal.value] : [])];
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  const ticks = niceTicks(Math.max(0, lo - pad), hi + pad, 3);
  const [yMin, yMax] = [ticks[0], ticks.at(-1)!];
  const times = data.map((d) => new Date(d.date).getTime());
  const [t0, t1] = [times[0], times.at(-1)!];
  const x = (i: number) => (t1 === t0 ? M.left + plotW / 2 : M.left + ((times[i] - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = data.length > 1 ? `${line} L${x(data.length - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z` : "";

  function nearest(e: PointerEvent<SVGRectElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left + M.left;
    let best = 0;
    data.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1));
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length) - 1));
  }

  const last = data.length - 1;
  const peakVal = Math.max(...data.map((d) => d.value));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && data.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={variant === "mountain" ? 0.45 : 0.15} />
              <stop offset="60%" stopColor="var(--glow-2)" stopOpacity={variant === "mountain" ? 0.2 : 0.05} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === yMin ? "var(--chart-axis)" : "var(--chart-grid)"} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {compact(t)}
              </text>
            </g>
          ))}
          <text x={M.left} y={height - 6} className="fill-muted-foreground text-[10px]">
            {shortDate(data[0].date)}
          </text>
          {last > 0 && (
            <text x={x(last)} y={height - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {shortDate(data[last].date)}
            </text>
          )}
          {goal && (
            <g>
              <line x1={M.left} x2={width - M.right} y1={y(goal.value)} y2={y(goal.value)} stroke="var(--success)" strokeDasharray="4 4" />
              <text x={width - M.right + 4} y={y(goal.value)} dy="0.32em" className="fill-success text-[10px] font-semibold">
                {goal.label}
              </text>
            </g>
          )}

          {/* Area under curve */}
          {area && (
            <path
              d={area}
              fill={`url(#${gradientId})`}
              opacity={variant === "mountain" ? 0.95 : 0.6}
            />
          )}

          {/* Main Trend Line */}
          <path
            d={line}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={variant === "mountain" ? 2.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Mountain Peak Marker Highlights */}
          {variant === "mountain" &&
            data.map((d, i) => {
              if (d.value === peakVal && d.value > 0) {
                return (
                  <g key={`peak-${i}`}>
                    <circle cx={x(i)} cy={y(d.value)} r={10} fill="var(--primary)" opacity={0.25} className="animate-ping" />
                    <circle cx={x(i)} cy={y(d.value)} r={6} fill="var(--primary)" stroke="var(--card-solid)" strokeWidth={2} />
                  </g>
                );
              }
              return null;
            })}

          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={y(yMin)} stroke="var(--chart-axis)" />
          )}
          {[hover ?? last].map((i) => (
            <circle key={i} cx={x(i)} cy={y(data[i].value)} r={5} fill="var(--chart-1)" stroke="var(--card-solid)" strokeWidth={2} />
          ))}
          {hover == null && (
            <text x={x(last) + 9} y={y(data[last].value)} dy="0.32em" className="fill-foreground text-[11px] font-semibold">
              {compact(data[last].value)}
            </text>
          )}

          {/* Crosshair layer: snaps to the nearest workout */}
          <rect
            x={M.left - 8}
            y={M.top}
            width={plotW + 16}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${ariaLabel}. Use arrow keys to read each point.`}
            onPointerMove={nearest}
            onPointerDown={nearest}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="outline-none"
          />
        </svg>
      )}
      {hover != null && data[hover] && (
        <ChartTooltip
          x={Math.min(Math.max(x(hover), 60), width - 60)}
          y={y(data[hover].value)}
          value={data[hover].display}
          label={data[hover].detail}
        />
      )}
    </div>
  );
}
