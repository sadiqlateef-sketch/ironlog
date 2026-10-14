"use client";

import Link from "next/link";
import { CalendarRange, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveProgram } from "@/components/up-next";

/**
 * Periodization at a glance: your active program's week, or a nudge to let the
 * AI build one that ramps intensity over the weeks.
 */
export function PeriodizationCard() {
  const progress = useActiveProgram();
  if (progress === undefined) return null;

  if (progress) {
    const week = progress.next_week ?? progress.weeks;
    return (
      <Card className="gap-3 p-4">
        <div className="flex items-center gap-3">
          <CalendarRange className="text-primary-text size-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-primary-text text-xs font-bold tracking-wide uppercase">Periodization on</p>
            <p className="truncate font-bold">{progress.program_name}</p>
            <p className="text-muted-foreground text-sm">
              Week {week} of {progress.weeks} · {progress.done} of {progress.total} workouts done
            </p>
          </div>
        </div>
        <div className="bg-secondary h-2 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-primary h-full rounded-full" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="text-ai size-6 shrink-0" />
        <div>
          <p className="font-bold">Enable periodization</p>
          <p className="text-muted-foreground text-sm">
            Let the AI plan your weeks: heavier and lighter weeks in a cycle, so you keep getting stronger without burning out.
          </p>
        </div>
      </div>
      <Button asChild>
        <Link href="/plans/#generator">Set up a program</Link>
      </Button>
    </Card>
  );
}
