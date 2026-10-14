"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL_PLATES, ownedPlates } from "@/lib/plates";
import { toKg } from "@/lib/units";
import { parseNumber } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

/** "Edit available weights": the bar and plates your gym actually has. */
export function EquipmentSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Available weights</DialogTitle>
          <DialogDescription>The plate calculator only uses plates you tick here.</DialogDescription>
        </DialogHeader>
        {open && <EquipmentForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EquipmentForm({ onDone }: { onDone: () => void }) {
  const { profile, unit, updateProfile } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const current = ownedPlates(profile, unit);
  const [bar, setBar] = useState(String(current.bar));
  const [plates, setPlates] = useState<Set<number>>(new Set(current.plates));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const b = parseNumber(bar);
    if (b == null) return setError("Enter the bar weight.");
    if (plates.size === 0) return setError("Tick at least one plate.");
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        bar_weight_kg: Math.round(toKg(b, unit) * 100) / 100,
        available_plates_kg: [...plates].sort((a, z) => z - a).map((p) => Math.round(toKg(p, unit) * 100) / 100),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Bar ({u})
        <Input inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Plates ({u}, one of each size is enough)</legend>
        <div className="grid grid-cols-3 gap-2">
          {ALL_PLATES[unit].map((p) => {
            const on = plates.has(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(plates);
                  if (on) next.delete(p);
                  else next.add(p);
                  setPlates(next);
                }}
                className={cn(
                  "h-12 rounded-xl border font-mono text-base font-bold",
                  on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground",
                )}
              >
                {p}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button onClick={save} disabled={busy}>
        Save
      </Button>
    </>
  );
}
