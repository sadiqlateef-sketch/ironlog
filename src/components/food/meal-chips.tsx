import type { MealSlot } from "@/lib/nutrition/diary-types";
import { cn } from "@/lib/utils";

/** Pick which meal an entry goes in. */
export function MealChips({
  meals,
  value,
  onChange,
  extra,
}: {
  meals: readonly MealSlot[];
  value: string;
  onChange: (meal: Pick<MealSlot, "id" | "name">) => void;
  /** A meal the entry is already in that has since been removed, so it can stay selected. */
  extra?: Pick<MealSlot, "id" | "name"> | null;
}) {
  const list: Pick<MealSlot, "id" | "name">[] = extra && !meals.some((m) => m.id === extra.id) ? [...meals, extra] : [...meals];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Meal">
      {list.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m)}
          className={cn(
            "h-10 rounded-full border px-4 text-sm font-semibold",
            value === m.id ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
          )}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}
