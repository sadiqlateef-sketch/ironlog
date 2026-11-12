"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MealChips } from "@/components/food/meal-chips";
import { deleteEntry, updateEntry } from "@/lib/offline/nutrition-store";
import { allowedUnits, DISPLAY_NUTRIENTS, recomputeEntry } from "@/lib/nutrition/entry-math";
import { amountText, NUTRIENT_DISPLAY, parseAmount, showNutrient, unitLabel } from "@/lib/nutrition/display";
import type { DiaryEntry, EntryUnit, MealSlot } from "@/lib/nutrition/diary-types";
import { cn } from "@/lib/utils";

interface Props {
  entry: DiaryEntry | null;
  onOpenChange: (open: boolean) => void;
  meals: readonly MealSlot[];
}

export function EntrySheet({ entry, onOpenChange, meals }: Props) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>{entry && <Editor key={entry.id} entry={entry} meals={meals} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

const stepFor = (unit: EntryUnit) => (unit === "serving" || unit === "package" ? 0.5 : unit === "oz" || unit === "fl_oz" ? 1 : 10);

function Editor({ entry, meals, onClose }: { entry: DiaryEntry; meals: readonly MealSlot[]; onClose: () => void }) {
  const adjustable = entry.food !== null && entry.unit !== "quick";
  const [text, setText] = useState(String(entry.quantity));
  const [unit, setUnit] = useState<EntryUnit>(entry.unit);
  const [meal, setMeal] = useState<Pick<MealSlot, "id" | "name">>({ id: entry.mealId, name: entry.mealName });
  const [note, setNote] = useState(entry.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const quantity = parseAmount(text);
  let preview: DiaryEntry | null = entry;
  if (adjustable) {
    try {
      preview = quantity === null ? null : recomputeEntry(entry, quantity, unit);
    } catch {
      preview = null;
    }
  }

  const step = (dir: 1 | -1) => {
    const base = quantity ?? 0;
    const next = Math.max(stepFor(unit) / 2, Math.round((base + dir * stepFor(unit)) * 100) / 100);
    setText(String(next));
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const trimmed = note.trim();
      await updateEntry(
        entry.id,
        {
          ...(adjustable && quantity !== null ? { quantity, unit } : {}),
          mealId: meal.id,
          mealName: meal.name,
          note: trimmed === "" ? null : trimmed,
        },
        entry.foodDay,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteEntry(entry.id, entry.foodDay);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{entry.name}</DialogTitle>
        <DialogDescription>
          {entry.brand ? `${entry.brand} · ` : ""}
          {amountText(entry.quantity, entry.unit)}
        </DialogDescription>
      </DialogHeader>

      {adjustable && entry.food && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" size="icon" variant="outline" aria-label="Less" onClick={() => step(-1)}>
              <Minus />
            </Button>
            <Input
              aria-label="Amount"
              inputMode="decimal"
              value={text}
              aria-invalid={quantity === null || undefined}
              onChange={(e) => setText(e.target.value)}
              className="text-center"
            />
            <Button type="button" size="icon" variant="outline" aria-label="More" onClick={() => step(1)}>
              <Plus />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unit">
            {allowedUnits(entry.food).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-semibold",
                  unit === u ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
                )}
              >
                {unitLabel(u, 2)}
              </button>
            ))}
          </div>
        </div>
      )}

      <dl className="bg-secondary/40 border-border/50 grid grid-cols-4 gap-x-2 gap-y-3 rounded-xl border p-3" data-testid="entry-preview">
        {DISPLAY_NUTRIENTS.map((key) => {
          const d = NUTRIENT_DISPLAY[key]!;
          return (
            <div key={key} className="flex flex-col">
              <dt className="text-muted-foreground text-xs">{d.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">{preview ? showNutrient(key, preview.nutrients[key]) : "–"}</dd>
            </div>
          );
        })}
      </dl>

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Meal</p>
        <MealChips meals={meals} value={meal.id} onChange={setMeal} extra={{ id: entry.mealId, name: entry.mealName }} />
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Note
        <Input value={note} maxLength={500} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
      </label>

      <Button type="button" onClick={save} disabled={!preview || busy}>
        Save
      </Button>
      {confirmDelete ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={busy}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" className="flex-1" onClick={remove} disabled={busy}>
            Delete for good
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
          Delete
        </Button>
      )}
    </>
  );
}
