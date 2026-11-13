"use client";

// The food diary for one food day: totals, then one section per meal.

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Apple, Bookmark, BookmarkPlus, ChefHat, Dumbbell, Refrigerator, ChevronLeft, ChevronRight, Copy, EllipsisVertical, ListChecks, Moon, Plus, RotateCcw, Settings, Target } from "lucide-react";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { EntrySheet } from "@/components/food/entry-sheet";
import { FoodToast } from "@/components/food/food-toast";
import type { FoodToastState } from "@/components/food/food-toast";
import { MealSection } from "@/components/food/meal-section";
import { useBarcodeEnrichment } from "@/hooks/use-barcode-enrichment";
import { MealSlotsSheet } from "@/components/food/meal-slots-sheet";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { QuickAddSheet } from "@/components/food/quick-add-sheet";
import { UsualsSheet, type UsualsMode } from "@/components/food/usuals-sheet";
import { TotalsCard } from "@/components/food/totals-card";
import { useMinuteClock, useNutritionDay } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useDayGoal } from "@/hooks/use-day-goal";
import { proteinSplit } from "@/lib/nutrition/goals";
import { dayLabel, foodDay, isAllDay, orderMeals, shiftDay } from "@/lib/nutrition/day";
import { dayTotals, isPlanned, plannedTotals } from "@/lib/nutrition/entry-math";
import { showNutrient } from "@/lib/nutrition/display";
import { copiedText, copyMealEntries, copyMealLabel } from "@/lib/nutrition/quick-log";
import { addEntries, confirmPlanned, deleteEntry, listDay } from "@/lib/offline/nutrition-store";
import type { DiaryEntry, MealSlot } from "@/lib/nutrition/diary-types";
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
  const [mealMenu, setMealMenu] = useState<Pick<MealSlot, "id" | "name"> | null>(null);
  const [toast, setToast] = useState<FoodToastState | null>(null);
  const [usualsMode, setUsualsMode] = useState<UsualsMode | null>(null);
  const toastSeq = useRef(0);
  const clearToast = useCallback(() => setToast(null), []);

  const current = foodDay(now, prefs.day_start);
  const day = prefsLoading ? null : (picked ?? current);
  const { entries, loading } = useNutritionDay(day);
  const isCurrent = day === current;
  const dayGoal = useDayGoal(day, prefs.day_start);
  const [dayTypeMenu, setDayTypeMenu] = useState(false);
  const split = useMemo(() => {
    const byMeal: Record<string, DiaryEntry[]> = {};
    for (const e of entries) (byMeal[e.mealId] ??= []).push(e);
    return proteinSplit(byMeal, dayGoal.goals.proteinPerMeal);
  }, [entries, dayGoal.goals.proteinPerMeal]);

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

  // Copy yesterday's entries for one meal into this day, with Undo.
  const copyYesterday = async (meal: Pick<MealSlot, "id" | "name">) => {
    if (!day) return;
    const show = (text: string, onUndo?: () => void) => setToast({ id: ++toastSeq.current, text, onUndo });
    try {
      const yesterday = await listDay(shiftDay(day, -1));
      const copies = copyMealEntries(yesterday, meal.id, day, meal, new Date(), () => crypto.randomUUID());
      if (copies.length) await addEntries(day, copies);
      show(
        copiedText(copies.length, meal.name),
        copies.length
          ? () => {
              void (async () => {
                for (const c of copies) await deleteEntry(c.id, day).catch(() => {});
              })();
            }
          : undefined,
      );
    } catch {
      show("Couldn't copy that. Try again.");
    }
  };

  const showToast = (text: string, onUndo?: () => void) => setToast({ id: ++toastSeq.current, text, onUndo });
  const confirmEntry = async (e: DiaryEntry) => {
    try {
      const done = await confirmPlanned(e, prefs.day_start);
      showToast(done && done.foodDay !== e.foodDay ? `Counted on ${dayLabel(done.foodDay, current)}` : `${e.name} counted`);
    } catch {
      showToast("Couldn't update that. Try again.");
    }
  };
  const removePlanned = async (e: DiaryEntry) => {
    try {
      await deleteEntry(e.id, e.foodDay);
    } catch {
      showToast("Couldn't remove that. Try again.");
    }
  };
  const plannedKcal = entries.some(isPlanned) ? plannedTotals(entries).energy : null;
  const mealEntries = (id: string) => entries.filter((e) => e.mealId === id && !isPlanned(e));

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
          {dayGoal.goals.base && (
            <div className="-mb-2 flex items-center gap-2">
              <button
                type="button"
                className="bg-secondary text-foreground flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                onClick={() => setDayTypeMenu(true)}
                data-testid="food-day-type"
              >
                {dayGoal.training ? <Dumbbell className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
                {dayGoal.training ? "Training day" : "Rest day"}
                {dayGoal.override ? " · set by you" : dayGoal.reason === "logged" ? " · workout logged" : ""}
              </button>
              {dayGoal.goal?.phase && dayGoal.goal.phase !== "maintain" && (
                <span className="text-muted-foreground text-xs">{dayGoal.goal.phase === "bulk" ? "Bulk" : "Cut"} phase</span>
              )}
              {dayGoal.phase.deload && dayGoal.goal?.phase === "maintain" && <span className="text-muted-foreground text-xs">Deload week: maintain</span>}
            </div>
          )}
          <TotalsCard totals={dayTotals(entries)} goal={dayGoal.loading ? undefined : dayGoal.goal} allowance={dayGoal.allowance} split={split} />
          {plannedKcal && (
            <p className="text-muted-foreground -mt-2 px-1 text-xs" data-testid="food-planned">
              Planned, not counted yet: {showNutrient("energy", plannedKcal)} kcal
            </p>
          )}
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
                onMenu={s.addMeal ? () => setMealMenu({ id: s.key, name: s.title }) : undefined}
                onConfirm={(e) => void confirmEntry(e)}
                onRemove={(e) => void removePlanned(e)}
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
          { label: "Goals", icon: Target, onSelect: () => router.push("/food/goals/") },
          { label: "Recipes", icon: ChefHat, onSelect: () => router.push("/food/recipes/") },
          { label: "Pantry", icon: Refrigerator, onSelect: () => router.push("/food/pantry/") },
          { label: "Edit meals", icon: ListChecks, onSelect: () => setMeals(true) },
          { label: "Settings", icon: Settings, onSelect: () => router.push("/settings/#nutrition") },
        ]}
      />
      <ActionSheet
        open={mealMenu !== null}
        onOpenChange={(o) => !o && setMealMenu(null)}
        title={mealMenu?.name ?? ""}
        actions={
          mealMenu
            ? [
                ...(day ? [{ label: "Log a usual", icon: Bookmark, onSelect: () => setUsualsMode({ kind: "log", meal: mealMenu, day }) }] : []),
                ...(mealEntries(mealMenu.id).length
                  ? [{ label: "Save meal as usual", icon: BookmarkPlus, onSelect: () => setUsualsMode({ kind: "save", meal: mealMenu, entries: mealEntries(mealMenu.id) }) }]
                  : []),
                { label: copyMealLabel(mealMenu.name), icon: Copy, onSelect: () => void copyYesterday(mealMenu) },
              ]
            : []
        }
      />
      <ActionSheet
        open={dayTypeMenu}
        onOpenChange={setDayTypeMenu}
        title="This day counts as"
        actions={[
          { label: "Training day", icon: Dumbbell, onSelect: () => void dayGoal.setOverride("training") },
          { label: "Rest day", icon: Moon, onSelect: () => void dayGoal.setOverride("rest") },
          { label: "Automatic (from logged workouts)", icon: RotateCcw, onSelect: () => void dayGoal.setOverride(null) },
        ]}
      />
      <FoodToast toast={toast} onDone={clearToast} />
      <UsualsSheet mode={usualsMode} onOpenChange={(o) => !o && setUsualsMode(null)} onDone={(text) => showToast(text)} />
      {day && <QuickAddSheet open={quick} onOpenChange={setQuick} day={day} dayLabel={label} meals={prefs.meals} now={now} />}
      <MealSlotsSheet open={meals} onOpenChange={setMeals} meals={prefs.meals} onSave={async (next) => void (await save({ ...prefs, meals: next }))} />
      <EntrySheet entry={open} onOpenChange={(o) => !o && setOpen(null)} meals={prefs.meals} />
    </div>
  );
}
