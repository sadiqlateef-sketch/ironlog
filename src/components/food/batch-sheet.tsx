"use client";

// Batch cooking: make a batch from a recipe, or log portions of one.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MealChips } from "@/components/food/meal-chips";
import { PHONE_ONLY_TEXT } from "@/components/food/recipe-editor-sheet";
import { listFoods, logBatchPortion, removeBatch, saveBatch } from "@/lib/offline/nutrition-store";
import { defaultMealFor } from "@/lib/nutrition/day";
import { parseAmount, showNutrient } from "@/lib/nutrition/display";
import type { Food, MealSlot } from "@/lib/nutrition/diary-types";
import { defaultUseBy, LEFTOVER_DAYS, makeBatch, portionEntry, portionsLeftText, type Batch } from "@/lib/nutrition/batch";
import { rollup, type Recipe } from "@/lib/nutrition/recipe";
import { dayKey } from "@/lib/shifts";

export type BatchMode = { kind: "make"; recipe: Recipe } | { kind: "log"; batch: Batch };

interface Props {
  mode: BatchMode | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
  /** Food day and meals for logging. */
  day: string;
  meals: readonly MealSlot[];
  mealId: string | null;
  now: Date;
}

export function BatchSheet(props: Props) {
  const { mode } = props;
  const key = mode ? (mode.kind === "make" ? `make-${mode.recipe.id}` : `log-${mode.batch.id}`) : "none";
  return (
    <Dialog open={mode !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {mode?.kind === "make" && <Make key={key} {...props} recipe={mode.recipe} />}
        {mode?.kind === "log" && <Log key={key} {...props} batch={mode.batch} />}
      </DialogContent>
    </Dialog>
  );
}

function Make({ recipe, onOpenChange, onDone, now }: Props & { recipe: Recipe }) {
  const today = dayKey(now);
  const [portionsText, setPortionsText] = useState(String(recipe.servings));
  const [madeOn, setMadeOn] = useState(today);
  const [useBy, setUseBy] = useState(defaultUseBy(today));
  const [touchedUseBy, setTouchedUseBy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portions = parseAmount(portionsText);

  const save = async () => {
    if (!portions) return;
    setBusy(true);
    setError(null);
    try {
      const b = makeBatch(recipe, rollup(recipe.items, recipe), portions, madeOn, useBy || null, crypto.randomUUID());
      const saved = await saveBatch(b);
      onDone(saved.localOnly ? PHONE_ONLY_TEXT : `Batch of ${recipe.name} saved`);
      onOpenChange(false);
    } catch {
      setError("Couldn't save this batch. Save the recipe first, then try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">Make a batch</DialogTitle>
        <DialogDescription>{recipe.name}: split it into portions you log one at a time.</DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Portions
        <Input inputMode="decimal" value={portionsText} aria-invalid={portions === null || undefined} onChange={(e) => setPortionsText(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Cooked on
          <Input
            type="date"
            value={madeOn}
            onChange={(e) => {
              setMadeOn(e.target.value);
              if (!touchedUseBy && e.target.value) setUseBy(defaultUseBy(e.target.value));
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Use by
          <Input
            type="date"
            value={useBy}
            onChange={(e) => {
              setTouchedUseBy(true);
              setUseBy(e.target.value);
            }}
          />
        </label>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Use by starts at {LEFTOVER_DAYS} days after cooking, a default based on USDA leftovers guidance. Change it to suit you.
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={save} disabled={!portions || busy}>
        Save batch
      </Button>
    </>
  );
}

function Log({ batch, onOpenChange, onDone, day, meals, mealId, now }: Props & { batch: Batch }) {
  const [food, setFood] = useState<Food | null | undefined>(undefined);
  const [countText, setCountText] = useState("1");
  const picked = meals.find((m) => m.id === mealId) ?? defaultMealFor(meals, now) ?? meals[0] ?? null;
  const [meal, setMeal] = useState<Pick<MealSlot, "id" | "name"> | null>(picked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);

  useEffect(() => {
    listFoods()
      .then((list) => setFood(list.find((f) => f.id === batch.foodId) ?? null))
      .catch(() => setFood(null));
  }, [batch.foodId]);

  const count = parseAmount(countText);
  let kcal: string | null = null;
  if (food && count) {
    const e = portionEntry(batch, food, count, { foodDay: day, meal: meal ?? { id: "x", name: "x" }, now, id: "preview" });
    kcal = showNutrient("energy", e.nutrients.energy);
  }

  const log = async () => {
    if (!food || !count || !meal) return;
    setBusy(true);
    setError(null);
    try {
      const entry = portionEntry(batch, food, count, { foodDay: day, meal, now: new Date(), id: crypto.randomUUID() });
      const next = await logBatchPortion(batch.id, entry, count);
      onDone(`Logged ${count} ${count === 1 ? "portion" : "portions"} of ${batch.name}${next?.finished ? ". Batch finished." : ""}`);
      onOpenChange(false);
    } catch {
      setError("Couldn't log this. Try again.");
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await removeBatch(batch.id);
      onDone(`${batch.name} batch removed`);
      onOpenChange(false);
    } catch {
      setError("Couldn't remove this. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{batch.name}</DialogTitle>
        <DialogDescription>
          {portionsLeftText(batch)}
          {batch.useBy ? ` · use by ${batch.useBy}` : ""}
        </DialogDescription>
      </DialogHeader>
      {food === null && <p className="text-muted-foreground text-sm">This batch&apos;s recipe was deleted, so it can&apos;t be logged.</p>}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Portions eaten
        <Input inputMode="decimal" value={countText} aria-invalid={count === null || undefined} onChange={(e) => setCountText(e.target.value)} />
      </label>
      {kcal && (
        <p className="text-muted-foreground -mt-2 text-xs">
          {Number(((count ?? 0) * batch.portionAmount).toFixed(1))} {food?.liquid ? "ml" : "g"} · {kcal} kcal
        </p>
      )}
      {meals.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Meal</p>
          <MealChips meals={meals} value={meal?.id ?? ""} onChange={setMeal} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={log} disabled={!food || !count || !meal || busy}>
        Log to {meal?.name ?? "diary"}
      </Button>
      {confirmDone ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDone(false)} disabled={busy}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" className="flex-1" onClick={finish} disabled={busy}>
            Remove batch
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDone(true)} disabled={busy}>
          Remove batch (eaten or thrown out)
        </Button>
      )}
    </>
  );
}
