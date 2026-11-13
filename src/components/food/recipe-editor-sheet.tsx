"use client";

// Make or change a recipe: name, servings, ingredients, and (optionally) the
// weight of the finished dish. Saving also updates the food it is logged as.

import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IngredientPickerSheet } from "@/components/food/ingredient-picker-sheet";
import { archiveRecipe, saveRecipe } from "@/lib/offline/nutrition-store";
import { amountText, parseAmount, showNutrient } from "@/lib/nutrition/display";
import { recipeProblem, rollup, wouldCycle, type Recipe, type RecipeItem } from "@/lib/nutrition/recipe";

export const PHONE_ONLY_TEXT = "Saved on this phone. Syncs after the next server update.";

interface Props {
  /** The recipe to change, a fresh one to make, or null when closed. */
  recipe: Recipe | null;
  /** Every saved recipe, so one can't be added inside itself. */
  recipes: readonly Recipe[];
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}

export function newRecipe(): Recipe {
  return { id: crypto.randomUUID(), name: "", servings: 1, cookedWeight: null, liquid: false, note: null, items: [], foodId: null, archived: false };
}

export function RecipeEditorSheet(props: Props) {
  return (
    <Dialog open={props.recipe !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.recipe && <Editor key={props.recipe.id} {...props} recipe={props.recipe} />}</DialogContent>
    </Dialog>
  );
}

function Editor({ recipe, recipes, onOpenChange, onSaved }: Props & { recipe: Recipe }) {
  const isNew = !recipes.some((r) => r.id === recipe.id);
  const [name, setName] = useState(recipe.name);
  const [servingsText, setServingsText] = useState(String(recipe.servings));
  const [cookedText, setCookedText] = useState(recipe.cookedWeight === null ? "" : String(recipe.cookedWeight));
  const [liquid, setLiquid] = useState(recipe.liquid);
  const [items, setItems] = useState<RecipeItem[]>(recipe.items);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const servings = parseAmount(servingsText) ?? 0;
  const cookedWeight = cookedText.trim() === "" ? null : (parseAmount(cookedText) ?? -1);
  const draft: Recipe = { ...recipe, name, servings, cookedWeight, liquid, items };
  const problem = recipeProblem(draft);
  let preview: ReturnType<typeof rollup> | null = null;
  try {
    preview = items.length && servings > 0 && cookedWeight !== -1 ? rollup(items, { servings, cookedWeight }) : null;
  } catch {
    preview = null;
  }
  const unit = liquid ? "ml" : "g";

  const isExcluded = useCallback((foodId: string) => wouldCycle(recipe.foodId, foodId, recipes), [recipe.foodId, recipes]);

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { recipe: saved } = await saveRecipe(draft);
      onSaved(saved.localOnly ? PHONE_ONLY_TEXT : `Saved ${saved.name}`);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save this. Try again.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await archiveRecipe(recipe.id);
      onSaved(`Deleted ${recipe.name}`);
      onOpenChange(false);
    } catch {
      setError("Couldn't delete this. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "New recipe" : "Edit recipe"}</DialogTitle>
        <DialogDescription>Saved recipes show up in Add food like any other food.</DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input value={name} maxLength={200} placeholder="Chicken rice bowl" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Servings
          <Input inputMode="decimal" value={servingsText} aria-invalid={servings <= 0 || undefined} onChange={(e) => setServingsText(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Cooked weight ({unit})
          <Input
            inputMode="decimal"
            value={cookedText}
            placeholder="Optional"
            aria-invalid={cookedWeight === -1 || undefined}
            onChange={(e) => setCookedText(e.target.value)}
          />
        </label>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Weigh the finished dish if you can: cooking changes the weight, and the numbers per {unit} follow it.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={liquid} onChange={(e) => setLiquid(e.target.checked)} className="size-4" />
        It&apos;s a drink or soup (measured in ml)
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ingredients</p>
        {items.length === 0 && <p className="text-muted-foreground text-sm">No ingredients yet.</p>}
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={`${it.foodId ?? it.name}-${i}`} className="bg-secondary/40 flex items-center justify-between gap-2 rounded-xl px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{it.name}</span>
                <span className="text-muted-foreground text-xs">
                  {amountText(it.quantity, it.unit)} · {showNutrient("energy", { ...it.per100.energy, value: (it.per100.energy.value * it.grams) / 100 })} kcal
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" onClick={() => setPicking(true)}>
          <Plus /> Add ingredient
        </Button>
      </div>

      {preview && (
        <div className="bg-secondary/40 border-border/50 rounded-xl border p-3 text-sm" data-testid="recipe-preview">
          <p className="font-semibold">
            One serving: {Number(preview.servingWeight.toFixed(1))} {unit} · {showNutrient("energy", { ...preview.per100.energy, value: (preview.per100.energy.value * preview.servingWeight) / 100 })} kcal ·{" "}
            {showNutrient("protein", { ...preview.per100.protein, value: (preview.per100.protein.value * preview.servingWeight) / 100 })} g protein
          </p>
          <p className="text-muted-foreground text-xs">
            Whole dish {Number(preview.totalWeight.toFixed(1))} {unit}
            {preview.incomplete ? ". Some ingredients don't list every value, so the real totals may be higher." : "."}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={save} disabled={busy}>
        Save recipe
      </Button>
      {!isNew &&
        (confirmDelete ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" className="flex-1" onClick={remove} disabled={busy}>
              Delete recipe
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete
          </Button>
        ))}

      <IngredientPickerSheet open={picking} onOpenChange={setPicking} isExcluded={isExcluded} onAdd={(it) => setItems((list) => [...list, it])} />
    </>
  );
}
