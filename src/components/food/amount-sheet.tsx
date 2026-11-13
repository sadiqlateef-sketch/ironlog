"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MealChips } from "@/components/food/meal-chips";
import { addEntry, saveFood } from "@/lib/offline/nutrition-store";
import { defaultMealFor } from "@/lib/nutrition/day";
import { allowedUnits, DISPLAY_NUTRIENTS, makeEntry } from "@/lib/nutrition/entry-math";
import { amountText, NUTRIENT_DISPLAY, parseAmount, showNutrient, unitChoiceLabel } from "@/lib/nutrition/display";
import type { DiaryEntry, EntryUnit, Food, MealSlot } from "@/lib/nutrition/diary-types";
import { cn } from "@/lib/utils";

export interface AmountTarget {
  food: Food;
  /** True when the food isn't saved yet (a search result); it is saved together with the entry. */
  isNew: boolean;
  /** Last amount used, when the food came from Recent. */
  last?: { quantity: number; unit: EntryUnit } | null;
}

interface Props {
  target: AmountTarget | null;
  onOpenChange: (open: boolean) => void;
  day: string;
  dayLabel: string;
  meals: readonly MealSlot[];
  mealId: string | null;
  now: Date;
  onSaved: () => void;
}

export function AmountSheet(props: Props) {
  const { target, onOpenChange } = props;
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>{target && <Form key={target.food.id} {...props} target={target} />}</DialogContent>
    </Dialog>
  );
}

const MAX_QUANTITY = 100000;
const stepFor = (unit: EntryUnit) => (unit === "serving" || unit === "package" ? 0.5 : unit === "oz" || unit === "fl_oz" ? 1 : 10);
const startFor = (unit: EntryUnit) => (unit === "serving" || unit === "package" || unit === "oz" || unit === "fl_oz" ? 1 : 100);

function Form({ target, day, dayLabel, meals, mealId, now, onSaved }: Props & { target: AmountTarget }) {
  const { food } = target;
  const units = allowedUnits(food);
  const lastOk = target.last && units.includes(target.last.unit) ? target.last : null;
  const startUnit: EntryUnit = lastOk ? lastOk.unit : units.includes("serving") ? "serving" : units[0];

  const [unit, setUnit] = useState<EntryUnit>(startUnit);
  const [text, setText] = useState(String(lastOk ? lastOk.quantity : startFor(startUnit)));
  const picked = meals.find((m) => m.id === mealId) ?? defaultMealFor(meals, now) ?? meals[0] ?? null;
  const [meal, setMeal] = useState<Pick<MealSlot, "id" | "name"> | null>(picked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = parseAmount(text);
  let preview: DiaryEntry | null = null;
  if (quantity !== null && quantity <= MAX_QUANTITY && meal) {
    try {
      preview = makeEntry({ food, quantity, unit, foodDay: day, meal, now, id: "preview" });
    } catch {
      preview = null;
    }
  }

  const pickUnit = (u: EntryUnit) => {
    setUnit(u);
    setText(String(startFor(u)));
  };

  const step = (dir: 1 | -1) => {
    const s = stepFor(unit);
    setText(String(Math.max(s / 2, Math.round(((quantity ?? 0) + dir * s) * 100) / 100)));
  };

  const save = async () => {
    if (!preview || quantity === null || !meal) return;
    setBusy(true);
    setError(null);
    try {
      const saved = target.isNew ? await saveFood(food) : food;
      await addEntry(makeEntry({ food: saved, quantity, unit, foodDay: day, meal, now: new Date(), id: crypto.randomUUID() }));
      onSaved();
    } catch {
      setError("Couldn't save this. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{food.name}</DialogTitle>
        <DialogDescription>
          {food.brand ? `${food.brand} · ` : ""}
          {dayLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" size="icon" variant="outline" aria-label="Less" onClick={() => step(-1)}>
            <Minus />
          </Button>
          <Input
            aria-label="Amount"
            inputMode="decimal"
            value={text}
            aria-invalid={preview === null || undefined}
            onChange={(e) => setText(e.target.value)}
            className="text-center"
          />
          <Button type="button" size="icon" variant="outline" aria-label="More" onClick={() => step(1)}>
            <Plus />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unit">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => pickUnit(u)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm font-semibold",
                unit === u ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
              )}
            >
              {unitChoiceLabel(u, food)}
            </button>
          ))}
        </div>
        {preview && preview.grams !== null && unit !== "g" && unit !== "ml" && (
          <p className="text-muted-foreground text-xs">
            {amountText(preview.quantity, unit)} = {Number(preview.grams.toFixed(1))} {food.liquid ? "ml" : "g"}
          </p>
        )}
      </div>

      <dl className="bg-secondary/40 border-border/50 grid grid-cols-4 gap-x-2 gap-y-3 rounded-xl border p-3" data-testid="amount-preview">
        {DISPLAY_NUTRIENTS.map((key) => {
          const d = NUTRIENT_DISPLAY[key]!;
          const shown = preview ? showNutrient(key, preview.nutrients[key]) : "–";
          return (
            <div key={key} className="flex flex-col">
              <dt className="text-muted-foreground text-xs">{d.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {shown}
                {shown !== "–" && <span className="text-muted-foreground text-xs font-normal"> {d.unit}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-muted-foreground -mt-2 text-xs">
        &quot;–&quot; means this food doesn&apos;t list it. &quot;≥&quot; means the real amount may be higher.
      </p>

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
      <Button type="button" onClick={save} disabled={!preview || busy}>
        Add to {meal?.name ?? "diary"}
      </Button>
    </>
  );
}
