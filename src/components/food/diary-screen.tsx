"use client";

// The food diary for one food day: totals, then one section per meal.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Apple, ChevronLeft, ChevronRight, EllipsisVertical, ListChecks, Plus, Settings } from "lucide-react";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { EntrySheet } from "@/components/food/entry-sheet";
import { MealSection } from "@/components/food/meal-section";
import { useBarcodeEnrichment } from "@/hooks/use-barcode-enrichment";
import { MealSlotsSheet } from "@/components/food/meal-slots-sheet";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { QuickAddSheet } from "@/components/food/quick-add-sheet";
import { TotalsCard } from "@/components/food/totals-card";
import { useMinuteClock, useNutritionDay } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { dayLabel, foodDay, isAllDay, orderMeals, shiftDay } from "@/lib/nutrition/day";
import { dayTotals } from "@/lib/nutrition/entry-math";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";
import { dayKey } from "@/lib/shifts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayFromUrl(): string | null {
  const d = new URLSearchParams(window.location.search).get("d");
  return d && DAY.test(d) ? d : null;
}

export function DiaryScreen() {
  const router = useRouter();
  useBarcodeEnrichment();
  const { prefs, loading: prefsLoading, save } = useNutritionPrefs();
  const now = useMinuteClock();
  // Rendered only after sign-in is known (AppShell), so reading the URL here is safe.
  const [picked, setPicked] = useState<string | null>(() => dayFromUrl());
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const [meals, setMeals] = useState(false);
  const [open, setOpen] = useState<DiaryEntry | null>(null);

  const current = foodDay(now, prefs.day_start);
  const day = prefsLoading ? null : (picked ?? current);
  const { entries, loading } = useNutritionDay(day);
  const isCurrent = day === current;

  const go = (next: string) => {
    const clamped = next > current ? current : next;
    setPicked(clamped === current ? null : clamped);
    window.history.replaceState(null, "", clamped === current ? "/food/" : `/food/?d=${clamped}`);
  };

  const sections = useMemo(() => {
    const ordered = orderMeals(prefs.meals, isCurrent ? now : null);
    const known = new Set(prefs.meals.map((m) => m.id));
    const live = ordered.map((m) => ({
      key: m.id,
      title: m.name,
      window: isAllDay(m) ? null : `${m.start}-${m.end}`,
      addMeal: m.id as string | null,
      entries: entries.filter((e) => e.mealId === m.id),
    }));
    // Entries whose meal was since removed keep their own meal name, after the live meals.
    const orphans = new Map<string, { title: string; entries: DiaryEntry[] }>();
    for (const e of entries) {
      if (known.has(e.mealId)) continue;
      const o = orphans.get(e.mealId) ?? { title: e.mealName, entries: [] };
      o.entries.push(e);
      orphans.set(e.mealId, o);
    }
    return [
      ...live,
      ...[...orphans].map(([key, o]) => ({ key, title: o.title, window: null, addMeal: null as string | null, entries: o.entries })),
    ];
  }, [prefs.meals, entries, isCurrent, now]);

  const calendarToday = dayKey(now);
  const holdsOver = isCurrent && current !== calendarToday;
  const label = day ? dayLabel(day, current) : "";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Food</h1>
        <Button type="button" variant="ghost" size="icon" aria-label="More food options" onClick={() => setMenu(true)}>
          <EllipsisVertical />
        </Button>
      </header>

      <NutritionSyncChip />

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Previous day" disabled={!day} onClick={() => day && go(shiftDay(day, -1))}>
          <ChevronLeft />
        </Button>
        <div className="flex flex-col items-center">
          <p className="text-base font-semibold" data-testid="food-day-label">
            {label}
          </p>
          {holdsOver && (
            <p className="text-muted-foreground text-xs">
              Still counting as {dayLabel(current, calendarToday)} until {prefs.day_start}
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="icon" aria-label="Next day" disabled={!day || isCurrent} onClick={() => day && go(shiftDay(day, 1))}>
          <ChevronRight />
        </Button>
      </div>

      {day === null || loading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <TotalsCard totals={dayTotals(entries)} />
          {entries.length === 0 && (
            <EmptyState
              icon={Apple}
              title="Nothing logged yet"
              action={
                <Button asChild>
                  <Link href={`/food/add/?d=${day}`}>
                    <Plus /> Add food
                  </Link>
                </Button>
              }
            >
              Add what you ate, or quick-add just the calories.
            </EmptyState>
          )}
          <div className="flex flex-col gap-3">
            {sections.map((s) => (
              <MealSection
                key={s.key}
                title={s.title}
                window={s.window}
                entries={s.entries}
                addHref={s.addMeal ? `/food/add/?d=${day}&meal=${encodeURIComponent(s.addMeal)}` : null}
                onOpen={setOpen}
              />
            ))}
          </div>
        </>
      )}

      <ActionSheet
        open={menu}
        onOpenChange={setMenu}
        title="Food"
        actions={[
          { label: "Quick add", icon: Plus, onSelect: () => setQuick(true) },
          { label: "Edit meals", icon: ListChecks, onSelect: () => setMeals(true) },
          { label: "Settings", icon: Settings, onSelect: () => router.push("/settings/#nutrition") },
        ]}
      />
      {day && <QuickAddSheet open={quick} onOpenChange={setQuick} day={day} dayLabel={label} meals={prefs.meals} now={now} />}
      <MealSlotsSheet open={meals} onOpenChange={setMeals} meals={prefs.meals} onSave={async (next) => void (await save({ ...prefs, meals: next }))} />
      <EntrySheet entry={open} onOpenChange={(o) => !o && setOpen(null)} meals={prefs.meals} />
    </div>
  );
}
