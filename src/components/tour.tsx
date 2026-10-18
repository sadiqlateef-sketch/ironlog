"use client";

// A four-screen tour on a fresh install (after the welcome questions for a
// new account): where things are, the workout bar, search and appearance.
// Replay it from More > Take the tour.

import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChartLine, Dumbbell, House, Menu, Palette, Search, SkipForward, Timer, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/types/database";
import { cn } from "@/lib/utils";

const TOUR_KEY = "ironlog.tourSeen";
export const TOUR_EVENT = "ironlog:tour";

/** Show the tour again (More > Take the tour). */
export function replayTour(): void {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

function seen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true; // Can't remember it was shown, so don't show it every time.
  }
}

/** Whether the tour is showing: once per install, after the welcome questions. */
export function useTour(profile: Tables<"users"> | null | undefined, pathname: string) {
  // Read once; the shell only shows anything after sign-in, so this never runs in the prerendered page's output.
  const [done, setDone] = useState(() => typeof window === "undefined" || seen());
  const [replay, setReplay] = useState(false);
  const ready = !!profile && profile.onboarded_at !== null && !pathname.startsWith("/welcome");
  useEffect(() => {
    const show = () => setReplay(true);
    window.addEventListener(TOUR_EVENT, show);
    return () => window.removeEventListener(TOUR_EVENT, show);
  }, []);
  return {
    open: replay || (ready && !done),
    finish: () => {
      try {
        localStorage.setItem(TOUR_KEY, "1");
      } catch {}
      setDone(true);
      setReplay(false);
    },
  };
}

const STEPS = [
  {
    title: "Built for heavy lifting",
    body: "Tap the check to log a set. The rest timer starts on its own, and last time's weight and reps sit right next to what you're typing.",
    art: <LogArt />,
  },
  {
    title: "Four tabs, nothing buried",
    body: "Home has today's workout and how recovered you are. Workout starts or resumes one. Progress has your charts and records. More holds programs, imports, the watch and settings.",
    art: <TabsArt />,
  },
  {
    title: "Your workout follows you",
    body: "Leave the workout screen and a bar keeps your workout time and rest countdown on every screen. Tap it to jump back. The back button never closes a workout.",
    art: <BarArt />,
  },
  {
    title: "Find anything, see it your way",
    body: "Search finds exercises, past workouts and programs in one place. Settings > Appearance has light mode and bigger text for reading mid-set.",
    art: <SearchArt />,
  },
];

export function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onDone()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-testid="tour"
          className="bg-background fixed inset-0 z-[60] flex flex-col overflow-y-auto px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none"
          style={{
            backgroundImage:
              "radial-gradient(60% 40% at 0% 0%, var(--glow-1), transparent 70%), radial-gradient(55% 40% at 100% 45%, var(--glow-2), transparent 70%)",
          }}
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <div className="flex justify-end">
              {!last && (
                <Button variant="ghost" size="sm" onClick={onDone}>
                  Skip
                </Button>
              )}
            </div>
            <div key={i} className="page-in flex flex-1 flex-col justify-center gap-8 py-6">
              <div className="grid place-items-center" aria-hidden>
                {step.art}
              </div>
              <div className="flex flex-col gap-2 text-center">
                <p className="text-primary-text text-xs font-bold tracking-wide uppercase">
                  {i + 1} of {STEPS.length}
                </p>
                <DialogPrimitive.Title className="text-2xl font-bold tracking-tight">{step.title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-muted-foreground text-base">{step.body}</DialogPrimitive.Description>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex justify-center gap-2" aria-hidden>
                {STEPS.map((_, j) => (
                  <span key={j} className={cn("h-2 rounded-full transition-all", j === i ? "bg-primary w-6" : "bg-foreground/25 w-2")} />
                ))}
              </div>
              <div className="flex gap-3">
                {i > 0 && (
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setI(i - 1)}>
                    Back
                  </Button>
                )}
                <Button size="lg" className="flex-[2]" onClick={() => (last ? onDone() : setI(i + 1))}>
                  {last ? "Let's lift" : "Next"}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---- Little pictures of the real UI ----

function LogArt() {
  return (
    <div className="glass flex w-64 flex-col gap-2 rounded-2xl p-4">
      <p className="text-sm font-bold">Bench Press</p>
      {[
        ["225", "5", true],
        ["225", "5", true],
        ["225", "5", false],
      ].map(([w, r, done], k) => (
        <div key={k} className={cn("flex items-center gap-2 rounded-xl p-1.5", done && "bg-success/10")}>
          <span className="text-muted-foreground w-4 text-xs">{k + 1}</span>
          <span className="bg-secondary flex-1 rounded-lg py-1.5 text-center font-mono font-bold">{w}</span>
          <span className="bg-secondary flex-1 rounded-lg py-1.5 text-center font-mono font-bold">{r}</span>
          <span className={cn("grid size-8 place-items-center rounded-lg text-xs font-bold", done ? "bg-success text-[#08200d]" : "bg-secondary")}>✓</span>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">Last time: 220 × 5</p>
    </div>
  );
}

function TabsArt() {
  return (
    <ul className="glass-strong grid w-72 grid-cols-4 rounded-3xl">
      {[
        [House, "Home"],
        [Dumbbell, "Workout"],
        [ChartLine, "Progress"],
        [Menu, "More"],
      ].map(([Icon, label], k) => {
        const I = Icon as typeof House;
        return (
          <li key={k} className={cn("flex flex-col items-center gap-1 py-3 text-xs font-semibold", k === 0 ? "text-primary-text" : "text-muted-foreground")}>
            <I className="size-6" />
            {label as string}
          </li>
        );
      })}
    </ul>
  );
}

function BarArt() {
  return (
    <div className="flex w-72 flex-col gap-3">
      <div className="glass flex flex-col gap-2 rounded-2xl p-4 opacity-60">
        <div className="bg-foreground/15 h-3 w-1/2 rounded" />
        <div className="bg-foreground/10 h-3 w-3/4 rounded" />
        <div className="bg-foreground/10 h-3 w-2/3 rounded" />
      </div>
      <div className="glass-strong relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-2.5">
        <div className="bg-primary/25 absolute inset-y-0 left-0 w-3/5" />
        <span className="bg-success relative size-2.5 rounded-full" />
        <span className="relative flex-1">
          <span className="text-muted-foreground block text-xs">Resting · Push Day</span>
          <span className="block font-mono text-xl font-extrabold">1:24</span>
        </span>
        <Timer className="text-muted-foreground relative size-5" />
        <SkipForward className="relative size-5" />
      </div>
    </div>
  );
}

function SearchArt() {
  return (
    <div className="flex w-72 flex-col gap-3">
      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <Search className="text-muted-foreground size-5" />
        <span className="text-muted-foreground text-sm">Search exercises, workouts…</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="glass flex flex-col items-center gap-1 rounded-2xl p-3 text-sm font-semibold">
          <Palette className="text-primary-text size-6" /> Light or dark
        </div>
        <div className="glass flex flex-col items-center gap-1 rounded-2xl p-3 text-sm font-semibold">
          <Type className="text-primary-text size-6" /> Bigger text
        </div>
      </div>
    </div>
  );
}
