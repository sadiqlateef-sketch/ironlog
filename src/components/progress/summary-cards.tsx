"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ExerciseDetail } from "@/components/exercise-detail";
import { useAuth } from "@/components/providers/auth-provider";
import type { StatsData } from "@/components/progress/overview";
import { Card } from "@/components/ui/card";
import { LIFT_LABELS } from "@/lib/insights";
import { mainLifts, needsAttention, newPrsThisWeek } from "@/lib/progress-summary";
import { thisWeek } from "@/lib/stats";
import type { Exercise } from "@/lib/workout-api";

const compact = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString());

/** A tiny trend line with no axes. */
function Spark({ points }: { points: { at: number; value: number }[] }) {
  if (points.length < 2) return <span className="text-muted-foreground text-xs">one workout so far</span>;
  const xs = points.map((p) => p.at);
  const ys = points.map((p) => p.value);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const d = points
    .map((p, i) => `${i ? "L" : "M"} ${(((p.at - x0) / (x1 - x0 || 1)) * 100).toFixed(1)} ${(18 - ((p.value - y0) / (y1 - y0 || 1)) * 16 - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 18" preserveAspectRatio="none" className="text-primary h-5 w-full" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The three cards at the top of Progress: this week, the main lifts, and what needs attention. */
export function SummaryCards({ data }: { data: StatsData }) {
  const { unit, profile } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [open, setOpen] = useState<Exercise | null>(null);

  const week = thisWeek(data.sessions, data.now);
  const prs = useMemo(() => newPrsThisWeek(data.sets, data.now), [data.sets, data.now]);
  const lifts = useMemo(() => mainLifts(data.sets, (id) => data.exercises.get(id)?.slug, data.now), [data.sets, data.exercises, data.now]);
  const stalled = useMemo(() => needsAttention(data.sets, u, data.now), [data.sets, u, data.now]);
  const target = profile?.training_days_per_week ?? null;
  const stalledEx = stalled ? data.exercises.get(stalled.exerciseId) : undefined;

  return (
    <div className="flex flex-col gap-3" data-testid="progress-summary">
      <Card className="flex flex-col gap-3 p-4" data-testid="summary-week">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">This week</h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="num text-3xl font-bold">
              {week.workouts}
              {target ? <span className="text-muted-foreground text-base font-semibold"> / {target}</span> : null}
            </p>
            <p className="text-muted-foreground text-sm">{week.workouts === 1 ? "workout" : "workouts"}</p>
          </div>
          <div>
            <p className="num text-3xl font-bold">{compact(week.volume)}</p>
            <p className="text-muted-foreground text-sm">{u} volume</p>
          </div>
          <div>
            <p className="num text-3xl font-bold">{prs}</p>
            <p className="text-muted-foreground text-sm">{prs === 1 ? "new PR" : "new PRs"}</p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-4" data-testid="summary-lifts">
        <h2 className="text-muted-foreground flex justify-between text-xs font-semibold tracking-wide uppercase">
          <span>Main lifts · est. 1RM</span>
        </h2>
        {lifts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Log squat, bench, deadlift or overhead press and their trends show up here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lifts.map((l) => {
              const ex = data.exercises.get(l.exerciseId);
              return (
                <li key={l.lift}>
                  <button
                    type="button"
                    onClick={() => ex && setOpen(ex)}
                    className="hover:bg-accent grid w-full grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-1 py-1.5 text-left"
                  >
                    <span className="truncate font-semibold">{LIFT_LABELS[l.lift].replace(" press", "").replace("Overhead", "OHP")}</span>
                    <Spark points={l.points} />
                    <span className="flex items-baseline gap-2">
                      <span className="num text-lg font-bold">{Math.round(l.current)}</span>
                      {l.flatWeeks ? (
                        <span className="text-set-warmup text-xs font-semibold">flat {l.flatWeeks} wk</span>
                      ) : l.change != null ? (
                        <span className={`num text-xs font-semibold ${l.change >= 0 ? "text-success" : "text-set-failure"}`}>
                          {l.change >= 0 ? "+" : "−"}
                          {Math.round(Math.abs(l.change))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-1 p-4" data-testid="summary-attention">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Needs attention</h2>
        {stalled && stalledEx ? (
          <button type="button" onClick={() => setOpen(stalledEx)} className="flex items-center justify-between gap-2 text-left text-sm">
            <span>
              {stalledEx.name} hasn&apos;t set a new best in {stalled.stalled} workouts.{" "}
              <span className="text-primary-text font-semibold">See options</span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing stuck. Every lift you&apos;ve trained lately is moving.</p>
        )}
      </Card>

      <ExerciseDetail exercise={open} tab="overview" onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
