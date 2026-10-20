"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Dumbbell, Heart, History, Search, Sparkles } from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { AppShell } from "@/components/app-shell";
import { TodayCard } from "@/components/home/today-card";
import { SessionSheet } from "@/components/session-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import { useActiveProgram } from "@/components/up-next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useActiveWorkout } from "@/hooks/use-active-workout";
import { formatWeight } from "@/lib/units";
import { listPendingAdjustments, listRecentSessions, type AdjustmentWithContext, type WorkoutSession } from "@/lib/workout-api";

export default function Home() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { profile, unit } = useAuth();
  const workout = useActiveWorkout();
  const [recent, setRecent] = useState<WorkoutSession[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentWithContext[]>([]);
  // Bumped after a workout is edited or deleted, so the list and Today refresh.
  const [reload, setReload] = useState(0);
  const program = useActiveProgram(reload);

  useEffect(() => {
    listRecentSessions().then(setRecent).catch(() => setRecent([]));
    listPendingAdjustments().then(setAdjustments).catch(() => {});
  }, [reload]);

  const name = profile?.display_name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <div className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-lg">
          <Dumbbell className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{name ? `${greeting()}, ${name}` : greeting()}</h1>
          <p className="text-muted-foreground truncate text-sm">Ironlog</p>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Search">
          <Link href="/search/">
            <Search />
          </Link>
        </Button>
      </header>

      <TodayCard workout={workout} program={program} recent={recent} reloadKey={reload} />

      {adjustments.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="home-adjustments">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="text-ai size-3.5" /> Suggested for next time
          </h2>
          <AdjustmentList items={adjustments.slice(0, 3)} onChange={() => setReload((r) => r + 1)} />
          {adjustments.length > 3 && (
            <Link href="/plans/" className="text-primary-text text-sm font-semibold">
              See all {adjustments.length} suggestions
            </Link>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Recent workouts</h2>
        {recent && recent.length > 0 && <p className="text-muted-foreground -mt-1 text-xs">Tap one to see, fix or delete it.</p>}
        {recent === null ? (
          <SkeletonList rows={3} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={History}
            title="Your workouts will show up here"
            action={
              <Button asChild variant="secondary">
                <Link href="/log/">Log one you already did</Link>
              </Button>
            }
          >
            Start one from the Today card above. Each finished workout lands here with its time, volume and heart rate, and you can fix or delete it later.
          </EmptyState>
        ) : (
          recent.map((s) => (
            <Card key={s.id} className="p-0">
              <button
                type="button"
                onClick={() => setOpen(s.id)}
                aria-label={`${s.name ?? "Workout"}: view, edit or delete`}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="min-w-0 flex-1">
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
                <p className="shrink-0 num text-sm font-semibold">{formatWeight(s.volume, unit)}</p>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            </Card>
          ))
        )}
      </section>

      <SessionSheet sessionId={open} onOpenChange={(o) => !o && setOpen(null)} onChanged={() => setReload((r) => r + 1)} />
    </div>
  );
}
