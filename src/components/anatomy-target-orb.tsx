"use client";

import type { MuscleGroup } from "@/types/database";
import { MUSCLE_LABELS } from "@/lib/labels";

interface AnatomyTargetOrbProps {
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  recoveryPercent?: number; // 0 - 100
  size?: "sm" | "md" | "lg";
}

export function AnatomyTargetOrb({
  primaryMuscle,
  secondaryMuscles = [],
  recoveryPercent = 85,
  size = "md",
}: AnatomyTargetOrbProps) {
  const primaryLabel = MUSCLE_LABELS[primaryMuscle] ?? primaryMuscle;

  // Recovery gradient color
  const getGlowColor = (rec: number) => {
    if (rec >= 85) return "from-emerald-500/30 via-emerald-500/10 to-transparent";
    if (rec >= 60) return "from-yellow-500/30 via-yellow-500/10 to-transparent";
    return "from-rose-500/30 via-rose-500/10 to-transparent";
  };

  const getBorderColor = (rec: number) => {
    if (rec >= 85) return "border-emerald-500/50 shadow-emerald-500/20";
    if (rec >= 60) return "border-yellow-500/50 shadow-yellow-500/20";
    return "border-rose-500/50 shadow-rose-500/20";
  };

  const dimClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  }[size];

  return (
    <div className="flex items-center gap-3">
      {/* 3D Orb Graphic */}
      <div
        className={`relative ${dimClasses} rounded-full flex items-center justify-center p-1 border shadow-lg bg-neutral-900/90 overflow-hidden ${getBorderColor(
          recoveryPercent,
        )}`}
      >
        {/* Ambient Radial Mesh Gradient */}
        <div
          className={`absolute inset-0 bg-radial-gradient ${getGlowColor(
            recoveryPercent,
          )} animate-pulse`}
        />

        {/* Inner Glass Core */}
        <div className="relative w-full h-full rounded-full bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-800 flex items-center justify-center border border-white/10 shadow-inner">
          {/* Holographic Concentric Rings */}
          <div className="absolute inset-1 rounded-full border border-dashed border-emerald-400/40 animate-spin [animation-duration:12s]" />

          {/* Primary Muscle Acronym */}
          <span className="text-[10px] font-mono font-bold tracking-tighter text-white z-10 uppercase">
            {primaryMuscle.slice(0, 3)}
          </span>
        </div>
      </div>

      {/* Target Muscle Information */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white">{primaryLabel}</span>
          <span
            className={`text-[10px] font-mono px-1 rounded ${
              recoveryPercent >= 85
                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/40"
                : recoveryPercent >= 60
                ? "bg-yellow-950/80 text-yellow-400 border border-yellow-800/40"
                : "bg-rose-950/80 text-rose-400 border border-rose-800/40"
            }`}
          >
            {recoveryPercent}% Ready
          </span>
        </div>

        {secondaryMuscles.length > 0 && (
          <span className="text-[11px] text-neutral-400 truncate max-w-[200px]">
            + {secondaryMuscles.map((m) => MUSCLE_LABELS[m] ?? m).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
