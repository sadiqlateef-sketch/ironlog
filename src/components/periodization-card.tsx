"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, Sparkles, Sliders, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveProgram } from "@/components/up-next";
import { useOverloadSettings } from "@/lib/overload-settings";
import { getPhaseForWeek } from "@/lib/periodization";
import { OverloadSettingsSheet } from "@/components/overload-settings-sheet";

/**
 * Periodization & Progressive Overload Control Center:
 * Displays active mesocycle wave progression, live phase metrics (RPE/RIR),
 * and allows toggling auto-apply periodization and customizing progression rules.
 */
export function PeriodizationCard() {
  const progress = useActiveProgram();
  const { settings, update } = useOverloadSettings();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeWeek = progress?.next_week ?? settings.currentMesocycleWeek;
  const currentPhase = getPhaseForWeek(activeWeek, settings.totalMesocycleWeeks);

  return (
    <>
      <Card className="gap-3 p-4 border-border/80 transition-all" data-testid="periodization-card">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 text-primary-text rounded-xl p-2">
              <CalendarRange className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-primary-text text-xs font-bold tracking-wide uppercase">
                  Periodization Engine
                </span>
                {settings.autoApplyPeriodization && (
                  <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.2 text-[10px] font-bold">
                    Auto-Apply ON
                  </span>
                )}
              </div>
              <h3 className="font-extrabold text-foreground text-base tracking-tight">
                {progress ? progress.program_name : "Adaptive Mesocycle Waves"}
              </h3>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSheetOpen(true)}
            className="h-8 gap-1.5 text-xs font-bold border-border/60 hover:bg-secondary"
          >
            <Sliders className="size-3.5" /> Customize Rules
          </Button>
        </div>

        {/* Phase Pill Banner */}
        <div className={`mt-1 rounded-xl p-3 border ${currentPhase.badgeColor}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">
              Week {activeWeek}: {currentPhase.label} Phase
            </span>
            <span className="text-[11px] font-semibold">
              {currentPhase.targetRpe} · {currentPhase.rirTarget}
            </span>
          </div>
          <p className="text-[11px] mt-1 text-foreground/80 leading-relaxed">
            {currentPhase.description}
          </p>
        </div>

        {/* Mesocycle Progress Bar / Week Selector */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Mesocycle Wave Progress</span>
            <span>
              {progress
                ? `${progress.done} of ${progress.total} workouts completed`
                : `Week ${activeWeek} of ${settings.totalMesocycleWeeks}`}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {[1, 2, 3, 4, 5, 6].map((w) => {
              const ph = getPhaseForWeek(w, settings.totalMesocycleWeeks);
              const isSelected = activeWeek === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => update({ currentMesocycleWeek: w })}
                  className={`rounded-lg py-1.5 text-center text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary-text"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  W{w}
                  <span className="block text-[8px] font-normal opacity-75">
                    {ph.phase === "accumulation"
                      ? "Acc"
                      : ph.phase === "intensification"
                      ? "Int"
                      : ph.phase === "peak"
                      ? "Peak"
                      : "Del"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Auto-Apply Toggle Row */}
        <div className="bg-secondary/40 border border-border/40 mt-1 flex items-center justify-between rounded-xl px-3 py-2 text-xs">
          <div>
            <span className="font-semibold text-foreground">Auto-adjust load & reps for own exercises</span>
            <p className="text-[11px] text-muted-foreground">
              Periodizes weights (+2.5-5%) and reps per phase
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoApplyPeriodization}
            onClick={() => update({ autoApplyPeriodization: !settings.autoApplyPeriodization })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              settings.autoApplyPeriodization ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                settings.autoApplyPeriodization ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </Card>

      <OverloadSettingsSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
