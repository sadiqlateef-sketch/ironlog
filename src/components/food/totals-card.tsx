import Link from "next/link";
import { Card } from "@/components/ui/card";
import { GoalBars } from "@/components/food/goal-bars";
import { NUTRIENT_DISPLAY, showNutrient } from "@/lib/nutrition/display";
import type { NutrientKey, Nutrients } from "@/lib/nutrition/nutrients";
import type { DayGoal, ProteinSplit } from "@/lib/nutrition/goals";
import type { Allowance } from "@/lib/nutrition/banking";

const SECONDARY: NutrientKey[] = ["protein", "carbohydrates", "fat", "fiber", "sugars", "sodium", "caffeine"];

function barKeys(goal: DayGoal): NutrientKey[] {
  const m = goal.micros;
  return [
    "protein",
    "carbohydrates",
    "fat",
    ...(m.fiber ? (["fiber"] as const) : []),
    ...(m.sugarsMax ? (["sugars"] as const) : []),
    ...(m.sodiumMax ? (["sodium"] as const) : []),
    ...(m.caffeineMax ? (["caffeine"] as const) : []),
  ];
}

/**
 * The day's energy, large, then the other shown nutrients. "≥" means some entries didn't say.
 * With `goal` given: bars against it and what's left; `goal` null shows "Set a goal".
 */
export function TotalsCard({
  totals,
  goal,
  allowance,
  split,
}: {
  totals: Nutrients;
  goal?: DayGoal | null;
  allowance?: Allowance | null;
  split?: ProteinSplit | null;
}) {
  const target = allowance?.allowance ?? goal?.energy;
  // Nutrients that already have a goal bar aren't repeated below it.
  const shown = goal ? SECONDARY.filter((k) => !barKeys(goal).includes(k)) : SECONDARY;
  const left = target !== undefined ? Math.round(target - totals.energy.value) : null;
  return (
    <Card className="gap-4 p-4" data-testid="food-totals">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums" data-testid="food-total-energy">
            {showNutrient("energy", totals.energy)}
          </span>
          <span className="text-muted-foreground text-sm font-medium">kcal</span>
        </div>
        {goal && left !== null && (
          <span className="text-muted-foreground text-sm tabular-nums" data-testid="food-kcal-left">
            {left >= 0 ? `${left} kcal left` : `${-left} kcal over`}
          </span>
        )}
        {goal === null && (
          <Link href="/food/goals/" className="text-primary-text text-sm font-medium underline-offset-4 hover:underline">
            Set a goal
          </Link>
        )}
      </div>
      {goal && allowance && allowance.boost !== 0 && (
        <p className="text-muted-foreground -mt-2 text-xs tabular-nums">
          Goal {goal.energy} {allowance.boost > 0 ? "+" : "−"} {Math.abs(allowance.boost)} kcal from this week so far
          {allowance.capped ? " (capped)" : ""}
          {allowance.incomplete.length ? ` · ${allowance.incomplete.length} day(s) with unknown kcal left out` : ""}
        </p>
      )}
      {goal && <GoalBars totals={totals} goal={goal} energyTarget={target} split={split} />}
      {shown.length > 0 && (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4">
          {shown.map((key) => {
            const d = NUTRIENT_DISPLAY[key]!;
            return (
              <div key={key} className="flex flex-col">
                <dt className="text-muted-foreground text-xs font-medium">{d.label}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {showNutrient(key, totals[key])} <span className="text-muted-foreground text-xs font-normal">{d.unit}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}
