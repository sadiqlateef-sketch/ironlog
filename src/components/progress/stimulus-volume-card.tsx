"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { calculateStimulusVolume } from "@/lib/progress-index-advanced.ts";
import type { StatsData } from "@/components/progress/overview";

export function StimulusVolumeCard({ data }: { data: StatsData }) {
  const exMap = data.exercises;
  const stats = useMemo(
    () => calculateStimulusVolume(data.sets, exMap, data.now),
    [data.sets, exMap, data.now],
  );

  const [showExplanation, setShowExplanation] = useState(false);

  // Check if user has real logged working sets this week
  const hasRealData = stats.effectiveSets > 0;

  const effectiveSets = hasRealData ? stats.effectiveSets : 68;
  const targetSets = stats.targetSets > 0 ? stats.targetSets : 80;
  const statusBadge = hasRealData ? stats.statusBadge : "ON TARGET";

  const W = 300;
  const H = 90;

  const curveData = hasRealData
    ? stats.dailyCurve
    : [
        { day: "S", cumulative: 0 },
        { day: "M", cumulative: 8 },
        { day: "T", cumulative: 22 },
        { day: "W", cumulative: 22 },
        { day: "T", cumulative: 34 },
        { day: "F", cumulative: 56 },
        { day: "S", cumulative: 68 },
      ];

  const maxVal = Math.max(targetSets * 1.1, ...curveData.map((d) => d.cumulative), 10);

  const points = curveData.map((d, i) => {
    const x = (i / (curveData.length - 1)) * (W - 20) + 10;
    const y = H - (d.cumulative / maxVal) * (H - 20) - 10;
    return { x, y, day: d.day, cum: d.cumulative };
  });

  const pathD = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");

  // Per-muscle weekly effective sets
  const muscleList = hasRealData
    ? stats.muscleTargets
    : [
        { muscle: "Abs", logged: 6, target: 8, onTrack: false },
        { muscle: "Glutes", logged: 6, target: 8, onTrack: false },
        { muscle: "Back", logged: 8, target: 8, onTrack: true },
        { muscle: "Shoulders", logged: 7, target: 8, onTrack: false },
        { muscle: "Biceps", logged: 8, target: 8, onTrack: true },
        { muscle: "Triceps", logged: 8, target: 8, onTrack: true },
      ];

  return (
    <Card className="rounded-2xl border border-[var(--progress-purple-border)] bg-[#120F17] p-5 shadow-xl transition-all">
      {/* Title & Badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xl font-bold text-white tracking-tight">
              Stimulus Volume {!hasRealData && <span className="text-xs font-normal text-zinc-400">(sample)</span>}
            </h3>
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="What is Stimulus Volume?"
            >
              <Info className="size-3.5" />
            </button>
          </div>
          <p className="text-zinc-400 text-xs mt-1">
            Effective Sets {hasRealData ? "(This Week)" : "(Demo View)"}
          </p>
        </div>

        <span
          className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            statusBadge === "ON TARGET"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : statusBadge === "OVERREACHING"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {statusBadge}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="num text-2xl font-black text-white">{effectiveSets}</span>
        <span className="text-zinc-400 text-sm font-semibold">/{targetSets}</span>
      </div>

      {/* Educational Note */}
      {showExplanation && (
        <div className="mt-3 rounded-xl border border-purple-500/30 bg-purple-950/30 p-3 text-xs text-zinc-300 leading-relaxed">
          <p className="font-semibold text-purple-300 mb-1">About Stimulus Volume:</p>
          Muscle grows when it gets enough stimulus — this tracks whether each muscle group is hitting its weekly target (MEV to MAV). Purple = on track. Grey = needs more work this week.
        </div>
      )}

      {/* Cumulative Stimulus Curve with Shaded Target Band */}
      <div className="mt-4 relative overflow-hidden rounded-xl border border-zinc-800/80 bg-[#16121C] p-3">
        {/* Shaded Target Band at top */}
        <div className="absolute inset-x-0 top-3 h-7 bg-[var(--progress-purple)]/15 border-y border-[var(--progress-purple)]/25 pointer-events-none" />

        {/* Y-Axis tick labels on Right */}
        <span className="absolute right-3 top-4 text-[10px] font-semibold text-zinc-500">60</span>
        <div className="absolute inset-x-3 top-1/2 border-b border-zinc-800/40 pointer-events-none" />
        <span className="absolute right-3 top-1/2 -translate-y-2 text-[10px] font-semibold text-zinc-500">30</span>
        <div className="absolute inset-x-3 bottom-6 border-b border-zinc-800/60 pointer-events-none" />
        <span className="absolute right-3 bottom-5 text-[10px] font-semibold text-zinc-500">0</span>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 overflow-visible pr-8" aria-hidden>
          {/* Cumulative line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--progress-purple-light)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data point dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4"
              className="fill-white stroke-[var(--progress-purple-light)]"
              strokeWidth="2"
            />
          ))}
        </svg>

        {/* Day Labels S, M, T, W, T, F, S */}
        <div className="mt-1 flex justify-between text-[11px] font-bold text-zinc-400 px-2 pr-10">
          {curveData.map((d, i) => (
            <span key={i}>{d.day}</span>
          ))}
        </div>
      </div>

      {/* Weekly Effective Set Targets by Muscle Group */}
      <div className="mt-5 flex flex-col gap-2.5">
        <span className="text-zinc-400 text-[11px] font-semibold tracking-wider">
          Weekly Effective Set Targets
        </span>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
          {muscleList.map((m) => (
            <div key={m.muscle} className="flex items-center justify-between py-0.5">
              <span className="font-semibold text-white">{m.muscle}</span>
              <span
                className={`num font-bold ${
                  m.onTrack
                    ? "text-[var(--progress-purple-light)]"
                    : "text-zinc-400"
                }`}
              >
                {m.logged}/{m.target}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
