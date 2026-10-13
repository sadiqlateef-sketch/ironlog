"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calculator, Dumbbell, Heart, LogOut, Play, Sparkles, Watch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlateCalculator } from "@/components/plate-calculator";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatWeight } from "@/lib/units";
import { getActiveSession, listRecentSessions, type WorkoutSession } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { profile, unit, setUnit, signOut } = useAuth();
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [recent, setRecent] = useState<WorkoutSession[] | null>(null);
  const [plates, setPlates] = useState(false);

  useEffect(() => {
    getActiveSession().then(setActive).catch(() => {});
    listRecentSessions().then(setRecent).catch(() => setRecent([]));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <div className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-lg">
          <Dumbbell className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Ironlog</h1>
          <p className="text-muted-foreground truncate text-sm">{profile?.email}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
          <LogOut />
        </Button>
      </header>

      <Button asChild size="lg">
        <Link href="/workout/">
          <Play /> {active ? "Resume workout" : "Start workout"}
        </Link>
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="secondary">
          <Link href="/plans/">
            <Sparkles /> Programs
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/link-watch/">
            <Watch /> Link watch
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setPlates(true)}>
          <Calculator /> Plates
        </Button>
        <div className="bg-secondary grid grid-cols-2 rounded-md p-1" role="group" aria-label="Weight unit">
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              aria-pressed={unit === u}
              className={cn(
                "rounded text-sm font-semibold",
                unit === u ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              {u === "imperial" ? "lb" : "kg"}
            </button>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Recent workouts</h2>
        {recent === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : recent.length === 0 ? (
          <Card className="text-muted-foreground text-sm">No workouts yet. Your first one starts above.</Card>
        ) : (
          recent.map((s) => (
            <Card key={s.id} className="flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name ?? "Workout"}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(s.start_time).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  {s.end_time && ` · ${Math.round((+new Date(s.end_time) - +new Date(s.start_time)) / 60000)} min`}
                  {s.avg_hr != null && (
                    <span className="ml-1 inline-flex items-center gap-0.5" title={`Max ${s.max_hr} bpm`}>
                      · <Heart className="size-3" aria-hidden /> {s.avg_hr} bpm avg
                    </span>
                  )}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm font-semibold">{formatWeight(s.volume, unit)}</p>
            </Card>
          ))
        )}
      </section>

      <PlateCalculator open={plates} onOpenChange={setPlates} />
    </div>
  );
}
