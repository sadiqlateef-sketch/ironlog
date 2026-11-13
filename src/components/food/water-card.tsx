"use client";

import { useState } from "react";
import { Droplet, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PHONE_ONLY_TEXT } from "@/components/food/recipe-editor-sheet";
import { addLog, removeLog } from "@/lib/offline/nutrition-store";
import type { Stored } from "@/lib/offline/nutrition-collections";
import { WATER_STEPS, waterMl, type NutritionLog } from "@/lib/nutrition/hydration";
import type { NutritionGoals } from "@/lib/nutrition/goals";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";

/** Water on a food day: quick-add glasses, undo the last, progress to the user's goal if set. */
export function WaterCard({
  day,
  entries,
  logs,
  goals,
}: {
  day: string;
  entries: readonly DiaryEntry[];
  logs: readonly Stored<NutritionLog>[];
  goals: NutritionGoals;
}) {
  const [busy, setBusy] = useState(false);
  const dayLogs = logs.filter((l) => l.kind === "water" && l.foodDay === day);
  const ml = waterMl(logs, entries, day, goals.hydration.countDrinks);
  const goal = goals.micros.water ?? null;
  const last = dayLogs[0];

  const add = async (amount: number) => {
    setBusy(true);
    try {
      await addLog({ id: crypto.randomUUID(), kind: "water", foodDay: day, amount, ref: null, loggedAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-3 p-4" data-testid="food-water">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Droplet className="text-primary-text size-4" aria-hidden /> Water
        </h2>
        <span className="text-sm tabular-nums">
          {ml} {goal ? `/ ${goal} ` : ""}ml
        </span>
      </div>
      {goal ? (
        <div className="bg-secondary h-1.5 overflow-hidden rounded-full" role="presentation">
          <div className="bg-primary h-full rounded-full" style={{ width: `${Math.min(100, (ml / goal) * 100)}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {WATER_STEPS.map((s) => (
          <Button key={s} type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void add(s)}>
            + {s} ml
          </Button>
        ))}
        {last && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void removeLog(last.id)} aria-label={`Undo ${last.amount} ml`}>
            <Undo2 /> Undo
          </Button>
        )}
      </div>
      {goals.hydration.countDrinks && <p className="text-muted-foreground text-xs">Includes drinks you logged as food (in ml).</p>}
      {dayLogs.some((l) => l.localOnly) && <p className="text-muted-foreground text-xs">{PHONE_ONLY_TEXT}</p>}
    </Card>
  );
}
