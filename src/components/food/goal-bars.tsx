import type { NutrientKey, Nutrients } from "@/lib/nutrition/nutrients";
import { NUTRIENT_DISPLAY } from "@/lib/nutrition/display";
import type { DayGoal, ProteinSplit } from "@/lib/nutrition/goals";

interface Row {
  key: NutrientKey;
  /** In the shown unit (kcal, g, mg). */
  target: number;
  /** "max": a limit (sugars, sodium, caffeine); otherwise a goal to reach. */
  max?: boolean;
}

function rowsFor(goal: DayGoal, energyTarget: number): Row[] {
  const rows: Row[] = [
    { key: "energy", target: energyTarget },
    { key: "protein", target: goal.protein },
    { key: "carbohydrates", target: goal.carbs },
    { key: "fat", target: goal.fat },
  ];
  const m = goal.micros;
  if (m.fiber) rows.push({ key: "fiber", target: m.fiber });
  if (m.sugarsMax) rows.push({ key: "sugars", target: m.sugarsMax, max: true });
  if (m.sodiumMax) rows.push({ key: "sodium", target: m.sodiumMax, max: true });
  if (m.caffeineMax) rows.push({ key: "caffeine", target: m.caffeineMax, max: true });
  return rows;
}

const fmt = (n: number) => String(Math.round(n));

/** Progress against the day's goal: one bar per goal, with what's left (or over). */
export function GoalBars({
  totals,
  goal,
  energyTarget,
  split,
}: {
  totals: Nutrients;
  goal: DayGoal;
  /** Energy to compare against (the banked allowance when banking is on). */
  energyTarget?: number;
  split?: ProteinSplit | null;
}) {
  const rows = rowsFor(goal, energyTarget ?? goal.energy);
  return (
    <div className="flex flex-col gap-2.5" data-testid="food-goal-bars">
      {rows.map((r) => {
        const d = NUTRIENT_DISPLAY[r.key]!;
        const v = totals[r.key];
        const eaten = v.value * d.scale;
        const unsure = v.state === "incomplete" ? "≥ " : "";
        const pct = r.target > 0 ? Math.min(100, (eaten / r.target) * 100) : 0;
        const over = eaten > r.target;
        const left = r.target - eaten;
        const note = over
          ? `${fmt(-left)} ${d.unit} over`
          : r.max
            ? `${fmt(left)} ${d.unit} under limit`
            : `${unsure ? "≤ " : ""}${fmt(left)} ${d.unit} left`;
        return (
          <div key={r.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">
                {d.label}{" "}
                <span className="text-muted-foreground tabular-nums">
                  {unsure}
                  {fmt(eaten)} / {fmt(r.target)} {d.unit}
                </span>
              </span>
              <span className={`tabular-nums ${over && r.max ? "text-destructive" : "text-muted-foreground"}`}>{note}</span>
            </div>
            <div className="bg-secondary h-1.5 overflow-hidden rounded-full" role="presentation">
              <div className={`h-full rounded-full ${over && r.max ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {split && split.meals > 0 && (
        <p className="text-muted-foreground text-xs" data-testid="food-protein-split">
          Protein spread: {split.reached} of {split.meals} meals reached {fmt(split.target)} g
        </p>
      )}
    </div>
  );
}
