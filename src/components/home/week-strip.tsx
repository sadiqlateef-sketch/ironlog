"use client";

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

/** Monday to Sunday, with the days you trained filled in. */
export function WeekStrip({ sessions, unit, now }: { sessions: WorkoutSession[] | null; unit: UnitSystem; now: Date }) {
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const thisWeek = (sessions ?? []).filter((s) => s.end_time && +new Date(s.start_time) >= +start && +new Date(s.start_time) < +end);
  const trained = new Set(thisWeek.map((s) => (new Date(s.start_time).getDay() + 6) % 7));
  const today = (now.getDay() + 6) % 7;
  const volume = thisWeek.reduce((sum, s) => sum + (s.volume ?? 0), 0);

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="week-strip">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">This week</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d, i) => (
          <span
            key={i}
            data-trained={trained.has(i) ? "true" : "false"}
            aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}${trained.has(i) ? ", trained" : ""}${i === today ? ", today" : ""}`}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg text-sm font-bold",
              trained.has(i) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
              i === today && "ring-primary-text ring-2",
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          {thisWeek.length} {thisWeek.length === 1 ? "workout" : "workouts"}
        </span>
        <span className="num text-foreground font-semibold">{volume > 0 ? formatWeight(volume, unit) : ""}</span>
      </div>
    </Card>
  );
}
