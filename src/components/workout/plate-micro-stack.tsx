"use client";

import { useMemo } from "react";
import { calculatePlates, plateColor } from "@/lib/plates";

interface PlateMicroStackProps {
  weight: number;
  barWeight?: number;
  unit?: "imperial" | "metric";
}

export function PlateMicroStack({
  weight,
  barWeight = 45,
  unit = "imperial",
}: PlateMicroStackProps) {
  const plates = useMemo(() => {
    if (weight <= barWeight) return [];
    const available = unit === "imperial" ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25];
    return calculatePlates(weight, barWeight, available).perSide;
  }, [weight, barWeight, unit]);

  if (weight <= 0 || plates.length === 0) return null;

  return (
    <div
      className="inline-flex items-center gap-[2px] px-1.5 py-0.5 rounded bg-neutral-900/80 border border-neutral-800"
      title={`${weight} ${unit === "imperial" ? "lb" : "kg"}: ${plates.join(", ")} per side`}
    >
      {/* Miniature Bar Sleeve */}
      <div className="w-1.5 h-3 bg-neutral-600 rounded-[1px]" />

      {/* Mini Plates */}
      {plates.slice(0, 5).map((p, idx) => {
        const bg = plateColor(p, unit);
        const kg = unit === "imperial" ? p / 2.20462 : p;
        const h = kg >= 20 ? "h-3.5" : kg >= 10 ? "h-3" : "h-2.5";
        return (
          <div
            key={idx}
            className={`w-1 ${h} rounded-[1px] ${bg} shadow-sm border border-black/20`}
          />
        );
      })}

      {plates.length > 5 && (
        <span className="text-[9px] font-mono text-neutral-400">+{plates.length - 5}</span>
      )}
    </div>
  );
}
