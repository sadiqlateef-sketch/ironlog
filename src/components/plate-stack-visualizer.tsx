"use client";

import { useMemo } from "react";
import { calculatePlates, plateColor } from "@/lib/plates";

interface PlateStackVisualizerProps {
  targetWeight: number;
  barWeight?: number;
  availablePlates?: number[];
  unit?: "metric" | "imperial";
  compact?: boolean;
}

export function PlateStackVisualizer({
  targetWeight,
  barWeight = 45,
  availablePlates = [45, 35, 25, 10, 5, 2.5],
  unit = "imperial",
  compact = false,
}: PlateStackVisualizerProps) {
  const result = useMemo(() => {
    return calculatePlates(targetWeight, barWeight, availablePlates);
  }, [targetWeight, barWeight, availablePlates]);

  const plates = result.perSide;

  // Height and width scaling for visual realism
  const getPlateDimensions = (plate: number) => {
    const kg = unit === "imperial" ? plate / 2.20462 : plate;
    if (kg >= 20) return { height: compact ? 36 : 56, width: compact ? 8 : 12, border: "border-red-500/30" };
    if (kg >= 15) return { height: compact ? 34 : 52, width: compact ? 7 : 10, border: "border-blue-500/30" };
    if (kg >= 10) return { height: compact ? 30 : 46, width: compact ? 6 : 9, border: "border-yellow-500/30" };
    if (kg >= 5) return { height: compact ? 26 : 40, width: compact ? 5 : 8, border: "border-green-500/30" };
    if (kg >= 2) return { height: compact ? 22 : 32, width: compact ? 4 : 7, border: "border-white/30" };
    return { height: compact ? 18 : 26, width: compact ? 3 : 5, border: "border-neutral-400/30" };
  };

  return (
    <div className={`flex flex-col items-center ${compact ? "gap-1" : "gap-2"}`}>
      {/* Visual Bar Sleeve and Collar */}
      <div className="relative flex items-center h-16 w-full justify-center overflow-x-auto py-2">
        {/* Steel Bar Sleeve */}
        <div className="absolute h-2.5 w-44 bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-700 rounded-full shadow-inner -z-0" />

        {/* Inner Collar Ring */}
        <div className="z-10 h-10 w-2.5 bg-gradient-to-b from-neutral-300 via-neutral-500 to-neutral-700 rounded-sm shadow-md mr-1 border border-neutral-600/50" />

        {/* Stack of Plates on the sleeve */}
        <div className="z-10 flex items-center gap-0.5">
          {plates.length === 0 ? (
            <span className="text-[10px] text-neutral-500 font-mono italic px-2">Empty Bar ({barWeight} {unit === "imperial" ? "lb" : "kg"})</span>
          ) : (
            plates.map((p, idx) => {
              const { height, width, border } = getPlateDimensions(p);
              const colorBg = plateColor(p, unit);
              return (
                <div
                  key={`${p}-${idx}`}
                  style={{ height: `${height}px`, width: `${width}px` }}
                  className={`relative rounded-[2px] shadow-lg border ${border} ${colorBg} flex items-center justify-center transition-all hover:scale-105 group`}
                  title={`${p} ${unit === "imperial" ? "lb" : "kg"}`}
                >
                  <span className="sr-only">{p}</span>
                  {/* Subtle plate center groove */}
                  <div className="w-[1px] h-3 bg-black/20" />
                </div>
              );
            })
          )}
        </div>

        {/* Spring Collar Clip */}
        {plates.length > 0 && (
          <div className="z-10 h-6 w-1.5 bg-neutral-400 rounded-full border border-neutral-300 ml-0.5 shadow-sm" />
        )}
      </div>

      {/* Plate count summary text */}
      {!compact && (
        <div className="flex items-center gap-1.5 flex-wrap justify-center text-xs font-mono">
          <span className="text-neutral-400 font-medium">Per side:</span>
          {plates.length === 0 ? (
            <span className="text-neutral-500">None</span>
          ) : (
            plates.map((p, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700"
              >
                {p}
              </span>
            ))
          )}
          {result.remainder > 0 && (
            <span className="text-amber-400 text-[11px] ml-1">
              (+{result.remainder} rem)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
