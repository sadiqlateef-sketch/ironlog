"use client";

// Your recipes: make one, change one, or log a serving.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChefHat, ChevronLeft, CookingPot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { AmountSheet } from "@/components/food/amount-sheet";
import { BatchSheet, type BatchMode } from "@/components/food/batch-sheet";
import type { AmountTarget } from "@/components/food/amount-sheet";
import { FoodToast } from "@/components/food/food-toast";
import type { FoodToastState } from "@/components/food/food-toast";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { newRecipe, PHONE_ONLY_TEXT, RecipeEditorSheet } from "@/components/food/recipe-editor-sheet";
import { useMinuteClock } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { listBatches, listRecipes, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { portionsLeftText, type Batch } from "@/lib/nutrition/batch";
import type { Stored } from "@/lib/offline/nutrition-collections";
import { dayLabel, foodDayFor } from "@/lib/nutrition/day";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { showNutrient } from "@/lib/nutrition/display";
import { recipeFood, rollup, type Recipe } from "@/lib/nutrition/recipe";

function perServing(r: Recipe): string {
  try {
    const roll = rollup(r.items, r);
    const kcal = showNutrient("energy", { ...roll.per100.energy, value: (roll.per100.energy.value * roll.servingWeight) / 100 });
    return `${kcal} kcal a serving · ${r.servings} ${r.servings === 1 ? "serving" : "servings"}`;
  } catch {
    return "No ingredients yet";
  }
}

export function RecipesScreen() {
  const { prefs, loading: prefsLoading } = useNutritionPrefs();
  const now = useMinuteClock();
  const shifts = useWorkShifts();
  const [recipes, setRecipes] = useState<Stored<Recipe>[] | null>(null);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [target, setTarget] = useState<AmountTarget | null>(null);
  const [batches, setBatches] = useState<Stored<Batch>[]>([]);
  const [batchMode, setBatchMode] = useState<BatchMode | null>(null);
  const [toast, setToast] = useState<FoodToastState | null>(null);
  const toastSeq = useRef(0);
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(() => {
    listRecipes()
      .then(setRecipes)
      .catch(() => setRecipes((r) => r ?? []));
    listBatches()
      .then((list) => setBatches(list.filter((b) => !b.finished)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => window.removeEventListener(NUTRITION_EVENT, load);
  }, [load]);

  const day = foodDayFor(now, prefs, shifts);
  const log = (r: Recipe) => {
    try {
      setTarget({ food: recipeFood(r, rollup(r.items, r), r.foodId ?? r.id), isNew: false });
    } catch {
      setEditing(r);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href="/food/">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Recipes</h1>
        <Button type="button" onClick={() => setEditing(newRecipe())}>
          <Plus /> New
        </Button>
      </header>

      <NutritionSyncChip />

      {batches.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">Batches</h2>
          <ul className="glass rounded-2xl p-1">
            {batches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="hover:bg-accent flex w-full flex-col rounded-xl px-3 py-2.5 text-left"
                  onClick={() => setBatchMode({ kind: "log", batch: b })}
                >
                  <span className="truncate text-base font-medium">{b.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {portionsLeftText(b)}
                    {b.useBy ? ` · use by ${b.useBy}` : ""}
                    {b.localOnly ? ` · ${PHONE_ONLY_TEXT}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipes === null ? (
        <SkeletonList rows={3} />
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="No recipes yet"
          action={
            <Button type="button" onClick={() => setEditing(newRecipe())}>
              <Plus /> New recipe
            </Button>
          }
        >
          Add the ingredients once, then log a serving in one tap.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {recipes.map((r) => (
            <li key={r.id} className="bg-card border-border/50 flex items-center justify-between gap-3 rounded-2xl border p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                <span className="block truncate text-base font-semibold">{r.name}</span>
                <span className="text-muted-foreground block text-xs">{perServing(r)}</span>
                {r.localOnly && <span className="text-muted-foreground block text-xs">{PHONE_ONLY_TEXT}</span>}
              </button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Make a batch of ${r.name}`} disabled={!r.items.length} onClick={() => setBatchMode({ kind: "make", recipe: r })}>
                <CookingPot />
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={prefsLoading} onClick={() => log(r)}>
                Log
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RecipeEditorSheet
        recipe={editing}
        recipes={recipes ?? []}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={(text) => setToast({ id: ++toastSeq.current, text })}
      />
      <AmountSheet
        target={target}
        onOpenChange={(o) => !o && setTarget(null)}
        day={day}
        dayLabel={dayLabel(day, day)}
        meals={prefs.meals}
        mealId={null}
        now={now}
        onSaved={() => {
          setTarget(null);
          setToast({ id: ++toastSeq.current, text: "Logged" });
        }}
      />
      <BatchSheet
        mode={batchMode}
        onOpenChange={(o) => !o && setBatchMode(null)}
        onDone={(text) => setToast({ id: ++toastSeq.current, text })}
        day={day}
        meals={prefs.meals}
        mealId={null}
        now={now}
      />
      <FoodToast toast={toast} onDone={clearToast} />
    </div>
  );
}
