"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MealSlotsSheet } from "@/components/food/meal-slots-sheet";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { refreshFoodNudge } from "@/hooks/use-food-nudge";
import { foodNudgeTime, setFoodNudgeTime } from "@/lib/native";
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

  const [typedNight, setTypedNight] = useState<string | null>(null);
  const nightStart = typedNight ?? prefs.post_night_start ?? "15:00";
  const changeNightStart = async (v: string) => {
    setTypedNight(v);
    if (parseHm(v) !== null) {
      await save({ ...prefs, post_night_start: v });
      setTypedNight(null);
    }
  };

  const shifts = useWorkShifts();
  const [nudge, setNudge] = useState<string | null>(foodNudgeTime);
  const [nudgeNote, setNudgeNote] = useState<string | null>(null);
  const changeNudge = async (v: string | null) => {
    if (v !== null && parseHm(v) === null) return;
    const kept = await setFoodNudgeTime(v);
    setNudge(kept);
    setNudgeNote(v !== null && kept === null ? "Notifications are off for IronLog, so the reminder can't show." : null);
    if (kept !== null) await refreshFoodNudge(prefs, shifts);
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.follow_shifts === true}
            disabled={loading}
            onChange={(e) => void save({ ...prefs, follow_shifts: e.target.checked })}
            className="size-4"
            data-testid="food-follow-shifts"
          />
          <span className="font-semibold">Follow my shifts</span>
        </label>
        <span className="text-muted-foreground text-xs">
          After a night shift, food until the time below still counts for the shift&apos;s day. Uses the shifts you add under Training. Entries already logged don&apos;t move.
        </span>
        {prefs.follow_shifts && (
          <label className="flex items-center gap-2 text-sm">
            New food day after a night shift starts at
            <Input
              type="time"
              value={nightStart}
              onChange={(e) => void changeNightStart(e.target.value)}
              className="max-w-32"
              data-testid="food-post-night-start"
            />
          </label>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={nudge !== null}
            onChange={(e) => void changeNudge(e.target.checked ? "20:00" : null)}
            className="size-4"
            data-testid="food-nudge-on"
          />
          <span className="font-semibold">Remind me to log food</span>
        </label>
        {nudge !== null && (
          <label className="flex items-center gap-2 text-sm">
            If nothing is logged by
            <Input type="time" value={nudge} onChange={(e) => void changeNudge(e.target.value)} className="max-w-32" data-testid="food-nudge-time" />
          </label>
        )}
        <span className="text-muted-foreground text-xs">
          Off unless you turn it on. Skipped on days you&apos;ve logged; after a night shift it comes at the shift&apos;s end. This phone only.
        </span>
        {nudgeNote && <p className="text-sm">{nudgeNote}</p>}
      </div>

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
