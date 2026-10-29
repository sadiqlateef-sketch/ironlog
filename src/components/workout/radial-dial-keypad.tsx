"use client";

import { useState } from "react";

interface RadialDialKeypadProps {
  currentValue: number;
  unit?: "lb" | "kg";
  onChange: (newValue: number) => void;
  onClose?: () => void;
}

export function RadialDialKeypad({
  currentValue,
  unit = "lb",
  onChange,
  onClose,
}: RadialDialKeypadProps) {
  const [activeDelta, setActiveDelta] = useState<number | null>(null);

  const increments =
    unit === "lb"
      ? [-10, -5, -2.5, 2.5, 5, 10]
      : [-5, -2.5, -1, 1, 2.5, 5];

  const handleAdjust = (delta: number) => {
    setActiveDelta(delta);
    setTimeout(() => setActiveDelta(null), 250);
    const next = Math.max(0, Math.round((currentValue + delta) * 10) / 10);
    onChange(next);
  };

  return (
    <div className="flex flex-col items-center bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-3xl p-4 shadow-2xl w-full max-w-xs mx-auto">
      {/* Header with active value */}
      <div className="flex items-center justify-between w-full mb-3 px-2">
        <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Quick Dial</span>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono text-white">{currentValue}</span>
          <span className="text-xs text-neutral-400 font-mono">{unit}</span>
        </div>
      </div>

      {/* Radial Dial Arc Visualizer */}
      <div className="relative w-48 h-24 overflow-hidden flex items-end justify-center mb-2">
        {/* Curved Track Arc */}
        <svg className="w-48 h-48 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-neutral-800"
            strokeDasharray="132 132"
            strokeDashoffset="0"
          />
          {/* Active Accent Indicator */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-emerald-500 transition-all duration-300"
            strokeDasharray="26 132"
            strokeDashoffset="53"
          />
        </svg>

        {/* Center Target Notch */}
        <div className="absolute bottom-0 h-4 w-1 bg-emerald-400 rounded-full shadow-lg shadow-emerald-500/50" />
      </div>

      {/* Micro-Adjustment Buttons Grid */}
      <div className="grid grid-cols-6 gap-1.5 w-full mt-2">
        {increments.map((inc) => {
          const isPos = inc > 0;
          const isRecent = activeDelta === inc;
          return (
            <button
              key={inc}
              type="button"
              onClick={() => handleAdjust(inc)}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-mono font-semibold transition-all active:scale-95 border ${
                isRecent
                  ? "bg-emerald-500 text-black border-emerald-400 shadow-md scale-105"
                  : isPos
                  ? "bg-neutral-800/90 text-emerald-400 hover:bg-neutral-700/80 border-neutral-700/60"
                  : "bg-neutral-800/90 text-neutral-300 hover:bg-neutral-700/80 border-neutral-700/60"
              }`}
            >
              <span>{isPos ? `+${inc}` : inc}</span>
            </button>
          );
        })}
      </div>

      {/* Quick Done Action */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-1.5 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-700 transition-colors"
        >
          Confirm
        </button>
      )}
    </div>
  );
}
