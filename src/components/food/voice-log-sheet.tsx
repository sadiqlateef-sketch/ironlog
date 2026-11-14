"use client";

// Say what you ate. The words are parsed on the phone (no AI, nothing sent
// anywhere by Ironlog) and matched to foods you already have. Nothing is
// logged until you tick the rows and press Log.

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MealChips } from "@/components/food/meal-chips";
import { addEntries } from "@/lib/offline/nutrition-store";
import type { RecentFood } from "@/lib/offline/nutrition-store";
import { defaultMealFor } from "@/lib/nutrition/day";
import { amountText } from "@/lib/nutrition/display";
import { makeEntry } from "@/lib/nutrition/entry-math";
import type { Food, MealSlot } from "@/lib/nutrition/diary-types";
import { matchFoods, parseSpokenFood } from "@/lib/nutrition/voice-food";
import { startDictation, type Dictation } from "@/lib/speech";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: readonly Food[];
  recents: readonly RecentFood[];
  day: string;
  meals: readonly MealSlot[];
  mealId: string | null;
  now: Date;
  /** Eaten at this time instead of now (an inbox capture). */
  eatenAt?: Date | null;
  onSearch: (text: string) => void;
  onPick: (food: Food) => void;
  onLogged: (text: string) => void;
}

export function VoiceLogSheet(props: Props) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Form {...props} />}</DialogContent>
    </Dialog>
  );
}

type Setters = {
  setText: (t: string) => void;
  setSkip: (s: Set<number>) => void;
  setListening: (on: boolean) => void;
  setError: (e: string | null) => void;
};

async function begin(ref: { current: Dictation | null }, s: Setters): Promise<void> {
  ref.current = await startDictation(
    {
      onText: (t) => {
        s.setText(t);
        s.setSkip(new Set());
      },
      onEnd: () => {
        s.setListening(false);
        ref.current = null;
      },
      onError: s.setError,
    },
    { once: true },
  );
}

function Form({ foods, recents, day, meals, mealId, now, eatenAt, onSearch, onPick, onLogged, onOpenChange }: Props) {
  const [text, setText] = useState("");
  // The sheet starts listening as soon as it opens.
  const [listening, setListening] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const picked = meals.find((m) => m.id === mealId) ?? defaultMealFor(meals, eatenAt ?? now) ?? meals[0] ?? null;
  const [meal, setMeal] = useState<Pick<MealSlot, "id" | "name"> | null>(picked);
  const dictation = useRef<Dictation | null>(null);

  const listen = () => {
    setError(null);
    setListening(true);
    void begin(dictation, { setText, setSkip, setListening, setError });
  };
  useEffect(() => {
    const ref = dictation;
    void begin(ref, { setText, setSkip, setListening, setError });
    return () => ref.current?.stop();
  }, []);

  const matches = useMemo(() => matchFoods(parseSpokenFood(text), foods, recents), [text, foods, recents]);
  const ready = matches.flatMap((m, i) => (m.food && m.amount && !skip.has(i) ? [{ food: m.food, amount: m.amount }] : []));

  const log = async () => {
    if (!meal || ready.length === 0) return;
    setBusy(true);
    try {
      const at = eatenAt ?? new Date();
      const entries = ready.map(({ food, amount }) =>
        makeEntry({ food, quantity: amount.quantity, unit: amount.unit, foodDay: day, meal, now: at, id: crypto.randomUUID() }),
      );
      await addEntries(day, entries);
      onLogged(`Logged ${entries.length} ${entries.length === 1 ? "food" : "foods"} to ${meal.name}`);
      onOpenChange(false);
    } catch {
      setError("Couldn't log these. Try again.");
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setSkip((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Say what you ate</DialogTitle>
        <DialogDescription>For example: two eggs and 200 grams of rice. Fix the words below if needed.</DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-2">
        <textarea
          aria-label="What you ate"
          className="border-input bg-background min-h-16 flex-1 rounded-xl border px-3 py-2 text-base"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSkip(new Set());
          }}
        />
        <Button
          type="button"
          size="icon"
          variant={listening ? "default" : "outline"}
          aria-label={listening ? "Stop listening" : "Listen again"}
          onClick={() => (listening ? dictation.current?.stop() : listen())}
        >
          {listening ? <Square className="size-4" /> : <Mic className="size-5" />}
        </Button>
      </div>
      {error && (
        <p role="status" className="text-muted-foreground text-sm">
          {error}
        </p>
      )}
      {matches.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Heard foods">
          {matches.map((m, i) => (
            <li key={`${i}-${m.item.name}`} className="flex items-center gap-2 rounded-xl px-1 py-1">
              {m.food && m.amount ? (
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="checkbox" className="size-4" checked={!skip.has(i)} onChange={() => toggle(i)} />
                  <span className="min-w-0 flex-1 truncate">
                    {amountText(m.amount.quantity, m.amount.unit)} {m.food.name}
                  </span>
                </label>
              ) : m.food ? (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    {m.food.name} <span className="text-muted-foreground text-xs">({m.item.measure ? `${m.item.quantity} ${m.item.measure}` : "amount?"})</span>
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => onPick(m.food as Food)}>
                    Choose amount
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">&ldquo;{m.item.name}&rdquo; not on this phone</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => onSearch(m.item.name)}>
                    <Search className="size-4" /> Search
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {text.trim() !== "" && matches.length === 0 && !listening && <p className="text-muted-foreground text-sm">Couldn&apos;t pick out a food. Try &ldquo;2 eggs and a banana&rdquo;.</p>}
      <MealChips meals={meals} value={meal?.id ?? ""} onChange={setMeal} />
      <Button type="button" disabled={busy || !meal || ready.length === 0} onClick={() => void log()}>
        {ready.length > 0 ? `Log ${ready.length} ${ready.length === 1 ? "food" : "foods"}` : "Log"}
      </Button>
    </>
  );
}
