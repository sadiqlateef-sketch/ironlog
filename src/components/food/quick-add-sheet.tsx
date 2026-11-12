"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MealChips } from "@/components/food/meal-chips";
import { addEntry } from "@/lib/offline/nutrition-store";
import { defaultMealFor } from "@/lib/nutrition/day";
import { makeQuickEntry } from "@/lib/nutrition/entry-math";
import type { MealSlot } from "@/lib/nutrition/diary-types";
import type { NutrientKey } from "@/lib/nutrition/nutrients";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
  dayLabel: string;
  meals: readonly MealSlot[];
  now: Date;
}

// Optional nutrients: label, the unit typed in, and how many of those make one stored gram.
const OPTIONAL: { key: NutrientKey; label: string; unit: string; perGram: number }[] = [
  { key: "protein", label: "Protein", unit: "g", perGram: 1 },
  { key: "carbohydrates", label: "Carbs", unit: "g", perGram: 1 },
  { key: "fat", label: "Fat", unit: "g", perGram: 1 },
  { key: "fiber", label: "Fiber", unit: "g", perGram: 1 },
  { key: "sugars", label: "Sugars", unit: "g", perGram: 1 },
  { key: "sodium", label: "Sodium", unit: "mg", perGram: 1000 },
  { key: "caffeine", label: "Caffeine", unit: "mg", perGram: 1000 },
];

export function QuickAddSheet(props: Props) {
  const { open, onOpenChange } = props;
  // The form starts empty each time the sheet opens.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Form {...props} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function num(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function Form({ day, dayLabel, meals, now, onClose }: Props & { onClose: () => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [vals, setVals] = useState<Partial<Record<NutrientKey, string>>>({});
  const first = defaultMealFor(meals, now) ?? meals[0] ?? null;
  const [meal, setMeal] = useState<Pick<MealSlot, "id" | "name"> | null>(first);
  const [saving, setSaving] = useState(false);

  const energy = num(kcal);
  const optionalBad = OPTIONAL.some((o) => Number.isNaN(num(vals[o.key] ?? "")));
  const valid = name.trim().length > 0 && energy !== null && !Number.isNaN(energy) && !optionalBad && meal !== null;

  const save = async () => {
    if (!valid || meal === null || energy === null) return;
    setSaving(true);
    try {
      const values: Partial<Record<NutrientKey, number>> = { energy };
      for (const o of OPTIONAL) {
        const v = num(vals[o.key] ?? "");
        if (v !== null && !Number.isNaN(v)) values[o.key] = v / o.perGram;
      }
      await addEntry(
        makeQuickEntry({ name: name.trim().slice(0, 200), values, foodDay: day, meal, now: new Date(), id: crypto.randomUUID() }),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Quick add</DialogTitle>
        <DialogDescription>Log calories without picking a food. {dayLabel}.</DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input value={name} maxLength={200} placeholder="What was it?" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Calories (kcal)
        <Input inputMode="decimal" value={kcal} placeholder="0" onChange={(e) => setKcal(e.target.value)} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Optional</legend>
        <div className="grid grid-cols-2 gap-3">
          {OPTIONAL.map((o) => (
            <label key={o.key} className="flex flex-col gap-1.5 text-sm font-medium">
              {o.label} ({o.unit})
              <Input
                inputMode="decimal"
                value={vals[o.key] ?? ""}
                aria-invalid={Number.isNaN(num(vals[o.key] ?? "")) || undefined}
                onChange={(e) => setVals((v) => ({ ...v, [o.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">Anything left blank counts as unknown, so totals show &quot;≥&quot;.</p>
      </fieldset>

      {meals.length > 0 && <MealChips meals={meals} value={meal?.id ?? ""} onChange={setMeal} />}

      <Button type="button" onClick={save} disabled={!valid || saving}>
        Add to {meal?.name ?? "diary"}
      </Button>
    </>
  );
}
