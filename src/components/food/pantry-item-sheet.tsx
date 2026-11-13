"use client";

// One pantry item: how much, where, until when. Logging some takes it off.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PHONE_ONLY_TEXT } from "@/components/food/recipe-editor-sheet";
import { logFromPantry, removePantryItem, saveFood, savePantryItem } from "@/lib/offline/nutrition-store";
import { defaultMealFor } from "@/lib/nutrition/day";
import { allowedUnits, makeEntry } from "@/lib/nutrition/entry-math";
import { amountText, parseAmount, unitChoiceLabel } from "@/lib/nutrition/display";
import type { EntryUnit, Food, MealSlot } from "@/lib/nutrition/diary-types";
import { LOCATION_LABEL, PANTRY_LOCATIONS, pantryUnits, type PantryItem, type PantryLocation, type PantryUnit } from "@/lib/nutrition/pantry";
import { dayKey } from "@/lib/shifts";
import { cn } from "@/lib/utils";

export interface PantryTarget {
  item: PantryItem;
  food: Food;
  /** The food isn't saved yet (an online result); it is saved with the item. */
  isNewFood: boolean;
  /** The item isn't saved yet. */
  isNew: boolean;
}

interface Props {
  target: PantryTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
  day: string;
  meals: readonly MealSlot[];
  now: Date;
}

export function newPantryItem(food: Food, now: Date): PantryItem {
  const unit: PantryUnit = food.packageAmount ? "package" : food.liquid ? "ml" : "g";
  return {
    id: crypto.randomUUID(),
    foodId: food.id,
    quantity: unit === "package" ? 1 : 100,
    unit,
    location: "cupboard",
    addedOn: dayKey(now),
    openedOn: null,
    useBy: null,
    note: null,
  };
}

export function PantryItemSheet(props: Props) {
  return (
    <Dialog open={props.target !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.target && <Form key={props.target.item.id} {...props} target={props.target} />}</DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-sm font-semibold",
        on ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function Form({ target, onOpenChange, onDone, day, meals, now }: Props & { target: PantryTarget }) {
  const { item, food } = target;
  const units = pantryUnits(food);
  const [qtyText, setQtyText] = useState(String(item.quantity));
  const [unit, setUnit] = useState<PantryUnit>(units.includes(item.unit) ? item.unit : units[0]);
  const [location, setLocation] = useState<PantryLocation>(item.location);
  const [useBy, setUseBy] = useState(item.useBy ?? "");
  const [opened, setOpened] = useState(item.openedOn !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const eatUnits = allowedUnits(food);
  const [eatText, setEatText] = useState(eatUnits.includes("serving") ? "1" : "100");
  const [eatUnit, setEatUnit] = useState<EntryUnit>(eatUnits.includes("serving") ? "serving" : eatUnits[0]);
  const meal = defaultMealFor(meals, now) ?? meals[0] ?? null;

  const quantityRaw = Number(qtyText.trim().replace(",", "."));
  const quantity = Number.isFinite(quantityRaw) && quantityRaw >= 0 ? quantityRaw : null;
  const eat = parseAmount(eatText);

  const save = async () => {
    if (quantity === null) return;
    setBusy(true);
    setError(null);
    try {
      const f = target.isNewFood ? await saveFood(food) : food;
      const next: PantryItem = {
        ...item,
        foodId: f.id,
        quantity,
        unit,
        location,
        useBy: useBy || null,
        openedOn: opened ? (item.openedOn ?? dayKey(now)) : null,
      };
      const saved = await savePantryItem(next);
      onDone(saved.localOnly ? PHONE_ONLY_TEXT : `${food.name} is in your ${LOCATION_LABEL[location].toLowerCase()}`);
      onOpenChange(false);
    } catch {
      setError("Couldn't save this. Try again.");
      setBusy(false);
    }
  };

  const logSome = async () => {
    if (!eat || !meal) return;
    setBusy(true);
    setError(null);
    try {
      const entry = makeEntry({ food, quantity: eat, unit: eatUnit, foodDay: day, meal, now: new Date(), id: crypto.randomUUID() });
      const res = await logFromPantry(item.id, entry, food);
      onDone(res.note ?? `Logged ${amountText(eat, eatUnit)} ${food.name} to ${meal.name}`);
      onOpenChange(false);
    } catch {
      setError("Couldn't log this. Try again.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removePantryItem(item.id);
      onDone(`${food.name} taken out of the pantry`);
      onOpenChange(false);
    } catch {
      setError("Couldn't remove this. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{food.name}</DialogTitle>
        <DialogDescription>{target.isNew ? "Add to your pantry" : "In your pantry"}</DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        How much you have
        <Input inputMode="decimal" value={qtyText} aria-invalid={quantity === null || undefined} onChange={(e) => setQtyText(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unit">
        {units.map((u) => (
          <Chip key={u} on={unit === u} onClick={() => setUnit(u)}>
            {unitChoiceLabel(u, food)}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where">
        {PANTRY_LOCATIONS.map((l) => (
          <Chip key={l} on={location === l} onClick={() => setLocation(l)}>
            {LOCATION_LABEL[l]}
          </Chip>
        ))}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Use by
        <Input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={opened} onChange={(e) => setOpened(e.target.checked)} className="size-4" />
        Opened
      </label>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={save} disabled={quantity === null || busy}>
        {target.isNew ? "Add to pantry" : "Save"}
      </Button>

      {!target.isNew && (
        <>
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ate some?</p>
            <Input aria-label="Amount eaten" inputMode="decimal" value={eatText} onChange={(e) => setEatText(e.target.value)} />
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unit eaten">
              {eatUnits.map((u) => (
                <Chip key={u} on={eatUnit === u} onClick={() => setEatUnit(u)}>
                  {unitChoiceLabel(u, food)}
                </Chip>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={logSome} disabled={!eat || !meal || busy}>
              Log to {meal?.name ?? "diary"} and take it off
            </Button>
          </div>
          {confirmRemove ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmRemove(false)} disabled={busy}>
                Keep it
              </Button>
              <Button type="button" variant="destructive" className="flex-1" onClick={remove} disabled={busy}>
                Remove
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmRemove(true)} disabled={busy}>
              Remove from pantry
            </Button>
          )}
        </>
      )}
    </>
  );
}
