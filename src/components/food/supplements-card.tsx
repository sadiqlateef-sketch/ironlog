"use client";

import Link from "next/link";
import { Check, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PHONE_ONLY_TEXT } from "@/components/food/recipe-editor-sheet";
import { addLog, removeLog } from "@/lib/offline/nutrition-store";
import type { Stored } from "@/lib/offline/nutrition-collections";
import type { NutritionLog } from "@/lib/nutrition/hydration";
import type { NutritionGoals, Supplement } from "@/lib/nutrition/goals";
import { dosesPerDay, dueNow, supplementStreak, takenToday } from "@/lib/nutrition/supplements";

/** The user's own supplement list for a food day: tap to check a dose off, tap again to undo. */
export function SupplementsCard({
  day,
  logs,
  goals,
  now,
  isToday,
}: {
  day: string;
  logs: readonly Stored<NutritionLog>[];
  goals: NutritionGoals;
  now: Date;
  isToday: boolean;
}) {
  const list = goals.supplements;
  if (!list.length) return null;
  const due = new Set(isToday ? dueNow(list, logs, day, now).map((s) => s.id) : []);
  const streak = isToday ? supplementStreak(list, logs, day) : 0;

  const toggle = async (s: Supplement) => {
    const mine = logs.filter((l) => l.kind === "supplement" && l.ref === s.id && l.foodDay === day);
    if (mine.length >= dosesPerDay(s)) {
      await removeLog(mine[0].id);
      return;
    }
    await addLog({ id: crypto.randomUUID(), kind: "supplement", foodDay: day, amount: 1, ref: s.id, loggedAt: new Date().toISOString() });
  };

  return (
    <Card className="gap-3 p-4" data-testid="food-supplements">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Pill className="text-primary-text size-4" aria-hidden /> Supplements
        </h2>
        {streak > 0 && <span className="text-muted-foreground text-xs tabular-nums">{streak} day{streak === 1 ? "" : "s"} in a row</span>}
      </div>
      <ul className="flex flex-col gap-1">
        {list.map((s) => {
          const taken = takenToday(s, logs, day);
          const total = dosesPerDay(s);
          const done = taken >= total;
          return (
            <li key={s.id}>
              <Button
                type="button"
                variant={done ? "secondary" : "outline"}
                className="h-auto w-full justify-between py-2 text-left"
                onClick={() => void toggle(s)}
                aria-pressed={done}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {s.name}
                    {s.dose ? <span className="text-muted-foreground font-normal"> · {s.dose}</span> : null}
                  </span>
                  <span className="text-muted-foreground block text-xs font-normal">
                    {s.times.length ? s.times.join(", ") : "Once a day"}
                    {due.has(s.id) ? " · due" : ""}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs tabular-nums">
                  {total > 1 ? `${Math.min(taken, total)}/${total}` : null}
                  {done && <Check className="size-4" aria-label="Taken" />}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {logs.some((l) => l.kind === "supplement" && l.foodDay === day && l.localOnly) && <p className="text-muted-foreground text-xs">{PHONE_ONLY_TEXT}</p>}
      <Link href="/food/goals/#supplements" className="text-muted-foreground self-start text-xs underline-offset-4 hover:underline">
        Edit list
      </Link>
    </Card>
  );
}
