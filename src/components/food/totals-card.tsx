import { Card } from "@/components/ui/card";
import { NUTRIENT_DISPLAY, showNutrient } from "@/lib/nutrition/display";
import type { NutrientKey, Nutrients } from "@/lib/nutrition/nutrients";

const SECONDARY: NutrientKey[] = ["protein", "carbohydrates", "fat", "fiber", "sugars", "sodium", "caffeine"];

/** The day's energy, large, then the other shown nutrients. "≥" means some entries didn't say. */
export function TotalsCard({ totals }: { totals: Nutrients }) {
  return (
    <Card className="gap-4 p-4" data-testid="food-totals">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums" data-testid="food-total-energy">
          {showNutrient("energy", totals.energy)}
        </span>
        <span className="text-muted-foreground text-sm font-medium">kcal</span>
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4">
        {SECONDARY.map((key) => {
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
    </Card>
  );
}
