import type { DiaryEntry } from "@/lib/nutrition/diary-types";
import { amountText, showNutrient } from "@/lib/nutrition/display";

/** One logged item: name, amount, and its calories ("≥" when the food didn't list them all). */
export function EntryRow({ entry, onOpen }: { entry: DiaryEntry; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-accent flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
      data-testid="food-entry"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-medium">{entry.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {entry.brand ? `${entry.brand} · ` : ""}
          {amountText(entry.quantity, entry.unit)}
        </span>
      </span>
      <span className="shrink-0 text-base font-semibold tabular-nums">
        {showNutrient("energy", entry.nutrients.energy)}
        <span className="text-muted-foreground text-xs font-normal"> kcal</span>
      </span>
    </button>
  );
}
