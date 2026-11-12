"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MealSlotsSheet } from "@/components/food/meal-slots-sheet";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { parseHm } from "@/lib/nutrition/day";
import { clearUsdaKey, getUsdaKey, maskKey, setUsdaKey } from "@/lib/nutrition/key-store";

export function NutritionSettings() {
  const { prefs, loading, save } = useNutritionPrefs();
  const [typed, setTyped] = useState<string | null>(null);
  const dayStart = typed ?? prefs.day_start;
  const [meals, setMeals] = useState(false);
  const [keyText, setKeyText] = useState("");
  const [keyNote, setKeyNote] = useState<string | null>(null);
  // Only the masked form is ever kept in state or shown.
  const [mask, setMask] = useState(() => maskKey(getUsdaKey()));

  const changeDay = async (v: string) => {
    setTyped(v);
    if (parseHm(v) !== null) {
      await save({ ...prefs, day_start: v });
      setTyped(null);
    }
  };

  const saveKey = () => {
    if (keyText.trim() === "") return;
    const ok = setUsdaKey(keyText);
    setKeyText("");
    setMask(maskKey(getUsdaKey()));
    setKeyNote(ok ? "Saved on this phone." : "This phone would not save it. Try again.");
  };
  const removeKey = () => {
    clearUsdaKey();
    setKeyText("");
    setMask(maskKey(""));
    setKeyNote("Removed.");
  };

  return (
    <div className="flex flex-col gap-5">
      <NutritionSyncChip />

      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">My food day starts at</span>
        <Input type="time" value={dayStart} disabled={loading} onChange={(e) => void changeDay(e.target.value)} className="max-w-40" />
        <span className="text-muted-foreground text-xs">
          Leave 00:00 for a normal day. After night shifts, set 04:00 so a 3 a.m. snack counts for the day before.
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold">Meals</span>
        <Button type="button" variant="outline" className="self-start" onClick={() => setMeals(true)}>
          Edit meals
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="usda-key" className="font-semibold">
          USDA key
        </label>
        <p className="text-muted-foreground text-sm">Key: {mask}</p>
        <div className="flex gap-2">
          <Input
            id="usda-key"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste your key"
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
          />
          <Button type="button" onClick={saveKey} disabled={keyText.trim() === ""}>
            Save
          </Button>
        </div>
        <Button type="button" variant="ghost" className="self-start" onClick={removeKey} disabled={mask === "not set"}>
          Remove key
        </Button>
        {keyNote && <p className="text-sm">{keyNote}</p>}
        <p className="text-muted-foreground text-xs">
          The key stays on this phone only. It is never synced or backed up, and signing out does not remove it. Use Remove key to delete it.
          Get a free key at fdc.nal.usda.gov/api-key-signup. Without one, search still uses Open Food Facts.
        </p>
      </div>

      <MealSlotsSheet
        open={meals}
        onOpenChange={setMeals}
        meals={prefs.meals}
        onSave={async (next) => {
          await save({ ...prefs, meals: next });
        }}
      />
    </div>
  );
}
