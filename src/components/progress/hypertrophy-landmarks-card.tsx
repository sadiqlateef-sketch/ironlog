"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MUSCLE_LABELS } from "@/lib/labels";
import type { StatsData } from "@/components/progress/overview";
import type { MuscleGroup } from "@/types/database";

interface MuscleLandmarkConfig {
  muscle: string;
  mv: number;
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
}

const RP_LANDMARKS: MuscleLandmarkConfig[] = [
  { muscle: "Chest", mv: 4, mev: 8, mavMin: 12, mavMax: 18, mrv: 22 },
  { muscle: "Back", mv: 6, mev: 10, mavMin: 14, mavMax: 20, mrv: 25 },
  { muscle: "Quads", mv: 6, mev: 8, mavMin: 12, mavMax: 18, mrv: 20 },
  { muscle: "Hamstrings", mv: 4, mev: 6, mavMin: 10, mavMax: 16, mrv: 18 },
  { muscle: "Shoulders", mv: 4, mev: 8, mavMin: 12, mavMax: 18, mrv: 22 },
  { muscle: "Biceps", mv: 4, mev: 6, mavMin: 10, mavMax: 16, mrv: 20 },
  { muscle: "Triceps", mv: 4, mev: 6, mavMin: 10, mavMax: 14, mrv: 18 },
  { muscle: "Abs", mv: 0, mev: 4, mavMin: 8, mavMax: 14, mrv: 18 },
  { muscle: "Calves", mv: 4, mev: 6, mavMin: 10, mavMax: 16, mrv: 20 },
];

export function HypertrophyLandmarksCard({ data }: { data: StatsData }) {
  const exMap = data.exercises;
  const [showExplanation, setShowExplanation] = useState(false);
  const [mountedAt] = useState(() => Date.now());

  // Calculate actual working sets this week per muscle
  const setsByMuscle = useMemo(() => {
    const DAY = 86_400_000;
    const now = data.now ?? mountedAt;
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const startOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek).getTime();

    const counts: Record<string, number> = {};
    for (const s of data.sets) {
      if (s.set_type === "warmup" || !s.completed_at) continue;
      const t = Date.parse(s.completed_at);
      if (t < startOfWeek || t > now) continue;
      const ex = exMap.get(s.exercise_id);
      if (ex?.primary_muscle) {
        const label = MUSCLE_LABELS[ex.primary_muscle as MuscleGroup] || ex.primary_muscle;
        counts[label] = (counts[label] ?? 0) + 1;
      }
    }
    return counts;
  }, [data.sets, exMap, data.now, mountedAt]);

  const hasRealSets = Object.values(setsByMuscle).some((count) => count > 0);

  return (
    <Card className="rounded-2xl border border-[var(--progress-purple-border)] bg-[#120F17] p-5 shadow-xl transition-all">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xl font-bold text-white tracking-tight">
              Hypertrophy Volume Landmarks {!hasRealSets && <span className="text-xs font-normal text-zinc-400">(sample)</span>}
            </h3>
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="What are Hypertrophy Volume Landmarks?"
            >
              <Info className="size-3.5" />
            </button>
          </div>
          <p className="text-zinc-400 text-xs mt-1">
            Weekly set thresholds (RP Model): MEV · MAV · MRV
          </p>
        </div>
        <span className="bg-purple-500/20 text-[var(--progress-purple-light)] border border-purple-500/30 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
          SCIENTIFIC
        </span>
      </div>

      {showExplanation && (
        <div className="mt-3 rounded-xl border border-purple-500/30 bg-purple-950/30 p-3 text-xs text-zinc-300 leading-relaxed">
          <p className="font-semibold text-purple-300 mb-1">About Hypertrophy Landmarks (Dr. Mike Israetel / RP):</p>
          • <strong>MEV (Minimum Effective Volume):</strong> Lowest sets to still trigger growth.<br />
          • <strong>MAV (Maximum Adaptive Volume):</strong> The optimal sweet spot for fastest muscle growth.<br />
          • <strong>MRV (Maximum Recoverable Volume):</strong> Upper ceiling where volume causes systemic overtraining.
        </div>
      )}

      {/* Threshold Key */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#16121C] border border-zinc-800/80 p-2.5 text-center text-[10px]">
        <div>
          <span className="block font-bold text-zinc-400">MEV</span>
          <span className="text-zinc-500">Min Effective</span>
        </div>
        <div>
          <span className="block font-bold text-[var(--progress-purple-light)]">MAV (Sweet Spot)</span>
          <span className="text-purple-400/80">Max Adaptive</span>
        </div>
        <div>
          <span className="block font-bold text-rose-400">MRV</span>
          <span className="text-rose-400/80">Max Recoverable</span>
        </div>
      </div>

      {/* Muscle List */}
      <div className="mt-4 flex flex-col gap-3">
        {RP_LANDMARKS.slice(0, 6).map((cfg) => {
          const sets = hasRealSets
            ? (setsByMuscle[cfg.muscle] ?? 0)
            : cfg.muscle === "Chest"
            ? 14
            : cfg.muscle === "Back"
            ? 16
            : cfg.muscle === "Quads"
            ? 12
            : cfg.muscle === "Hamstrings"
            ? 8
            : cfg.muscle === "Shoulders"
            ? 10
            : 6;

          const pctOfMrv = Math.min(100, Math.round((sets / cfg.mrv) * 100));

          let zone = "Under MEV";
          let zoneColor = "text-zinc-500";
          let barBg = "bg-zinc-700";

          if (sets >= cfg.mrv) {
            zone = "Near MRV (High Fatigue)";
            zoneColor = "text-rose-400 font-bold";
            barBg = "bg-rose-500";
          } else if (sets >= cfg.mavMin) {
            zone = "Optimal MAV";
            zoneColor = "text-[var(--progress-purple-light)] font-bold";
            barBg = "bg-[var(--progress-purple-light)]";
          } else if (sets >= cfg.mev) {
            zone = "MEV (Stimulating)";
            zoneColor = "text-white font-semibold";
            barBg = "bg-purple-600";
          }

          return (
            <div key={cfg.muscle} className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">{cfg.muscle}</span>
                <span className={`text-[11px] ${zoneColor}`}>
                  <strong className="text-white">{sets}</strong> / {cfg.mavMin}-{cfg.mavMax} sets · {zone}
                </span>
              </div>
              <div className="bg-[#16121C] relative h-2 w-full overflow-hidden rounded-full border border-zinc-800">
                {/* Marker for MEV */}
                <div
                  className="bg-zinc-600 absolute top-0 bottom-0 w-0.5 z-10"
                  style={{ left: `${(cfg.mev / cfg.mrv) * 100}%` }}
                />
                {/* Marker for MAV min */}
                <div
                  className="bg-[var(--progress-purple)] absolute top-0 bottom-0 w-0.5 z-10"
                  style={{ left: `${(cfg.mavMin / cfg.mrv) * 100}%` }}
                />
                {/* Progress fill */}
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barBg}`}
                  style={{ width: `${Math.max(4, pctOfMrv)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
