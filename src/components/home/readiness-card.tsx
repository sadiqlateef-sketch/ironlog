"use client";

import { useEffect, useState } from "react";
import { BatteryCharging, Heart, Moon, RefreshCw, Settings2, ShieldCheck, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  computeReadinessReport,
  loadSavedReadinessMetrics,
  saveReadinessMetrics,
  type ReadinessMetrics,
  type ReadinessReport,
} from "@/lib/readiness";
import { computeRecovery, LOOKBACK_HOURS, type MuscleRecovery } from "@/lib/recovery";
import { getMuscleSets } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const LEVEL_THEMES = {
  optimal: {
    color: "text-emerald-400",
    stroke: "stroke-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    glow: "shadow-[0_0_24px_rgba(16,185,129,0.18)]",
  },
  ready: {
    color: "text-sky-400",
    stroke: "stroke-sky-500",
    bg: "bg-sky-500/10 border-sky-500/30",
    glow: "shadow-[0_0_24px_rgba(14,165,233,0.18)]",
  },
  moderate: {
    color: "text-amber-400",
    stroke: "stroke-amber-500",
    bg: "bg-amber-500/10 border-amber-500/30",
    glow: "shadow-[0_0_24px_rgba(245,158,11,0.18)]",
  },
  fatigued: {
    color: "text-rose-400",
    stroke: "stroke-rose-500",
    bg: "bg-rose-500/10 border-rose-500/30",
    glow: "shadow-[0_0_24px_rgba(244,63,94,0.18)]",
  },
} as const;

export function ReadinessCard() {
  const [metrics, setMetrics] = useState<ReadinessMetrics>(loadSavedReadinessMetrics);
  const [recovery, setRecovery] = useState<MuscleRecovery[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Form edit states
  const [sleepHours, setSleepHours] = useState(String(metrics.sleepHours ?? 7.5));
  const [sleepQuality, setSleepQuality] = useState(String(metrics.sleepQuality ?? 85));
  const [restingHr, setRestingHr] = useState(String(metrics.restingHr ?? 58));

  useEffect(() => {
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => setRecovery(computeRecovery(sets)))
      .catch(() => setRecovery([]));
  }, []);

  const report: ReadinessReport = computeReadinessReport(recovery ?? 100, metrics);
  const theme = LEVEL_THEMES[report.level];

  function handleSaveMetrics() {
    const updated: ReadinessMetrics = {
      ...metrics,
      sleepHours: parseFloat(sleepHours) || 7.5,
      sleepQuality: parseInt(sleepQuality, 10) || 85,
      restingHr: parseInt(restingHr, 10) || 58,
    };
    setMetrics(updated);
    saveReadinessMetrics(updated);
    setEditOpen(false);
  }

  // SVG Gauge Calculations
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (report.score / 100) * circumference;

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden border p-4 transition-all duration-300",
          theme.bg,
          theme.glow
        )}
        data-testid="readiness-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-background/60 shadow-inner">
              <Zap className={cn("size-4", theme.color)} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-foreground text-xs font-bold tracking-wider uppercase">Daily Readiness</h3>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                    theme.color,
                    "bg-background/80"
                  )}
                >
                  {report.label}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">{report.summary}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={() => setEditOpen(true)}
            aria-label="Adjust sleep and recovery metrics"
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>

        {/* Main Score and Metric Grid */}
        <div className="mt-4 flex items-center gap-4">
          {/* Radial Ring */}
          <div className="relative flex size-20 shrink-0 items-center justify-center">
            <svg className="size-full -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r={radius}
                className="stroke-muted/30"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="40"
                cy="40"
                r={radius}
                className={cn("transition-all duration-1000 ease-out", theme.stroke)}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={cn("num text-2xl font-black leading-none", theme.color)}>
                {report.score}
              </span>
              <span className="text-muted-foreground text-[9px] font-semibold uppercase">Score</span>
            </div>
          </div>

          {/* Metric Breakdown Bars */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <BatteryCharging className="size-3.5 text-emerald-400" /> Muscle Rest
              </span>
              <span className="font-semibold num">{report.factors.muscleScore}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${report.factors.muscleScore}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Moon className="size-3.5 text-sky-400" /> Sleep Duration
              </span>
              <span className="font-semibold num">
                {metrics.sleepHours ?? 7.5}h ({report.factors.sleepScore}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500"
                style={{ width: `${report.factors.sleepScore}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Heart className="size-3.5 text-rose-400" /> Resting HR
              </span>
              <span className="font-semibold num">
                {metrics.restingHr ?? 58} bpm ({report.factors.cardioScore}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-rose-500 transition-all duration-500"
                style={{ width: `${report.factors.cardioScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Actionable recommendation */}
        <div className="mt-3.5 rounded-lg bg-background/70 p-2.5 text-xs text-foreground/90 border border-border/40">
          <p className="flex items-start gap-1.5 leading-relaxed">
            <ShieldCheck className={cn("size-4 shrink-0 mt-0.5", theme.color)} />
            <span>
              <strong className="font-semibold">Coaching Directive:</strong> {report.recommendation}
            </span>
          </p>
        </div>
      </Card>

      {/* Edit Health & Sleep Sheet */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Readiness Inputs</DialogTitle>
            <DialogDescription>
              Adjust your sleep duration and resting vitals to tailor today's readiness score.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">Sleep Duration (Hours)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="16"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm font-semibold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">Sleep Quality (0 - 100%)</label>
              <input
                type="number"
                step="5"
                min="10"
                max="100"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(e.target.value)}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm font-semibold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">Resting Heart Rate (BPM)</label>
              <input
                type="number"
                step="1"
                min="35"
                max="120"
                value={restingHr}
                onChange={(e) => setRestingHr(e.target.value)}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm font-semibold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMetrics}>
              Save Metrics
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
