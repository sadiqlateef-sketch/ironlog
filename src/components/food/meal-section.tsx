import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EntryRow } from "@/components/food/entry-row";
import { mealTotals } from "@/lib/nutrition/entry-math";
import { showNutrient } from "@/lib/nutrition/display";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";

interface Props {
  title: string;
  /** "06:00-10:00", or null for all-day and for meals that no longer exist. */
  window: string | null;
  entries: DiaryEntry[];
  /** Where "Add" goes; null for a meal that no longer exists. */
  addHref: string | null;
  onOpen: (entry: DiaryEntry) => void;
}

export function MealSection({ title, window, entries, addHref, onOpen }: Props) {
  const totals = mealTotals(entries);
  return (
    <Card className="gap-1 p-3" data-testid="food-meal">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-base font-bold">{title}</h2>
          <p className="text-muted-foreground text-xs">
            {window ? `${window} · ` : ""}
            {entries.length === 0 ? "Nothing yet" : `${showNutrient("energy", totals.energy)} kcal`}
          </p>
        </div>
        {addHref && (
          <Link
            href={addHref}
            className="text-primary-text hover:bg-accent flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold"
            aria-label={`Add food to ${title}`}
          >
            <Plus className="size-4" aria-hidden /> Add
          </Link>
        )}
      </div>
      {entries.length > 0 && (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li key={e.id}>
              <EntryRow entry={e} onOpen={() => onOpen(e)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
