"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  calculatePatternStrength,
  type PatternStrengthStats,
} from "@/lib/progress-index-advanced.ts";
import type { StatsData } from "@/components/progress/overview";

export function StrengthPatternCard({ data }: { data: StatsData }) {
  const exMap = data.exercises;
  const patterns = useMemo(
    () => calculatePatternStrength(data.sets, exMap, data.now),
    [data.sets, exMap, data.now],
  );

  const [showExplanation, setShowExplanation] = useState(false);

  // Check if user has real logged data across movement patterns
  const hasRealData = patterns.some((p) => p.pctChange !== 0 || p.topContributor !== null);

  const topCalculated = patterns.reduce((prev, cur) => (cur.pctChange > prev.pctChange ? cur : prev), patterns[0]);
  
  const activePattern = hasRealData && topCalculated ? topCalculated : {
    pattern: "V.Push" as const,
    pctChange: 19,
    status: "STRONG GAIN" as const,
    topContributor: {
      exerciseName: "Dumbbell Shoulder Press",
      baseline1Rm: 195,
      current1Rm: 230,
    },
  };

  const hasStrongGain = activePattern.pctChange >= 10;

  // Real bars when user has data, fallback to reference sample when fresh account
  const displayBars = hasRealData
    ? patterns.map((p) => ({ id: p.pattern, val: p.pctChange }))
    : [
        { id: "V.Push" as const, val: 19 },
        { id: "V.Pull" as const, val: -7 },
        { id: "H.Push" as const, val: 1 },
        { id: "H.Pull" as const, val: 6 },
        { id: "Squat" as const, val: -6 },
        { id: "Hinge" as const, val: 1 },
      ];

  return (
    <Card className="rounded-2xl border border-border bg-card p-5 shadow-xl transition-all">
      {/* Title & Info */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xl font-bold text-foreground tracking-tight">
              Strength {!hasRealData && <span className="text-xs font-normal text-muted-foreground">(sample)</span>}
            </h3>
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="What is Strength pattern tracking?"
            >
              <Info className="size-3.5" />
            </button>
          </div>
          <p className="text-muted-foreground text-xs mt-1">
            1RM Change by pattern
          </p>
        </div>

        <span
          className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            hasStrongGain
              ? "bg-[#D92662]/20 text-[#FF4D8D] border border-[#D92662]/40"
              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {activePattern.status}
        </span>
      </div>

      {/* Top Banner Metric */}
      <div className="mt-2 flex flex-col">
        <span className="text-2xl font-black text-foreground tracking-tight">
          {activePattern.pattern} {activePattern.pctChange >= 0 ? `+${activePattern.pctChange}%` : `${activePattern.pctChange}%`}
        </span>
        <span className="text-muted-foreground text-xs mt-0.5">
          Compared to 28 day median {hasRealData ? "(Live Data)" : "(Demo View)"}
        </span>
      </div>

      {/* Educational Note */}
      {showExplanation && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold text-primary-text mb-1">About Movement Patterns:</p>
          These 6 patterns — squat, hinge, push, pull — are how your body is built to move. Bars above zero mean you&apos;re getting stronger in that pattern compared to your past 28-day baseline. Bars below zero mean it needs more attention.
        </div>
      )}

      {/* 6-Pattern Dual-Direction Bar Chart (-20% to +20%) */}
      <div className="mt-4 flex flex-col gap-1">
        <div className="relative h-44 w-full overflow-hidden rounded-xl border border-border bg-secondary/60 p-3">
          {/* Y-Axis Guide Lines & Labels on Right */}
          <div className="absolute inset-x-3 top-3 border-b border-border" />
          <span className="absolute right-3 top-2 text-[10px] font-semibold text-muted-foreground">20%</span>

          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 border-b border-border" />
          <span className="absolute right-3 top-1/2 -translate-y-2.5 text-[10px] font-semibold text-muted-foreground">0%</span>

          <div className="absolute inset-x-3 bottom-8 border-t border-border" />
          <span className="absolute right-3 bottom-7 text-[10px] font-semibold text-muted-foreground">-20%</span>

          {/* 6 Columns: V.Push, V.Pull, H.Push, H.Pull, Squat, Hinge */}
          <div className="relative grid h-full grid-cols-6 items-center gap-2 pr-10 pb-6">
            {displayBars.map((p) => {
              const clamped = Math.max(-20, Math.min(20, p.val));
              const heightPct = (Math.abs(clamped) / 20) * 44;
              const isPositive = clamped >= 0;

              return (
                <div key={p.id} className="flex h-full flex-col items-center justify-center">
                  <div className="relative flex h-full w-full flex-col items-center justify-center">
                    {/* Top half (positive) */}
                    <div className="flex h-1/2 w-full flex-col justify-end items-center">
                      {isPositive && (
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-7 rounded-t-sm transition-all ${
                            p.val >= 10
                              ? "bg-primary shadow-sm"
                              : "bg-muted-foreground/40"
                          }`}
                        />
                      )}
                    </div>
                    {/* Bottom half (negative) */}
                    <div className="flex h-1/2 w-full flex-col justify-start items-center">
                      {!isPositive && (
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-7 rounded-b-sm bg-muted-foreground/40 transition-all"
                        />
                      )}
                    </div>
                  </div>
                  <span className="mt-1.5 text-[10px] font-semibold text-muted-foreground">
                    {p.id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-left px-1 mt-0.5">
          *V - Vertical, H - Horizontal
        </p>
      </div>

      {/* Top Contributor Table */}
      {activePattern.topContributor && (
        <div className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-secondary/60">
          <div className="flex items-center justify-between px-3.5 py-2 text-[11px] font-semibold text-muted-foreground">
            <span>Top contributor</span>
            <span>1RM</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
            <span className="font-semibold text-foreground truncate max-w-[200px]">
              {activePattern.topContributor.exerciseName}
            </span>
            <span className="num font-bold text-muted-foreground">
              {activePattern.topContributor.baseline1Rm} → {activePattern.topContributor.current1Rm} lbs
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
