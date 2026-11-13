"use client";

// Pick one ingredient for a recipe: your own foods first (best match on top),
// online results only when you ask, then the amount.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Globe, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { remoteToFood } from "@/components/food/add-food-screen";
import { FoodResultRow, tagFor } from "@/components/food/food-result-row";
import { listFoods } from "@/lib/offline/nutrition-store";
import { allowedUnits } from "@/lib/nutrition/entry-math";
import { parseAmount, unitChoiceLabel } from "@/lib/nutrition/display";
import type { EntryUnit, Food } from "@/lib/nutrition/diary-types";
import { itemFromFood, type RecipeItem } from "@/lib/nutrition/recipe";
import { rankFoods } from "@/lib/nutrition/rank";
import { runFoodSearch } from "@/lib/nutrition/search-service";
import { cn } from "@/lib/utils";

const SHOWN = 40;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Foods that can't be used here (the recipe itself, recipes that contain it). */
  isExcluded: (foodId: string) => boolean;
  onAdd: (item: RecipeItem) => void;
}

export function IngredientPickerSheet(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <Picker {...props} />}</DialogContent>
    </Dialog>
  );
}

function Picker({ isExcluded, onAdd, onOpenChange }: Props) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<{ query: string; foods: Food[] } | "busy" | "failed" | null>(null);
  const [picked, setPicked] = useState<{ food: Food; remote: boolean } | null>(null);

  useEffect(() => {
    listFoods()
      .then(setFoods)
      .catch(() => {});
  }, []);

  const local = useMemo(() => {
    const q = query.trim().toLowerCase();
    const usable = foods.filter((f) => !f.archived && !isExcluded(f.id));
    if (q === "") return usable.slice(0, SHOWN);
    const hits = usable.filter((f) => f.name.toLowerCase().includes(q) || (f.brand ?? "").toLowerCase().includes(q));
    return rankFoods(q, hits).slice(0, SHOWN);
  }, [foods, query, isExcluded]);

  const searchOnline = async () => {
    const q = query.trim();
    if (q === "") return;
    setOnline("busy");
    try {
      const res = await runFoodSearch(q);
      setOnline({ query: q, foods: res.results.map(remoteToFood) });
    } catch {
      setOnline("failed");
    }
  };

  if (picked) {
    return (
      <AmountStep
        food={picked.food}
        onBack={() => setPicked(null)}
        onAdd={(item) => {
          // An online food isn't in your library, so the ingredient keeps only its own copy.
          onAdd(picked.remote ? { ...item, foodId: null } : item);
          onOpenChange(false);
        }}
      />
    );
  }

  const remote = typeof online === "object" && online !== null && online.query === query.trim() ? online.foods : [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add an ingredient</DialogTitle>
        <DialogDescription>Pick from your foods, or search online.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input
          type="search"
          aria-label="Search your foods"
          placeholder="Search your foods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col">
        {local.map((f) => (
          <FoodResultRow key={f.id} food={f} tag={tagFor(f)} onPick={() => setPicked({ food: f, remote: false })} />
        ))}
        {local.length === 0 && <p className="text-muted-foreground px-3 py-2 text-sm">No saved food matches.</p>}
      </div>
      <Button type="button" variant="outline" disabled={query.trim() === "" || online === "busy"} onClick={() => void searchOnline()}>
        <Globe /> {online === "busy" ? "Searching…" : "Search online"}
      </Button>
      {online === "failed" && (
        <p role="status" className="text-muted-foreground text-sm">
          Couldn&apos;t search online. Check your connection and try again.
        </p>
      )}
      {remote.length > 0 && (
        <div className="flex flex-col">
          {remote.map((f) => (
            <FoodResultRow key={f.id} food={f} tag={tagFor(f)} onPick={() => setPicked({ food: f, remote: true })} />
          ))}
        </div>
      )}
    </>
  );
}

function AmountStep({ food, onBack, onAdd }: { food: Food; onBack: () => void; onAdd: (item: RecipeItem) => void }) {
  const units = allowedUnits(food) as Exclude<EntryUnit, "quick">[];
  const [unit, setUnit] = useState(units[0]);
  const [text, setText] = useState(unit === "g" || unit === "ml" ? "100" : "1");
  const quantity = parseAmount(text);
  const item = quantity === null ? null : itemFromFood(food, quantity, unit);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{food.name}</DialogTitle>
        <DialogDescription>How much goes in the recipe?</DialogDescription>
      </DialogHeader>
      <Input
        aria-label="Amount"
        inputMode="decimal"
        value={text}
        aria-invalid={item === null || undefined}
        onChange={(e) => setText(e.target.value)}
        className="text-center"
      />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unit">
        {units.map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            onClick={() => setUnit(u)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-semibold",
              unit === u ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
            )}
          >
            {unitChoiceLabel(u, food)}
          </button>
        ))}
      </div>
      <Button type="button" disabled={!item} onClick={() => item && onAdd(item)}>
        Add ingredient
      </Button>
      <Button type="button" variant="ghost" onClick={onBack}>
        <ChevronLeft /> Pick another food
      </Button>
    </>
  );
}
