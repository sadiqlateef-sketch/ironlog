"use client";

// What you have at home: use-soon first, then fridge, freezer, cupboard.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Refrigerator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { FoodToast } from "@/components/food/food-toast";
import type { FoodToastState } from "@/components/food/food-toast";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { PantryItemSheet, type PantryTarget } from "@/components/food/pantry-item-sheet";
import { PHONE_ONLY_TEXT } from "@/components/food/recipe-editor-sheet";
import { useMinuteClock } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { listFoods, listPantry, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import type { Stored } from "@/lib/offline/nutrition-collections";
import { foodDayFor } from "@/lib/nutrition/day";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { amountText } from "@/lib/nutrition/display";
import type { Food } from "@/lib/nutrition/diary-types";
import { expiringSoon, LOCATION_LABEL, PANTRY_LOCATIONS, sortPantry, type PantryItem } from "@/lib/nutrition/pantry";
import { dayKey } from "@/lib/shifts";

/** Days ahead that count as "use soon". */
const SOON_DAYS = 2;

export function PantryScreen() {
  const { prefs } = useNutritionPrefs();
  const now = useMinuteClock();
  const shifts = useWorkShifts();
  const [items, setItems] = useState<Stored<PantryItem>[] | null>(null);
  const [foods, setFoods] = useState<Map<string, Food>>(new Map());
  const [target, setTarget] = useState<PantryTarget | null>(null);
  const [toast, setToast] = useState<FoodToastState | null>(null);
  const toastSeq = useRef(0);
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(() => {
    listPantry()
      .then(setItems)
      .catch(() => setItems((i) => i ?? []));
    listFoods()
      .then((list) => setFoods(new Map(list.map((f) => [f.id, f]))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => window.removeEventListener(NUTRITION_EVENT, load);
  }, [load]);

  const today = dayKey(now);
  const shown = useMemo(() => sortPantry((items ?? []).filter((i) => foods.has(i.foodId))), [items, foods]);
  const soon = useMemo(() => expiringSoon(shown, today, SOON_DAYS), [shown, today]);

  const row = (i: Stored<PantryItem>) => {
    const food = foods.get(i.foodId)!;
    const past = i.useBy !== null && i.useBy < today;
    return (
      <li key={i.id}>
        <button
          type="button"
          className="hover:bg-accent flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
          onClick={() => setTarget({ item: i, food, isNew: false, isNewFood: false })}
        >
          <span className="min-w-0">
            <span className="block truncate text-base font-medium">{food.name}</span>
            <span className="text-muted-foreground block text-xs">
              {amountText(i.quantity, i.unit)}
              {i.openedOn ? " · opened" : ""}
              {i.useBy ? (past ? ` · use-by date passed (${i.useBy})` : ` · use by ${i.useBy}`) : ""}
              {i.localOnly ? ` · ${PHONE_ONLY_TEXT}` : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href="/food/">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Pantry</h1>
        <Button asChild>
          <Link href="/food/add/?pantry=1">
            <Plus /> Add
          </Link>
        </Button>
      </header>

      <NutritionSyncChip />

      {items === null ? (
        <SkeletonList rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Refrigerator}
          title="Pantry is empty"
          action={
            <Button asChild>
              <Link href="/food/add/?pantry=1">
                <Plus /> Add a food
              </Link>
            </Button>
          }
        >
          Scan or search what you have at home. Logging it later takes it off.
        </EmptyState>
      ) : (
        <>
          {soon.length > 0 && (
            <section className="flex flex-col gap-1">
              <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">Use soon</h2>
              <ul className="glass rounded-2xl p-1">{soon.map(row)}</ul>
            </section>
          )}
          {PANTRY_LOCATIONS.map((l) => {
            const here = shown.filter((i) => i.location === l);
            if (!here.length) return null;
            return (
              <section key={l} className="flex flex-col gap-1">
                <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">{LOCATION_LABEL[l]}</h2>
                <ul className="glass rounded-2xl p-1">{here.map(row)}</ul>
              </section>
            );
          })}
        </>
      )}

      <PantryItemSheet
        target={target}
        onOpenChange={(o) => !o && setTarget(null)}
        onDone={(text) => setToast({ id: ++toastSeq.current, text })}
        day={foodDayFor(now, prefs, shifts)}
        meals={prefs.meals}
        now={now}
      />
      <FoodToast toast={toast} onDone={clearToast} />
    </div>
  );
}
