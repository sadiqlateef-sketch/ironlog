"use client";

import { useEffect, useState } from "react";

interface MorphingWorkoutHeaderProps {
  workoutName: string;
  elapsedSeconds: number;
  completedSetsCount: number;
  totalSetsCount: number;
  liveVolumeKg: number;
  unit?: "lb" | "kg";
  onFinish?: () => void;
  onCancel?: () => void;
}

export function MorphingWorkoutHeader({
  workoutName,
  elapsedSeconds,
  completedSetsCount,
  totalSetsCount,
  liveVolumeKg,
  unit = "lb",
  onFinish,
  onCancel,
}: MorphingWorkoutHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const volumeDisplay =
    unit === "lb"
      ? Math.round(liveVolumeKg * 2.20462)
      : Math.round(liveVolumeKg);

  return (
    <header
      className={`sticky top-0 z-30 transition-all duration-300 ${
        isScrolled
          ? "bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800 py-2 shadow-lg"
          : "bg-transparent py-3"
      }`}
    >
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between">
        {/* Workout Title & Live Clock */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <h1
              className={`font-bold transition-all duration-300 truncate max-w-[200px] sm:max-w-xs ${
                isScrolled ? "text-sm text-neutral-200" : "text-lg text-white"
              }`}
            >
              {workoutName}
            </h1>
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {formatClock(elapsedSeconds)}
              </span>
              <span>•</span>
              <span>
                {completedSetsCount}/{totalSetsCount} sets
              </span>
              <span>•</span>
              <span className="text-emerald-400">
                {volumeDisplay} {unit}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Finish / Actions */}
        <div className="flex items-center gap-2">
          {onCancel && !isScrolled && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-neutral-400 hover:text-red-400 px-2 py-1 rounded transition-colors"
            >
              Discard
            </button>
          )}

          {onFinish && (
            <button
              type="button"
              onClick={onFinish}
              className={`font-semibold rounded-xl transition-all active:scale-95 shadow-sm ${
                isScrolled
                  ? "px-3 py-1 text-xs bg-emerald-500 text-black hover:bg-emerald-400"
                  : "px-4 py-1.5 text-xs bg-emerald-500 text-black hover:bg-emerald-400"
              }`}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
