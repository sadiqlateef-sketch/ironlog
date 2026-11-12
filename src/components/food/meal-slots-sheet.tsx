"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_MEALS, MAX_MEALS, validateMeals } from "@/lib/nutrition/day";
import type { MealSlot } from "@/lib/nutrition/diary-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meals: readonly MealSlot[];
  onSave: (meals: MealSlot[]) => Promise<void> | void;
}

const renumber = (list: MealSlot[]): MealSlot[] => list.map((m, i) => ({ ...m, rank: i + 1 }));

export function MealSlotsSheet({ open, onOpenChange, meals, onSave }: Props) {
  // The form restarts from the saved slots each time the sheet opens.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Editor meals={meals} onSave={onSave} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function Editor({ meals, onSave, onClose }: { meals: readonly MealSlot[]; onSave: Props["onSave"]; onClose: () => void }) {
  const [list, setList] = useState<MealSlot[]>(() => meals.map((m) => ({ ...m })));
  const [saving, setSaving] = useState(false);
  const error = validateMeals(list);

  const patch = (i: number, p: Partial<MealSlot>) => setList((l) => l.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      await onSave(renumber(list));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Meals</DialogTitle>
        <DialogDescription>Name each meal and when it usually happens. Same start and end means all day.</DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-3">
        {list.map((m, i) => (
          <li key={m.id} className="bg-secondary/40 border-border/50 flex flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-center gap-1">
              <Input aria-label="Meal name" value={m.name} maxLength={60} onChange={(e) => patch(i, { name: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Remove meal" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="flex flex-1 items-center gap-2">
                From
                <Input type="time" value={m.start} onChange={(e) => patch(i, { start: e.target.value })} />
              </label>
              <label className="flex flex-1 items-center gap-2">
                To
                <Input type="time" value={m.end} onChange={(e) => patch(i, { end: e.target.value })} />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={list.length >= MAX_MEALS}
          onClick={() =>
            setList((l) => [...l, { id: `meal-${crypto.randomUUID().slice(0, 8)}`, name: "", start: "00:00", end: "00:00", rank: l.length + 1 }])
          }
        >
          <Plus /> Add meal
        </Button>
        <Button type="button" variant="ghost" onClick={() => setList(DEFAULT_MEALS.map((m) => ({ ...m })))}>
          Reset to defaults
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p className="text-muted-foreground text-xs">Changing meals never changes food you already logged.</p>
      <Button type="button" onClick={save} disabled={!!error || saving}>
        Save meals
      </Button>
    </>
  );
}
