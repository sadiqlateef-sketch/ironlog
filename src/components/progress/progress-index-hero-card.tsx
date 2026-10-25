"use client";

import { useMemo, useState } from "react";
import { Info, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { calculateSixWeekOverview } from "@/lib/progress-index-advanced.ts";
import type { StatsData } from "@/components/progress/overview";

export function ProgressIndexHeroCard({ data }: { data: StatsData }) {
  const overview = useMemo(
    () => calculateSixWeekOverview(data.sets, data.sessions, data.now),
    [data.sets, data.sessions, data.now],
  );

  const [selectedWeekIdx, setSelectedWeekIdx] = useState(4); // default 10.18-24 (Step 1/2 in user images)
  const [showExplanation, setShowExplanation] = useState(false);

  const W = 320;
  const H = 70;
  const minY = 90;
  const maxY = 115;

  const points = overview.weeks.map((w, i) => {
    const x = (i / (overview.weeks.length - 1)) * (W - 30) + 15;
    const y = H - ((w.value - minY) / (maxY - minY)) * (H - 20) - 10;
    return { ...w, x, y };
  });

  const pathD = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");

  // Target band rectangle coordinates
  const bandYTop = H - ((overview.targetBand.max - minY) / (maxY - minY)) * (H - 20) - 10;
  const bandYBottom = H - ((overview.targetBand.min - minY) / (maxY - minY)) * (H - 20) - 10;
  const bandHeight = bandYBottom - bandYTop;

  const selectedWeek = overview.weeks[selectedWeekIdx] ?? overview.weeks[4] ?? overview.weeks[0];

  return (
    <Card
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xl transition-all"
      data-testid="progress-index-card"
    >
      {/* Soft Purple Ambient Radial Glow at Top Right matching user image */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />

      {/* Header Row */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
            PROGRESS INDEX
          </span>
          <button
            type="button"
            onClick={() => setShowExplanation((prev) => !prev)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="What is Progress Index?"
          >
            <Info className="size-3.5" />
          </button>
        </div>
        <span className="text-muted-foreground text-xs font-semibold">
          {overview.weeks[0]?.label} — {overview.weeks[5]?.label}
        </span>
      </div>

      {/* Main Status Headline matching image: 'Week Closed Empty 😪' or 'Strong Gains 🔥' */}
      <div className="relative z-10 mt-3 min-w-0">
        <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          {overview.currentStatus}
        </h2>
        <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed">
          {overview.statusMessage}
        </p>
      </div>

      {/* Educational Explanation Box (From Step 1 & Step 2 of user images) */}
      {showExplanation && (
        <div className="relative z-10 mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-primary-text mb-1">About Progress Index & Target Band:</p>
          <p className="leading-relaxed">
            Tracks three things each week: whether your key lifts got stronger than last month, whether your muscle groups got enough work, and whether your training was balanced. Landing inside the target band means you&apos;re progressing at a sustainable, scientifically validated pace.
          </p>
        </div>
      )}

      {/* 6 WEEK OVERVIEW Section */}
      <div className="relative z-10 mt-5 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-xs mb-2.5">
          <span className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
            6 WEEK OVERVIEW
          </span>
          <span className="text-muted-foreground text-xs font-medium">
            {overview.weeks[0]?.label} — {overview.weeks[5]?.label}
          </span>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/60 p-2.5">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 overflow-visible" aria-hidden>
            {/* Shaded Target Band */}
            <rect
              x="0"
              y={bandYTop}
              width={W}
              height={Math.max(4, bandHeight)}
              className="fill-primary/15 stroke-primary/40"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <text
              x={W - 4}
              y={bandYTop + 9}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] font-semibold tracking-wide"
            >
              Target
            </text>

            {/* Selected Week Vertical Highlight Bar (matches user image 4 & 5) */}
            {points[selectedWeekIdx] && (
              <rect
                x={points[selectedWeekIdx].x - 16}
                y="0"
                width="32"
                height={H}
                className="fill-muted-foreground/20"
              />
            )}

            {/* Connecting Trend Line */}
            <path
              d={pathD}
              fill="none"
              stroke="#6B7280"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Points: Unselected are hollow/muted; Selected is solid white with bold ring */}
            {points.map((p, i) => {
              const isSelected = i === selectedWeekIdx;
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? "4.5" : "3"}
                  className={
                    isSelected
                      ? "fill-foreground stroke-background"
                      : "fill-secondary stroke-muted-foreground"
                  }
                  strokeWidth={isSelected ? "2" : "1.5"}
                />
              );
            })}
          </svg>

          {/* Week Labels matching image format '9.20-26', '10.18-24' */}
          <div className="mt-1 flex justify-between text-[10px] font-medium text-muted-foreground px-0.5">
            {overview.weeks.map((w, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedWeekIdx(i)}
                className={`transition-colors ${
                  i === selectedWeekIdx
                    ? "text-foreground font-bold underline underline-offset-4 decoration-primary"
                    : "hover:text-foreground"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Breakdown of Selected Week (7-Day Distribution Bars: Light, Target, Peak) */}
      <div className="relative z-10 mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-semibold">
            Breakdown of {selectedWeek?.label ?? "10.18-24"}
          </span>
          {selectedWeek?.hasData ? (
            <span className="text-muted-foreground text-[11px] font-medium">
              Score: <strong className="text-foreground">{selectedWeek.value}</strong>
            </span>
          ) : (
            <span className="text-muted-foreground text-[11px] font-medium">No workouts this week</span>
          )}
        </div>

        {/* 7-Day Bar Grid with Light, Target, Peak levels from user image 5 */}
        <div className="relative rounded-xl border border-border bg-secondary/60 p-3">
          {/* Target dotted guide line */}
          <div className="absolute inset-x-3 top-1/2 border-b border-dashed border-primary/40 pointer-events-none" />
          <span className="absolute right-3 top-1/2 -translate-y-4 text-[9px] font-bold text-muted-foreground pointer-events-none">
            Target
          </span>
          <span className="absolute right-3 top-2 text-[9px] font-bold text-muted-foreground pointer-events-none">
            Peak
          </span>
          <span className="absolute right-3 bottom-2 text-[9px] font-bold text-muted-foreground pointer-events-none">
            Light
          </span>

          <div className="grid grid-cols-7 gap-2 h-20 items-end pr-10">
            {[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5].map((lvl, idx) => (
              <div key={idx} className="flex h-full flex-col justify-end items-center">
                <div
                  style={{ height: `${lvl * 100}%` }}
                  className="w-full rounded-sm bg-secondary border border-border transition-all hover:bg-primary/40"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between text-[10px] text-muted-foreground px-1 font-medium">
          <span>Day 1</span>
          <span>Day 2</span>
          <span>Day 3</span>
          <span>Day 4</span>
          <span>Day 5</span>
          <span>Day 6</span>
          <span>Day 7</span>
        </div>
      </div>
    </Card>
  );
}
