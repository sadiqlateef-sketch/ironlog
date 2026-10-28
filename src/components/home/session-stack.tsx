"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Dumbbell, Heart, Layers, List, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatWeight, type UnitSystem } from "@/lib/units";
import type { WorkoutSession } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

interface SessionStackProps {
  sessions: WorkoutSession[];
  unit: UnitSystem;
  onOpen: (id: string) => void;
}

export function SessionStack({ sessions, unit, onOpen }: SessionStackProps) {
  const [deckMode, setDeckMode] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!sessions.length) return null;

  const current = sessions[currentIndex] ?? sessions[0];
  const next1 = sessions[currentIndex + 1];
  const next2 = sessions[currentIndex + 2];

  function handleNext() {
    setCurrentIndex((i) => (i + 1 < sessions.length ? i + 1 : 0));
  }

  function handlePrev() {
    setCurrentIndex((i) => (i - 1 >= 0 ? i - 1 : sessions.length - 1));
  }

  return (
    <section className="mt-2 flex flex-col gap-3">
      {/* Header with Title and Mode Switch */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            History
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {sessions.length} sessions
          </span>
        </div>

        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={() => setDeckMode((d) => !d)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              title={deckMode ? "Switch to list view" : "Switch to deck stack"}
            >
              {deckMode ? (
                <>
                  <List className="size-3.5" /> List
                </>
              ) : (
                <>
                  <Layers className="size-3.5" /> Deck
                </>
              )}
            </button>
          )}

          <Link
            href="/search/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <Search className="size-3" /> Search
          </Link>
        </div>
      </div>

      {deckMode && sessions.length > 1 ? (
        /* Physical Deck of Cards View */
        <div className="relative pt-2 pb-4">
          <div className="relative mx-auto h-40 w-full max-w-md">
            {/* Background Peek Card 2 */}
            {next2 && (
              <div
                className="absolute inset-x-2 top-0 h-36 rounded-2xl border border-border/40 bg-card/40 -rotate-2 scale-[0.92] translate-y-4 opacity-50 shadow-sm pointer-events-none transition-all duration-300"
                aria-hidden
              />
            )}

            {/* Background Peek Card 1 */}
            {next1 && (
              <div
                className="absolute inset-x-1 top-0 h-36 rounded-2xl border border-border/60 bg-card/70 rotate-2 scale-[0.96] translate-y-2 opacity-75 shadow-md pointer-events-none transition-all duration-300"
                aria-hidden
              />
            )}

            {/* Active Front Card */}
            <Card
              className="relative z-30 flex h-36 flex-col justify-between overflow-hidden border border-border/80 bg-card p-4 shadow-xl hover:border-primary/50 transition-all cursor-pointer active:scale-[0.99]"
              onClick={() => onOpen(current.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onOpen(current.id)}
              aria-label={`View ${current.name ?? "Workout"}`}
            >
              {/* Card top */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-primary/20 text-primary-text">
                      <Dumbbell className="size-3.5" />
                    </span>
                    <h3 className="truncate text-base font-black tracking-tight text-foreground">
                      {current.name ?? "Workout Session"}
                    </h3>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs font-medium">
                    {new Date(current.start_time).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {current.end_time &&
                      ` · ${Math.round((+new Date(current.end_time) - +new Date(current.start_time)) / 60000)} min`}
                    {current.avg_hr != null && (
                      <span className="ml-1 inline-flex items-center gap-0.5" title={`Max ${current.max_hr} bpm`}>
                        · <Heart className="size-3 text-rose-400" aria-hidden /> {current.avg_hr} bpm
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-end">
                  <span className="num text-base font-black text-foreground">
                    {formatWeight(current.volume, unit)}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Volume</span>
                </div>
              </div>

              {/* Card Bottom: Navigation Controls */}
              <div
                className="flex items-center justify-between border-t border-border/50 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-muted-foreground font-mono text-[11px] font-bold">
                  Card {currentIndex + 1} of {sessions.length}
                </span>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={handlePrev}
                    aria-label="Previous session in deck"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={handleNext}
                    aria-label="Next session in deck"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Classic Flat List View */
        <div className="flex flex-col gap-2">
          {sessions.slice(0, 4).map((s) => (
            <Card key={s.id} className="p-0 border-border/60 hover:border-primary/50 transition-colors">
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                aria-label={`${s.name ?? "Workout"}: view, edit or delete`}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name ?? "Workout"}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(s.start_time).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {s.end_time && ` · ${Math.round((+new Date(s.end_time) - +new Date(s.start_time)) / 60000)} min`}
                    {s.avg_hr != null && (
                      <span className="ml-1 inline-flex items-center gap-0.5" title={`Max ${s.max_hr} bpm`}>
                        · <Heart className="size-3" aria-hidden /> {s.avg_hr} bpm avg
                      </span>
                    )}
                  </p>
                </div>
                <p className="shrink-0 num text-sm font-semibold">{formatWeight(s.volume, unit)}</p>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
