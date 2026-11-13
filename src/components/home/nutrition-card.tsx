"use client";

import Link from "next/link";
import { Apple, ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMinuteClock, useNutritionDay } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useDayGoal } from "@/hooks/use-day-goal";
import { useNutritionLogs } from "@/hooks/use-nutrition-logs";
import { waterMl } from "@/lib/nutrition/hydration";
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
  const dg = useDayGoal(day, prefs.day_start);
  const target = dg.allowance?.allowance ?? dg.goal?.energy;
  const logs = useNutritionLogs();
  const water = day ? waterMl(logs, entries, day, dg.goals.hydration.countDrinks) : 0;
  const waterGoal = dg.goals.micros.water ?? null;
  const left = ready && target !== undefined ? Math.round(target - t.energy.value) : null;

  return (
    <Card className="gap-3 p-4" data-testid="home-nutrition">
      <Link href="/food/" className="flex items-center gap-3">
        <div className="bg-primary/15 text-primary-text grid size-10 shrink-0 place-items-center rounded-full">
          <Apple className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            Food today
            {dg.goal && <span className="normal-case tracking-normal font-medium">· {dg.training ? "Training day" : "Rest day"}</span>}
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
          {left !== null && (
            <p className="text-sm font-medium tabular-nums" data-testid="home-nutrition-left">
              {left >= 0 ? `${left} kcal left` : `${-left} kcal over`}
            </p>
          )}
          {ready && entries.length > 0 && (
            <p className="text-muted-foreground text-xs tabular-nums">
              P {showNutrient("protein", t.protein)} g · C {showNutrient("carbohydrates", t.carbohydrates)} g · F {showNutrient("fat", t.fat)} g
            </p>
          )}
        </div>
        {ready && (waterGoal || water > 0) && <WaterRing ml={water} goal={waterGoal} />}
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

/** Water so far as a small ring (full at the user's goal; just the number without one). */
function WaterRing({ ml, goal }: { ml: number; goal: number | null }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const frac = goal ? Math.min(1, ml / goal) : 0;
  const label = ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}`;
  return (
    <div className="relative grid size-11 shrink-0 place-items-center" role="img" aria-label={`Water ${ml} ml${goal ? ` of ${goal} ml` : ""}`} data-testid="home-water">
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-secondary" />
        {goal ? <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} /> : null}
      </svg>
      <span className="text-[10px] font-semibold tabular-nums">{label}</span>
    </div>
  );
}
