import type { DiaryEntry } from "@/lib/nutrition/diary-types";
import { amountText, showNutrient } from "@/lib/nutrition/display";
import { isPlanned } from "@/lib/nutrition/entry-math";
import { cn } from "@/lib/utils";

interface Props {
  entry: DiaryEntry;
  onOpen: () => void;
  /** Planned entries only: ate it / didn't. */
  onConfirm?: () => void;
  onRemove?: () => void;
}

/** One logged item: name, amount, and its calories ("≥" when the food didn't list them all). Planned items are dimmed. */
export function EntryRow({ entry, onOpen, onConfirm, onRemove }: Props) {
  const planned = isPlanned(entry);
  return (
    <div className={cn("flex flex-col", planned && "rounded-xl border border-dashed")}>
      <button
        type="button"
        onClick={onOpen}
        className={cn("hover:bg-accent flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left", planned && "opacity-60")}
        data-testid="food-entry"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base font-medium">{entry.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {planned ? "Planned · not counted yet · " : ""}
            {entry.brand ? `${entry.brand} · ` : ""}
            {amountText(entry.quantity, entry.unit)}
          </span>
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums">
          {showNutrient("energy", entry.nutrients.energy)}
          <span className="text-muted-foreground text-xs font-normal"> kcal</span>
        </span>
      </button>
      {planned && (onConfirm || onRemove) && (
        <div className="flex gap-2 px-3 pb-2">
          {onConfirm && (
            <button type="button" onClick={onConfirm} className="text-primary-text hover:bg-accent h-9 rounded-lg px-3 text-sm font-semibold">
              I ate it
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-muted-foreground hover:bg-accent h-9 rounded-lg px-3 text-sm font-semibold">
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
