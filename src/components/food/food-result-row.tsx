import { ChevronRight } from "lucide-react";
import { showNutrient } from "@/lib/nutrition/display";
import { completeness } from "@/lib/nutrition/quality";
import type { Food } from "@/lib/nutrition/diary-types";

export type FoodTag = "Mine" | "OFF" | "USDA";

export function tagFor(food: Pick<Food, "source">): FoodTag {
  return food.source === "off" ? "OFF" : food.source === "usda" ? "USDA" : "Mine";
}

/** One food in a list: name, brand, calories per 100, how many nutrients it lists, and where it came from. */
export function FoodResultRow({
  food,
  tag,
  detail,
  onPick,
}: {
  food: Pick<Food, "name" | "brand" | "liquid" | "nutrients">;
  tag: FoodTag;
  /** Extra text, such as the last amount for a recent food. */
  detail?: string;
  onPick: () => void;
}) {
  const known = completeness(food.nutrients).known;
  return (
    <button
      type="button"
      onClick={onPick}
      className="hover:bg-accent flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
      data-testid="food-result"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-medium">{food.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {food.brand ? `${food.brand} · ` : ""}
          {showNutrient("energy", food.nutrients.energy)} kcal per 100 {food.liquid ? "ml" : "g"} · {known}/43 nutrients
          {detail ? ` · ${detail}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">{tag}</span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </span>
    </button>
  );
}
