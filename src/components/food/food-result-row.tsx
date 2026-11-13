import { ChevronRight } from "lucide-react";
import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";
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
  onLongPress,
  longPressHint,
}: {
  food: Pick<Food, "name" | "brand" | "liquid" | "nutrients">;
  tag: FoodTag;
  /** Extra text, such as the last amount for a recent food. */
  detail?: string;
  onPick: () => void;
  /** Press and hold (500 ms), e.g. to log it again at the last amount. */
  onLongPress?: () => void;
  /** Read out for screen readers, e.g. "Press and hold to log 50 g again". */
  longPressHint?: string;
}) {
  const known = completeness(food.nutrients).known;
  const press = useLongPress(onLongPress, onPick);
  return (
    <button
      type="button"
      {...press}
      className={cn(
        "hover:bg-accent flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left",
        onLongPress && "select-none [-webkit-touch-callout:none]",
      )}
      data-testid="food-result"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-medium">{food.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {food.brand ? `${food.brand} · ` : ""}
          {showNutrient("energy", food.nutrients.energy)} kcal per 100 {food.liquid ? "ml" : "g"} · {known}/43 nutrients
          {detail ? ` · ${detail}` : ""}
          {onLongPress && longPressHint ? <span className="sr-only">. {longPressHint}</span> : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">{tag}</span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </span>
    </button>
  );
}
