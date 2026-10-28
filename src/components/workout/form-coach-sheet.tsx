"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Gauge, Info, Pause, Play, RotateCcw, ShieldAlert, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExerciseAnimation } from "@/components/exercise-animation";
import { getFormCues, type ExerciseFormCues } from "@/lib/form-coach";
import type { Exercise } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

interface FormCoachSheetProps {
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MetronomePhase = "eccentric" | "pauseBottom" | "concentric" | "pauseTop";

export function FormCoachSheet({ exercise, open, onOpenChange }: FormCoachSheetProps) {
  const [activeTab, setActiveTab] = useState<"tempo" | "checkpoints" | "faults">("tempo");
  const [isPlaying, setIsPlaying] = useState(false);
  const [repsDone, setRepsDone] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Metronome pacing state
  const [phase, setPhase] = useState<MetronomePhase>("eccentric");
  const [secondsInPhase, setSecondsInPhase] = useState(1);

  const cues: ExerciseFormCues = exercise ? getFormCues(exercise) : getFormCues({});
  const tempo = cues.tempoBreakdown;

  // Web Audio tick generator for tempo pacing
  const audioCtxRef = useRef<AudioContext | null>(null);

  function playTick(freq = 600, duration = 0.05) {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  // Pacing metronome loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setPhase((prevPhase) => {
        if (prevPhase === "eccentric") {
          if (secondsInPhase < tempo.eccentricSeconds) {
            setSecondsInPhase((s) => s + 1);
            playTick(500);
            return "eccentric";
          } else {
            setSecondsInPhase(1);
            if (tempo.pauseBottomSeconds > 0) {
              playTick(400);
              return "pauseBottom";
            } else {
              playTick(900);
              return "concentric";
            }
          }
        } else if (prevPhase === "pauseBottom") {
          if (secondsInPhase < tempo.pauseBottomSeconds) {
            setSecondsInPhase((s) => s + 1);
            playTick(400);
            return "pauseBottom";
          } else {
            setSecondsInPhase(1);
            playTick(900);
            return "concentric";
          }
        } else if (prevPhase === "concentric") {
          if (secondsInPhase < tempo.concentricSeconds) {
            setSecondsInPhase((s) => s + 1);
            playTick(750);
            return "concentric";
          } else {
            setSecondsInPhase(1);
            if (tempo.pauseTopSeconds > 0) {
              playTick(600);
              return "pauseTop";
            } else {
              setRepsDone((r) => r + 1);
              playTick(1100, 0.08); // High tone for rep completed
              return "eccentric";
            }
          }
        } else {
          // pauseTop
          if (secondsInPhase < tempo.pauseTopSeconds) {
            setSecondsInPhase((s) => s + 1);
            playTick(600);
            return "pauseTop";
          } else {
            setSecondsInPhase(1);
            setRepsDone((r) => r + 1);
            playTick(1100, 0.08);
            return "eccentric";
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, secondsInPhase, tempo, soundEnabled]);

  function resetMetronome() {
    setIsPlaying(false);
    setPhase("eccentric");
    setSecondsInPhase(1);
    setRepsDone(0);
  }

  const phaseDetails = {
    eccentric: {
      name: "Descent / Eccentric",
      color: "text-amber-400",
      bg: "bg-amber-500/15 border-amber-500/40",
      totalSec: tempo.eccentricSeconds,
      cueText: "Control the weight smoothly",
    },
    pauseBottom: {
      name: "Bottom Pause",
      color: "text-rose-400",
      bg: "bg-rose-500/15 border-rose-500/40",
      totalSec: tempo.pauseBottomSeconds,
      cueText: "Hold tension in the hole",
    },
    concentric: {
      name: "Drive / Concentric",
      color: "text-emerald-400",
      bg: "bg-emerald-500/15 border-emerald-500/40",
      totalSec: tempo.concentricSeconds,
      cueText: "Explode up with intent",
    },
    pauseTop: {
      name: "Top Lockout",
      color: "text-sky-400",
      bg: "bg-sky-500/15 border-sky-500/40",
      totalSec: tempo.pauseTopSeconds,
      cueText: "Reset breath & re-brace",
    },
  }[phase];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary-text">
                <Sparkles className="size-4" />
              </span>
              <div>
                <DialogTitle className="text-base font-bold">
                  {exercise?.name ?? "Exercise"} · Form Coach
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {cues.patternName} · Target ROM: {cues.targetDepthOrRom}
                </DialogDescription>
              </div>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs font-black text-foreground">
              {cues.recommendedTempo}
            </span>
          </div>
        </DialogHeader>

        {/* Visual Animation if available */}
        {exercise && (
          <div className="rounded-xl overflow-hidden border border-border/60 bg-black/40">
            <ExerciseAnimation exercise={exercise} compact />
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("tempo")}
            className={cn(
              "rounded-lg py-1.5 transition-colors",
              activeTab === "tempo" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tempo Metronome
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checkpoints")}
            className={cn(
              "rounded-lg py-1.5 transition-colors",
              activeTab === "checkpoints" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Checkpoints ({cues.checkpoints.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("faults")}
            className={cn(
              "rounded-lg py-1.5 transition-colors",
              activeTab === "faults" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Faults ({cues.commonFaults.length})
          </button>
        </div>

        {/* Tab 1: Tempo Metronome */}
        {activeTab === "tempo" && (
          <div className="flex flex-col items-center gap-4 py-2">
            {/* Live Pulsing Stage */}
            <div
              className={cn(
                "flex w-full flex-col items-center justify-center rounded-2xl border p-6 text-center transition-colors duration-300",
                phaseDetails.bg
              )}
            >
              <span className={cn("text-xs font-bold uppercase tracking-wider", phaseDetails.color)}>
                {phaseDetails.name}
              </span>
              <div className="my-2 flex items-baseline gap-1">
                <span className={cn("font-mono text-5xl font-black", phaseDetails.color)}>
                  {secondsInPhase}
                </span>
                <span className="text-muted-foreground font-mono text-lg">/ {phaseDetails.totalSec}s</span>
              </div>
              <p className="text-muted-foreground text-xs italic">"{phaseDetails.cueText}"</p>

              {/* Reps counter */}
              <div className="mt-4 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs">
                <span className="text-muted-foreground">Cadence Reps:</span>
                <strong className="num text-foreground">{repsDone}</strong>
              </div>
            </div>

            {/* Metronome Controls */}
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSoundEnabled((s) => !s)}
                aria-label={soundEnabled ? "Mute audio cues" : "Unmute audio cues"}
              >
                {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={resetMetronome} aria-label="Reset metronome">
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  onClick={() => setIsPlaying((p) => !p)}
                  className="min-w-28 font-bold"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-1.5 size-4" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 size-4" /> Start Pacing
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Biomechanical Checkpoints */}
        {activeTab === "checkpoints" && (
          <div className="flex flex-col gap-2.5 py-2">
            {cues.checkpoints.map((cp, idx) => (
              <div key={idx} className="rounded-xl border border-border/60 bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <h4 className="text-foreground text-xs font-bold uppercase tracking-wide">
                      {cp.title}
                    </h4>
                  </div>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {cp.phase}
                  </span>
                </div>
                <p className="text-foreground mt-2 text-xs font-semibold leading-relaxed">
                  {cp.cue}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                  <strong className="font-semibold text-primary-text">Biomechanics:</strong> {cp.biomechanicRationale}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Common Faults */}
        {activeTab === "faults" && (
          <div className="flex flex-col gap-2.5 py-2">
            {cues.commonFaults.map((cf, idx) => (
              <div key={idx} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
                <div className="flex items-center gap-2 text-destructive font-bold text-xs uppercase tracking-wide">
                  <ShieldAlert className="size-4" />
                  <h4>{cf.fault}</h4>
                </div>
                <p className="text-foreground mt-2 text-xs font-semibold leading-relaxed">
                  <strong className="text-emerald-400 font-bold">Fix:</strong> {cf.correction}
                </p>
                <p className="text-muted-foreground mt-1.5 text-[11px]">
                  <strong className="font-semibold text-rose-400">Injury Risk:</strong> {cf.riskArea}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
