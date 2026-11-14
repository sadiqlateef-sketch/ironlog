"use client";

// Leftovers and pantry food close to their use-by date, with optional evening
// reminders on this phone. Dates are the ones you typed; nothing here is food-safety advice.

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listBatches, listFoods, listPantry, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { leftoverRemindersOn, scheduleLeftoverReminders, setLeftoverReminders } from "@/lib/native";
import { reminderTimes, toUseSoon, type UseSoonItem } from "@/lib/nutrition/leftovers";

export const USE_SOON_DAYS = 2;

export function UseSoonCard({ today }: { today: string }) {
  const [items, setItems] = useState<UseSoonItem[]>([]);
  const [on, setOn] = useState(leftoverRemindersOn);

  const load = useCallback(() => {
    Promise.all([listBatches(), listPantry(), listFoods()])
      .then(([batches, pantry, foods]) => {
        const names = new Map(foods.map((f) => [f.id, f.name]));
        const list = toUseSoon(batches, pantry, today, USE_SOON_DAYS).map((i) => (i.kind === "pantry" ? { ...i, label: names.get(i.label) ?? "Pantry item" } : i));
        setItems(list);
        void scheduleLeftoverReminders(reminderTimes(list, new Date()));
      })
      .catch(() => {});
  }, [today]);
  useEffect(() => {
    load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => window.removeEventListener(NUTRITION_EVENT, load);
  }, [load]);

  const toggle = async () => {
    const next = await setLeftoverReminders(!on);
    setOn(next);
    if (next) load();
  };

  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1" data-testid="use-soon">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Use soon</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => void toggle()} aria-pressed={on}>
          {on ? <Bell className="size-4" /> : <BellOff className="size-4" />} {on ? "Reminders on" : "Remind me"}
        </Button>
      </div>
      <ul className="glass rounded-2xl p-1">
        {items.map((i) => (
          <li key={`${i.kind}:${i.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-medium">{i.label}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {i.kind === "batch" ? "Batch" : "Pantry"} · {i.past ? `use-by date passed (${i.useBy})` : `use by ${i.useBy}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
