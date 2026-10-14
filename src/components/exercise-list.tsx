"use client";

import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { MuscleFigure, sideOf } from "@/components/muscle-map";
import { Input } from "@/components/ui/input";
import type { Exercise } from "@/lib/workout-api";
import { EQUIPMENT_LABELS, MUSCLE_FILTERS, MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const FAVOURITES = "Favourites";

/** Searchable, filterable exercise list. Used by the library page and the picker. */
export function ExerciseList({
  exercises,
  onSelect,
  trailing,
  favorites,
  muscleGrid,
}: {
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  trailing?: (exercise: Exercise) => React.ReactNode;
  /** Ids of starred exercises: they get a star and their own filter. */
  favorites?: Set<string>;
  /** Show the muscle picture grid while nothing is searched or filtered. */
  muscleGrid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const filters = [...(favorites?.size ? [{ label: FAVOURITES, muscles: [] }] : []), ...MUSCLE_FILTERS];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const muscles = MUSCLE_FILTERS.find((f) => f.label === filter)?.muscles;
    return exercises.filter(
      (e) =>
        (!q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))) &&
        (!muscles || muscles.includes(e.primary_muscle)) &&
        (filter !== FAVOURITES || favorites?.has(e.id)),
    );
  }, [exercises, query, filter, favorites]);

  const showGrid = muscleGrid && !query.trim() && !filter;

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
      {showGrid ? (
        <div className="grid grid-cols-3 gap-2">
          {MUSCLE_FILTERS.map((f) => {
            const count = exercises.filter((e) => f.muscles.includes(e.primary_muscle)).length;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setFilter(f.label)}
                className="glass flex flex-col items-center gap-1 rounded-2xl px-2 pt-3 pb-2"
              >
                <MuscleFigure
                  side={sideOf(f.muscles[0])}
                  fill={(m) => (f.muscles.includes(m) ? "var(--primary)" : undefined)}
                  className="h-20 w-auto"
                />
                <span className="text-sm font-semibold">{f.label}</span>
                <span className="text-muted-foreground text-xs">{count} exercises</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {filters.map((f) => (
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
      )}
      {showGrid && favorites && favorites.size > 0 && (
        <button
          type="button"
          onClick={() => setFilter(FAVOURITES)}
          className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-left font-semibold"
        >
          <Star className="fill-set-warmup text-set-warmup size-5" /> Favourites
          <span className="text-muted-foreground ml-auto text-sm font-normal">{favorites.size}</span>
        </button>
      )}
      <ul className="divide-y rounded-xl border">
        {visible.map((e) => (
          <li key={e.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(e)}
              className="hover:bg-accent flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
            >
              {e.image_urls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.image_urls[0]} alt="" loading="lazy" className="size-11 shrink-0 rounded-full bg-white object-cover" />
              ) : (
                <span className="bg-secondary flex size-11 shrink-0 items-center justify-center rounded-full">
                  <MuscleFigure
                    side={sideOf(e.primary_muscle)}
                    fill={(m) => (m === e.primary_muscle ? "var(--primary)" : undefined)}
                    className="h-9 w-auto"
                  />
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {favorites?.has(e.id) && <Star className="fill-set-warmup text-set-warmup mr-1 inline size-3.5 align-[-2px]" aria-label="Favourite" />}
                  {e.name}
                  {e.created_by && <span className="text-muted-foreground ml-2 text-xs">Custom</span>}
                </span>
                <span className="text-muted-foreground text-xs">
                  {MUSCLE_LABELS[e.primary_muscle]} · {EQUIPMENT_LABELS[e.equipment]}
                </span>
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
