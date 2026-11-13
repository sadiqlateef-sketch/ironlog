"use client";

// Food after a workout (on the finish summary) and before one (on Home):
// time since you last ate, your top usuals one tap away, and a "Log food" link
// for the meal happening now. Numbers only; no advice.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { defaultMealFor, foodDayFor, shiftDay } from "@/lib/nutrition/day";
import { hoursSinceEaten } from "@/lib/nutrition/fasting";
import { carbsInLast, PRE_LIFT_HOURS } from "@/lib/nutrition/fuel-plan";
import { entriesFromUsual, isOnShift, rankUsuals, type Usual } from "@/lib/nutrition/usuals";
import { loadPlaces } from "@/lib/nutrition-places";
import { listDay, listUsuals, logUsual, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";

const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`);

/** Today's and yesterday's entries for the current food day, kept fresh. */
function useRecentFood(): { day: string | null; entries: DiaryEntry[]; now: Date } {
  const { prefs, loading } = useNutritionPrefs();
  const shifts = useWorkShifts();
  const [now, setNow] = useState(() => new Date());
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const day = loading ? null : foodDayFor(now, prefs, shifts);
  useEffect(() => {
    if (!day) return;
    let live = true;
    const load = () => {
      setNow(new Date());
      void Promise.all([listDay(shiftDay(day, -1)).catch(() => []), listDay(day).catch(() => [])]).then(([a, b]) => {
        if (live) setEntries([...a, ...b]);
      });
    };
    load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, load);
    };
  }, [day]);
  return { day, entries, now };
}

export function PostWorkoutFuel() {
  const { prefs } = useNutritionPrefs();
  const shifts = useWorkShifts();
  const { day, entries, now } = useRecentFood();
  const [usuals, setUsuals] = useState<Usual[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listUsuals()
      .then(setUsuals)
      .catch(() => setUsuals([]));
  }, []);

  const meal = defaultMealFor(prefs.meals, now);
  const top = useMemo(
    () => rankUsuals(usuals, { places: loadPlaces(), now, onShift: isOnShift(now, shifts) }).slice(0, 3),
    [usuals, now, shifts],
  );
  const since = hoursSinceEaten(now, entries.filter((e) => e.status !== "planned"));

  const log = async (u: Usual) => {
    if (!day || !meal) return;
    setBusy(true);
    try {
      await logUsual(u.id, entriesFromUsual(u, day, meal, new Date(), () => crypto.randomUUID()));
      setDone(`Logged ${u.name} to ${meal.name}`);
    } catch {
      setDone("Couldn't log that. Try again from Food.");
    } finally {
      setBusy(false);
    }
  };

  const href = `/food/add/${meal ? `?meal=${encodeURIComponent(meal.id)}` : ""}`;
  return (
    <div className="bg-secondary flex flex-col gap-2 rounded-xl p-3" data-testid="post-workout-fuel">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Clock className="size-4 shrink-0" aria-hidden />
        {since === null ? "No food logged since yesterday" : `Last ate ${hrs(since)} ago`}
      </p>
      {top.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {top.map((u) => (
            <Button key={u.id} type="button" size="sm" variant="outline" disabled={busy || !meal} onClick={() => void log(u)}>
              <Bookmark /> {u.name}
            </Button>
          ))}
        </div>
      )}
      {done && <p className="text-sm">{done}</p>}
      <Button asChild size="sm" variant="secondary" className="self-start">
        <Link href={href}>
          <Plus /> Log food{meal ? ` to ${meal.name}` : ""}
        </Link>
      </Button>
    </div>
  );
}

/** Home, when a workout is planned today: time since you last ate and carbs logged in the last 3 h. */
export function PreLiftFuel() {
  const { entries, now } = useRecentFood();
  const eaten = entries.filter((e) => e.status !== "planned");
  const since = hoursSinceEaten(now, eaten);
  const carbs = carbsInLast(eaten, now);
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs tabular-nums" data-testid="pre-lift-fuel">
      <Clock className="size-3.5 shrink-0" aria-hidden />
      Before you lift: {since === null ? "nothing logged since yesterday" : `last ate ${hrs(since)} ago`}
      {carbs.count > 0 && ` · ${carbs.incomplete ? "≥ " : ""}${carbs.grams} g carbs in the last ${PRE_LIFT_HOURS} h`}
    </p>
  );
}
