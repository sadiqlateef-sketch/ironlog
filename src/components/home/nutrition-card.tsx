"use client";

import Link from "next/link";
import { Apple, ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMinuteClock, useNutritionDay } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useNutritionSync } from "@/hooks/use-nutrition-sync";
import { foodDay } from "@/lib/nutrition/day";
import { dayTotals } from "@/lib/nutrition/entry-math";
import { showNutrient } from "@/lib/nutrition/display";

/** Today's food at a glance, from the phone's copy, so it works offline. */
export function NutritionCard() {
  const { prefs, loading: prefsLoading } = useNutritionPrefs();
  const now = useMinuteClock();
  const day = prefsLoading ? null : foodDay(now, prefs.day_start);
  const { entries, loading } = useNutritionDay(day);
  const sync = useNutritionSync();
  const t = dayTotals(entries);
  const ready = !loading && day !== null;

  return (
    <Card className="gap-3 p-4" data-testid="home-nutrition">
      <Link href="/food/" className="flex items-center gap-3">
        <div className="bg-primary/15 text-primary-text grid size-10 shrink-0 place-items-center rounded-full">
          <Apple className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            Food today
            {sync.pending > 0 && <span className="bg-primary h-1 w-1 rounded-full" role="img" aria-label="Changes waiting to sync" />}
          </p>
          {ready ? (
            <p className="text-2xl font-bold tabular-nums" data-testid="home-nutrition-kcal">
              {entries.length === 0 ? "0" : showNutrient("energy", t.energy)}{" "}
              <span className="text-muted-foreground text-sm font-medium">kcal</span>
            </p>
          ) : (
            <p className="text-2xl font-bold">&nbsp;</p>
          )}
          {ready && entries.length > 0 && (
            <p className="text-muted-foreground text-xs tabular-nums">
              P {showNutrient("protein", t.protein)} g · C {showNutrient("carbohydrates", t.carbohydrates)} g · F {showNutrient("fat", t.fat)} g
            </p>
          )}
        </div>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
      </Link>
      <Button asChild variant="secondary">
        <Link href={day ? `/food/add/?d=${day}` : "/food/add/"}>
          <Plus /> Log food
        </Link>
      </Button>
    </Card>
  );
}
