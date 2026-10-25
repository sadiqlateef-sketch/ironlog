"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import {
  useOverloadSettings,
  type ProgressionTrigger,
  type OverloadSettings,
} from "@/lib/overload-settings";
import { PHASES, getPhaseForWeek } from "@/lib/periodization";
import { Sliders, Sparkles, Check, Flame, ShieldAlert, ArrowRight } from "lucide-react";

export function OverloadSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { unit } = useAuth();
  const { settings, update } = useOverloadSettings();
  const [draft, setDraft] = useState<OverloadSettings>(settings);

  // Sync draft when opened
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(settings);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = () => {
    update(draft);
    onOpenChange(false);
  };

  const currentPhase = getPhaseForWeek(draft.currentMesocycleWeek, draft.totalMesocycleWeeks);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="pr-0">
          <div className="flex items-center gap-2 text-primary-text font-bold text-xs uppercase tracking-wider">
            <Sliders className="size-4" /> Progressive Overload & Periodization
          </div>
          <DialogTitle className="text-xl font-black">Progression Rules</DialogTitle>
          <DialogDescription className="text-xs">
            Scientific load & rep progression customized to your training style and recovery.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* SECTION 1: Periodization Mesocycle Wave */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">Auto-Apply Periodization</span>
                <p className="text-muted-foreground text-[11px]">
                  Automatically adjusts load & reps for each mesocycle phase
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.autoApplyPeriodization}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    autoApplyPeriodization: !prev.autoApplyPeriodization,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  draft.autoApplyPeriodization ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                    draft.autoApplyPeriodization ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {draft.autoApplyPeriodization && (
              <div className="mt-2 flex flex-col gap-3 pt-2 border-t border-border/40">
                {/* Active Phase Banner */}
                <div className={`rounded-xl p-3 border ${currentPhase.badgeColor}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Current: {currentPhase.label}
                    </span>
                    <span className="text-[11px] font-semibold">
                      {currentPhase.targetRpe} · {currentPhase.rirTarget}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 text-foreground/80 leading-relaxed">
                    {currentPhase.description}
                  </p>
                </div>

                {/* Week Selector */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Mesocycle Week</span>
                    <span className="font-bold text-foreground">
                      Week {draft.currentMesocycleWeek} of {draft.totalMesocycleWeeks}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {[1, 2, 3, 4, 5, 6].map((w) => {
                      const ph = getPhaseForWeek(w, draft.totalMesocycleWeeks);
                      const isSelected = draft.currentMesocycleWeek === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, currentMesocycleWeek: w }))}
                          className={`rounded-lg py-2 text-center text-xs font-bold transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-secondary/70 text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          W{w}
                          <span className="block text-[9px] font-normal opacity-80">
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
              </div>
            )}
          </div>

          {/* SECTION 2: Double Progression Increments */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-3.5">
            <div>
              <span className="text-sm font-bold text-foreground">Double-Progression Increments</span>
              <p className="text-muted-foreground text-[11px]">
                Weight automatically added when you conquer your target reps
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Upper Compound */}
              <div className="flex flex-col gap-1 rounded-xl bg-card border border-border/40 p-2.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Upper Compound
                </span>
                <span className="text-xs text-muted-foreground">Bench, Press, Row</span>
                <div className="mt-1 flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    value={unit === "imperial" ? draft.upperCompoundIncLb : draft.upperCompoundIncKg}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      if (unit === "imperial") {
                        setDraft((prev) => ({ ...prev, upperCompoundIncLb: val }));
                      } else {
                        setDraft((prev) => ({ ...prev, upperCompoundIncKg: val }));
                      }
                    }}
                    className="h-8 text-xs font-bold num"
                  />
                  <span className="text-xs font-bold text-muted-foreground">{unit === "imperial" ? "lb" : "kg"}</span>
                </div>
              </div>

              {/* Lower Compound */}
              <div className="flex flex-col gap-1 rounded-xl bg-card border border-border/40 p-2.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Lower Compound
                </span>
                <span className="text-xs text-muted-foreground">Squat, Deadlift, Leg Press</span>
                <div className="mt-1 flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    value={unit === "imperial" ? draft.lowerCompoundIncLb : draft.lowerCompoundIncKg}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      if (unit === "imperial") {
                        setDraft((prev) => ({ ...prev, lowerCompoundIncLb: val }));
                      } else {
                        setDraft((prev) => ({ ...prev, lowerCompoundIncKg: val }));
                      }
                    }}
                    className="h-8 text-xs font-bold num"
                  />
                  <span className="text-xs font-bold text-muted-foreground">{unit === "imperial" ? "lb" : "kg"}</span>
                </div>
              </div>

              {/* Isolation */}
              <div className="flex flex-col gap-1 rounded-xl bg-card border border-border/40 p-2.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Isolation
                </span>
                <span className="text-xs text-muted-foreground">Curls, Raises, Extensions</span>
                <div className="mt-1 flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    value={unit === "imperial" ? draft.isolationIncLb : draft.isolationIncKg}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      if (unit === "imperial") {
                        setDraft((prev) => ({ ...prev, isolationIncLb: val }));
                      } else {
                        setDraft((prev) => ({ ...prev, isolationIncKg: val }));
                      }
                    }}
                    className="h-8 text-xs font-bold num"
                  />
                  <span className="text-xs font-bold text-muted-foreground">{unit === "imperial" ? "lb" : "kg"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Progression Trigger Condition */}
          <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-secondary/30 p-3.5">
            <span className="text-sm font-bold text-foreground">Progression Trigger Condition</span>
            <p className="text-muted-foreground text-[11px]">
              When should the engine recommend stepping up load?
            </p>

            <div className="flex flex-col gap-1.5 mt-1">
              {[
                {
                  id: "all_sets_top" as ProgressionTrigger,
                  label: "All Sets Hit Top Bracket (Strict)",
                  desc: "Recommended for hypertrophy & joint health. Must complete top rep range on every set.",
                },
                {
                  id: "first_set_top" as ProgressionTrigger,
                  label: "First Set Hits Top (Top-Set Overload)",
                  desc: "Increase if top set completes maximum reps, regardless of drop-off on later sets.",
                },
                {
                  id: "two_thirds_top" as ProgressionTrigger,
                  label: "At Least 2/3 of Sets Hit Top",
                  desc: "Balanced trigger for high-volume programs (e.g. 2 out of 3 sets).",
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, progressionTrigger: opt.id }))}
                  className={`flex items-start gap-2.5 rounded-xl p-2.5 text-left transition-all ${
                    draft.progressionTrigger === opt.id
                      ? "bg-primary/10 border border-primary/30 text-foreground"
                      : "bg-card border border-border/30 text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  <div
                    className={`mt-0.5 size-4 rounded-full border flex items-center justify-center shrink-0 ${
                      draft.progressionTrigger === opt.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {draft.progressionTrigger === opt.id && <Check className="size-2.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-foreground">{opt.label}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 4: Auto-Deload on Fatigue */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">Auto-Deload Safeguard</span>
                <p className="text-muted-foreground text-[11px]">
                  Detects accumulated fatigue or plateau and suggests a recovery reduction
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.autoDeloadOnMiss}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    autoDeloadOnMiss: !prev.autoDeloadOnMiss,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  draft.autoDeloadOnMiss ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                    draft.autoDeloadOnMiss ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {draft.autoDeloadOnMiss && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                <div className="flex flex-col gap-1 rounded-xl bg-card border border-border/40 p-2.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Miss Threshold
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      type="number"
                      min="1"
                      max="6"
                      value={draft.missRepThreshold}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          missRepThreshold: parseInt(e.target.value) || 3,
                        }))
                      }
                      className="h-8 text-xs font-bold num"
                    />
                    <span className="text-xs text-muted-foreground">reps short</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-xl bg-card border border-border/40 p-2.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Deload Cut
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      type="number"
                      min="5"
                      max="25"
                      step="5"
                      value={draft.deloadPercent}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          deloadPercent: parseInt(e.target.value) || 10,
                        }))
                      }
                      className="h-8 text-xs font-bold num"
                    />
                    <span className="text-xs text-muted-foreground">% load</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5 font-bold">
            <Check className="size-4" /> Save Progression Rules
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
