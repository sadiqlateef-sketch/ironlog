"use client";

import { useState } from "react";
import { Activity, Dumbbell, Flame, Layers, Sparkles } from "lucide-react";
import { ProgressIndexHeroCard } from "@/components/progress/progress-index-hero-card";
import { StrengthPatternCard } from "@/components/progress/strength-pattern-card";
import { StimulusVolumeCard } from "@/components/progress/stimulus-volume-card";
import { MovementBalanceCard } from "@/components/progress/movement-balance-card";
import { HypertrophyLandmarksCard } from "@/components/progress/hypertrophy-landmarks-card";
import type { StatsData } from "@/components/progress/overview";

export type ProgressSubTab = "index" | "strength" | "volume" | "balance" | "landmarks";

interface TabItem {
  id: ProgressSubTab;
  label: string;
  shortLabel: string;
  icon: typeof Activity;
}

const TABS: TabItem[] = [
  { id: "index", label: "Progress Index", shortLabel: "Index", icon: Layers },
  { id: "strength", label: "1RM Strength", shortLabel: "Strength", icon: Dumbbell },
  { id: "volume", label: "Stimulus Volume", shortLabel: "Volume", icon: Flame },
  { id: "balance", label: "Movement Balance", shortLabel: "Balance", icon: Activity },
  { id: "landmarks", label: "RP Hypertrophy", shortLabel: "Hypertrophy", icon: Sparkles },
];

/**
 * Stacked Progress Analytics Deck:
 * Cleans up the Progress tab by organizing the high-density progress index & biomechanics cards
 * into clean, responsive stacked sub-tabs with quick switching, eliminating endless scrolling.
 */
export function ProgressAnalyticsDeck({ data }: { data: StatsData }) {
  const [activeTab, setActiveTab] = useState<ProgressSubTab>("index");

  return (
    <div className="flex flex-col gap-3" data-testid="progress-analytics-deck">
      {/* Sub-tab Pill Switcher */}
      <div
        className="flex items-center gap-1 overflow-x-auto rounded-2xl bg-[#140F1D] border border-purple-900/40 p-1.5 shadow-md no-scrollbar"
        role="tablist"
        aria-label="Progress analytics sections"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                isActive
                  ? "bg-[var(--progress-purple)] text-white shadow-md shadow-purple-900/40"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Render active stacked card */}
      <div className="transition-all duration-200">
        {activeTab === "index" && <ProgressIndexHeroCard data={data} />}
        {activeTab === "strength" && <StrengthPatternCard data={data} />}
        {activeTab === "volume" && <StimulusVolumeCard data={data} />}
        {activeTab === "balance" && <MovementBalanceCard data={data} />}
        {activeTab === "landmarks" && <HypertrophyLandmarksCard data={data} />}
      </div>
    </div>
  );
}
