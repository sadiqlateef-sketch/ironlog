"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Heart,
  History,
  Search,
  Sparkles,
} from "lucide-react";
import { AdjustmentList } from "@/components/adjustment-list";
import { AppShell } from "@/components/app-shell";
import { CenterStartButton } from "@/components/home/center-start-button";
import { LastSessionCard } from "@/components/home/last-session-card";
import { NextSessionCard } from "@/components/home/next-session-card";
import { RecoveryChips } from "@/components/home/recovery-chips";
import { WeekStrip } from "@/components/home/week-strip";
import { SessionSheet } from "@/components/session-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import { useActiveProgram } from "@/components/up-next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useActiveWorkout } from "@/hooks/use-active-workout";
import { formatWeight } from "@/lib/units";
import {
  listPendingAdjustments,
  listRecentSessions,
  type AdjustmentWithContext,
  type WorkoutSession,
} from "@/lib/workout-api";

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
  // Bumped after a workout is edited or deleted, so the list refreshes.
  const [reload, setReload] = useState(0);
  const program = useActiveProgram(reload);
  // Fixed at mount so the week strip stays pure during render.
  const [now] = useState(() => new Date());

  useEffect(() => {
    listRecentSessions(14).then(setRecent).catch(() => setRecent([]));
    listPendingAdjustments().then(setAdjustments).catch(() => {});
  }, [reload]);

  const name = profile?.display_name?.split(" ")[0];
  const lastSession = recent && recent.length > 0 ? recent[0] : recent === null ? undefined : null;
  const pastSessions = recent ? recent.slice(1) : [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col items-center text-center">
        <span className="text-foreground text-sm font-extrabold tracking-tight uppercase">IronLog</span>
        <span className="text-muted-foreground text-[11px] font-medium">
          {greeting()}{name ? `, ${name}` : ""}
        </span>
      </header>

      {/* Folded: one column, last session first. Unfolded: start on the left, last session and recovery on the right. */}
      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:items-start">
        <div className="flex flex-col gap-4 md:col-start-2 md:row-start-1">
          <LastSessionCard session={lastSession} unit={unit} onOpen={(id) => setOpen(id)} />
          <div className="hidden md:block">
            <RecoveryChips />
          </div>
        </div>
        <div className="flex flex-col gap-4 md:col-start-1 md:row-start-1">
          <CenterStartButton workout={workout} program={program} />
          <NextSessionCard program={program} unit={unit} />
          <div className="hidden md:block">
            <WeekStrip sessions={recent} unit={unit} now={now} />
          </div>
        </div>
      </div>

      {/* Suggested Adjustments */}
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

      {/* Previous Workouts History */}
      {pastSessions.length > 0 && (
        <section className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">History</h2>
            <Link href="/search/" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
              <Search className="size-3" /> Search
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {pastSessions.slice(0, 3).map((s) => (
              <Card key={s.id} className="p-0 border-border/60 hover:border-primary/50 transition-colors">
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
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
        </section>
      )}

      {/* Session Detail Sheet */}
      <SessionSheet
        sessionId={open}
        onOpenChange={(o) => !o && setOpen(null)}
        onChanged={() => setReload((r) => r + 1)}
      />
    </div>
  );
}
