"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createExercise, type Exercise } from "@/lib/workout-api";
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import type { EquipmentType, MuscleGroup } from "@/types/database";

const selectClass = "border-input bg-secondary h-11 w-full rounded-xl border px-3 text-base";

export function NewExerciseDialog({
  open,
  onOpenChange,
  onCreated,
  initialName,
}: {
  /** Prefill the name, e.g. with what an imported workout called it (read on mount; give the dialog a key to reset). */
  initialName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (exercise: Exercise) => void;
}) {
  const { session } = useAuth();
  const [name, setName] = useState(initialName ?? "");
  const [muscle, setMuscle] = useState<MuscleGroup>("chest");
  const [equipment, setEquipment] = useState<EquipmentType>("barbell");
  const [compound, setCompound] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createExercise({
        name: name.trim(),
        primary_muscle: muscle,
        secondary_muscles: [],
        equipment,
        mechanic: compound ? "compound" : "isolation",
        userId: session.user.id,
      });
      setName("");
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg.includes("duplicate") ? "You already have an exercise with that name." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New exercise</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input placeholder="Name, e.g. Paused Squat" required value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex flex-col gap-1 text-sm">
            Main muscle
            <select className={selectClass} value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)}>
              {Object.entries(MUSCLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Equipment
            <select className={selectClass} value={equipment} onChange={(e) => setEquipment(e.target.value as EquipmentType)}>
              {Object.entries(EQUIPMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary size-4" checked={compound} onChange={(e) => setCompound(e.target.checked)} />
            Compound lift (works several joints)
          </label>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim()}>
            Save exercise
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
