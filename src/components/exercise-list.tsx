"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Exercise } from "@/lib/workout-api";
import { EQUIPMENT_LABELS, MUSCLE_FILTERS, MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Searchable, filterable exercise list. Used by the library page and the picker. */
export function ExerciseList({
  exercises,
  onSelect,
  trailing,
}: {
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  trailing?: (exercise: Exercise) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const muscles = MUSCLE_FILTERS.find((f) => f.label === filter)?.muscles;
    return exercises.filter(
      (e) =>
        (!q || e.name.toLowerCase().includes(q)) &&
        (!muscles || muscles.includes(e.primary_muscle)),
    );
  }, [exercises, query, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {MUSCLE_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(filter === f.label ? null : f.label)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm",
              filter === f.label ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="divide-y rounded-xl border">
        {visible.map((e) => (
          <li key={e.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(e)}
              className="hover:bg-accent flex min-w-0 flex-1 flex-col items-start px-4 py-3 text-left"
            >
              <span className="font-medium">
                {e.name}
                {e.created_by && <span className="text-muted-foreground ml-2 text-xs">Custom</span>}
              </span>
              <span className="text-muted-foreground text-xs">
                {MUSCLE_LABELS[e.primary_muscle]} · {EQUIPMENT_LABELS[e.equipment]}
              </span>
            </button>
            {trailing?.(e)}
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-muted-foreground px-4 py-6 text-center text-sm">No exercises match.</li>
        )}
      </ul>
    </div>
  );
}
