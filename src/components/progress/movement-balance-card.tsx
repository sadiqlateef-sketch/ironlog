"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { calculateMovementBalance } from "@/lib/progress-index-advanced.ts";
import type { StatsData } from "@/components/progress/overview";

export function MovementBalanceCard({ data }: { data: StatsData }) {
  const exMap = data.exercises;
  const balance = useMemo(
    () => calculateMovementBalance(data.sets, exMap, data.now),
    [data.sets, exMap, data.now],
  );

  const [showExplanation, setShowExplanation] = useState(false);

  // Check if user has real logged data
  const hasRealSets = data.sets.some((s) => s.set_type !== "warmup" && s.completed_at);

  const scoreText = hasRealSets ? balance.score : "5/6 on track";
  const statusBadge = hasRealSets ? balance.statusBadge : "CONCENTRATED";
  const ratios = hasRealSets
    ? balance.ratios
    : {
        vPushToPull: 1.2,
        hPushToPull: 2.0,
        squatToHinge: 0.8,
      };

  // Radar chart geometry
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 72;
  const angles = [
    -Math.PI / 2, // Squat (Top)
    -Math.PI / 6, // V.Push (Top-Right)
    Math.PI / 6, // H.Push (Bottom-Right)
    Math.PI / 2, // Hinge (Bottom)
    (5 * Math.PI) / 6, // H.Pull (Bottom-Left)
    (-5 * Math.PI) / 6, // V.Pull (Top-Left)
  ];

  const gridLevels = [0.35, 0.7, 1.0];
  const gridPolygons = gridLevels.map((lvl) => {
    return angles
      .map((ang) => {
        const x = cx + radius * lvl * Math.cos(ang);
        const y = cy + radius * lvl * Math.sin(ang);
        return `${x},${y}`;
      })
      .join(" ");
  });

  const radarValues = hasRealSets
    ? balance.radarPoints.map((p) => p.value)
    : [0.45, 0.55, 0.45, 0.85, 0.35, 0.9];

  const labels = ["Squat", "V.Push", "H.Push", "Hinge", "H.Pull", "V.Pull"];

  const points = angles.map((ang, i) => {
    const val = radarValues[i];
    const r = radius * val;
    const x = cx + r * Math.cos(ang);
    const y = cy + r * Math.sin(ang);
    return { x, y, label: labels[i] };
  });

  const polygonPath = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Card className="rounded-2xl border border-border bg-card p-5 shadow-xl transition-all">
      {/* Title & Badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xl font-bold text-foreground tracking-tight">
              Movement Balance {!hasRealSets && <span className="text-xs font-normal text-muted-foreground">(sample)</span>}
            </h3>
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="What is Movement Balance?"
            >
              <Info className="size-3.5" />
            </button>
          </div>
          <p className="text-muted-foreground text-xs mt-1">
            Movement Patterns {hasRealSets ? "(Past 28 Days)" : "(Demo View)"}
          </p>
        </div>

        <span
          className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            statusBadge === "BALANCED"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
          }`}
        >
          {statusBadge}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-black text-foreground">{scoreText}</span>
      </div>

      {/* Educational Note */}
      {showExplanation && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold text-primary-text mb-1">About Movement Balance:</p>
          The radar shows how evenly you&apos;re training across all 6 patterns over the past month. The closer it is to a full, even shape — the more balanced your structural training.
        </div>
      )}

      {/* Agonist:Antagonist Ratio Tiles */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center divide-x divide-border">
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground text-[10px] font-medium">V.Push : V.Pull</span>
          <span className="num text-base font-bold text-foreground mt-0.5">{ratios.vPushToPull} : 1</span>
        </div>
        <div className="flex flex-col items-center pl-2">
          <span className="text-muted-foreground text-[10px] font-medium">H.Push : H.Pull</span>
          <span className="num text-base font-bold text-foreground mt-0.5">{ratios.hPushToPull} : 1</span>
        </div>
        <div className="flex flex-col items-center pl-2">
          <span className="text-muted-foreground text-[10px] font-medium flex items-center justify-center gap-1">
            Squat : Hinge
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="num text-base font-bold text-foreground">{ratios.squatToHinge} : 1</span>
            {ratios.squatToHinge < 0.9 && (
              <span className="rounded-full bg-amber-500/20 text-amber-400 text-[9px] px-1 font-bold">!</span>
            )}
          </div>
        </div>
      </div>

      {/* Hexagonal Radar / Spider Chart */}
      <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-border bg-secondary/60 p-4">
        <svg viewBox={`0 0 ${size} ${size}`} className="size-60 overflow-visible" aria-hidden>
          {/* Concentric grid webs */}
          {gridPolygons.map((poly, idx) => (
            <polygon
              key={idx}
              points={poly}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1.25"
            />
          ))}

          {/* Radial axis lines from center */}
          {angles.map((ang, idx) => {
            const x = cx + radius * Math.cos(ang);
            const y = cy + radius * Math.sin(ang);
            return (
              <line
                key={idx}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
              />
            );
          })}

          {/* Plotted Area */}
          <polygon
            points={polygonPath}
            fill="rgba(124, 101, 193, 0.25)"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Dots on vertices */}
          {points.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              className="fill-foreground stroke-primary"
              strokeWidth="2"
            />
          ))}

          {/* Labels outside vertices */}
          {points.map((pt, idx) => {
            const labelDist = radius + 18;
            const lx = cx + labelDist * Math.cos(angles[idx]);
            const ly = cy + labelDist * Math.sin(angles[idx]);
            return (
              <text
                key={idx}
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {pt.label}
              </text>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}
