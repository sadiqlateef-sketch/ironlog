"use client";

import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatWeight, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { WorkoutSession } from "@/lib/workout-api";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** The Monday of the week that holds `now`, at local midnight. */
export function weekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Monday to Sunday Crystal Ball timeline, with glowing orbs representing training cadence. */
export function WeekStrip({
  sessions,
  unit,
  now,
}: {
  sessions: WorkoutSession[] | null;
  unit: UnitSystem;
  now: Date;
}) {
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const thisWeek = (sessions ?? []).filter(
    (s) => s.end_time && +new Date(s.start_time) >= +start && +new Date(s.start_time) < +end
  );
  const trained = new Set(thisWeek.map((s) => (new Date(s.start_time).getDay() + 6) % 7));
  const today = (now.getDay() + 6) % 7;
  const volume = thisWeek.reduce((sum, s) => sum + (s.volume ?? 0), 0);

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="week-strip">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Weekly Orbit
        </h2>
        {volume > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary-text">
            <Sparkles className="size-2.5" />
            {formatWeight(volume, unit)}
          </span>
        )}
      </div>

      {/* Crystal Ball Orbs */}
      <div className="grid grid-cols-7 gap-1.5 py-1">
        {DAYS.map((d, i) => {
          const isTrained = trained.has(i);
          const isToday = i === today;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span
                data-trained={isTrained ? "true" : "false"}
                aria-label={`${
                  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]
                }${isTrained ? ", trained" : ""}${isToday ? ", today" : ""}`}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-xl text-sm font-black transition-all duration-300",
                  isTrained
                    ? "bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground shadow-[0_0_14px_rgba(var(--primary-rgb,239,68,68),0.35)] scale-[1.02]"
                    : "bg-secondary/70 text-muted-foreground border border-border/40",
                  isToday && "ring-primary-text ring-2 ring-offset-2 ring-offset-background",
                )}
              >
                {/* Core Crystal Orb Aura */}
                {isTrained && (
                  <span className="absolute inset-0 rounded-xl bg-white/20 opacity-40 mix-blend-overlay" />
                )}
                <span className="relative z-10">{d}</span>
              </span>

              {/* Status dot below orb */}
              <span
                className={cn(
                  "size-1 rounded-full transition-colors",
                  isTrained ? "bg-primary-text" : isToday ? "bg-muted-foreground" : "bg-transparent"
                )}
                aria-hidden
              />
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {thisWeek.length} {thisWeek.length === 1 ? "session completed" : "sessions completed"}
        </span>
        <span className="font-semibold text-foreground/80">
          {thisWeek.length >= 3 ? "Consistent Cadence 🔥" : "In Progress"}
        </span>
      </div>
    </Card>
  );
}
