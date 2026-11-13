"use client";

// When to eat around today's shift: before, mid-shift and after. Times only.
// The user can move any anchor; the change stays on this phone for that day.

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { kvGet, kvSet } from "@/lib/offline/kv";
import { defaultMealFor } from "@/lib/nutrition/day";
import { fuelPlan, withTime } from "@/lib/nutrition/fuel-plan";
import type { MealSlot } from "@/lib/nutrition/diary-types";
import { SHIFT_PRESETS, type Shift } from "@/lib/shifts";

const key = (day: string) => `nutrition-fuelplan:${day}`;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function FuelPlanCard({
  day,
  shifts,
  meals,
  onPlan,
  showOffDay = false,
}: {
  day: string;
  shifts: readonly Shift[];
  meals: readonly MealSlot[];
  /** Open "Log a usual" (with Plan it) for the meal at this anchor. */
  onPlan?: (meal: Pick<MealSlot, "id" | "name">) => void;
  /** Also show off days (meal slots, or a hint to add shifts). */
  showOffDay?: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void kvGet<Record<string, string>>(key(day)).then((v) => {
      if (live) setEdits(v && typeof v === "object" ? v : {});
    });
    return () => {
      live = false;
    };
  }, [day]);

  const plan = useMemo(() => fuelPlan(day, shifts, meals), [day, shifts, meals]);
  if (!plan.shift && !showOffDay) return null;
  const anchors = plan.anchors.map((a) => withTime(a, edits[a.id]));

  const change = (id: string, v: string) => {
    const next = { ...edits, [id]: v };
    setEdits(next);
    void kvSet(key(day), next);
  };

  return (
    <Card className="gap-3 p-4" data-testid="food-fuel-plan">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Briefcase className="text-primary-text size-4" aria-hidden /> {plan.shift ? "Fuel around your shift" : "Meal times"}
        </h2>
        <p className="text-muted-foreground text-xs">
          {plan.shift ? `${SHIFT_PRESETS[plan.shift.type].label} shift ${plan.shift.start}-${plan.shift.end}. ` : plan.note ? `${plan.note}. ` : "Off today. "}
          Times to eat; change any to suit you.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {anchors.map((a) => {
          const meal = defaultMealFor(meals, a.at);
          return (
            <li key={a.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium">{a.label}</span>
              <Input type="time" value={hm(a.at)} onChange={(e) => change(a.id, e.target.value)} className="h-9 max-w-28" aria-label={`${a.label} time`} />
              {meal && onPlan && (
                <Button type="button" size="icon" variant="ghost" aria-label={`Plan a usual for ${a.label}`} onClick={() => onPlan(meal)}>
                  <Bookmark />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
