"use client";

// Usual meals: save a meal you eat often, or log (or plan) one again.

import { useEffect, useMemo, useState } from "react";
import { LocateFixed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PHONE_ONLY_TEXT } from "@/components/food/recipe-editor-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import { currentPosition } from "@/lib/gym";
import { loadPlaces, savePlace } from "@/lib/nutrition-places";
import { canPlan, listUsuals, logUsual, removeUsual, saveUsual } from "@/lib/offline/nutrition-store";
import type { Stored } from "@/lib/offline/nutrition-collections";
import { showNutrient } from "@/lib/nutrition/display";
import type { DiaryEntry, MealSlot } from "@/lib/nutrition/diary-types";
import { dayTotals } from "@/lib/nutrition/entry-math";
import { normalizeShifts } from "@/lib/shifts";
import { entriesFromUsual, isOnShift, rankUsuals, usualFromMeal, WORK_PLACE, type LatLng, type Usual } from "@/lib/nutrition/usuals";

export type UsualsMode =
  | { kind: "save"; meal: Pick<MealSlot, "id" | "name">; entries: DiaryEntry[] }
  | { kind: "log"; meal: Pick<MealSlot, "id" | "name">; day: string };

interface Props {
  mode: UsualsMode | null;
  onOpenChange: (open: boolean) => void;
  /** `undo` takes back what was just logged. */
  onDone: (message: string) => void;
}

export function UsualsSheet(props: Props) {
  return (
    <Dialog open={props.mode !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {props.mode?.kind === "save" && <Save {...props} mode={props.mode} />}
        {props.mode?.kind === "log" && <Log {...props} mode={props.mode} />}
      </DialogContent>
    </Dialog>
  );
}

function Save({ mode, onOpenChange, onDone }: Props & { mode: Extract<UsualsMode, { kind: "save" }> }) {
  const [name, setName] = useState(mode.meal.name);
  const [place, setPlace] = useState("");
  const [rememberHere, setRememberHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = useMemo(() => [WORK_PLACE, ...loadPlaces().map((p) => p.name)].filter((v, i, a) => a.indexOf(v) === i), []);

  const save = async () => {
    if (name.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      if (rememberHere && place.trim() !== "") {
        try {
          savePlace(place, await currentPosition(60_000));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't find your location.");
          setBusy(false);
          return;
        }
      }
      const saved = await saveUsual(usualFromMeal(mode.entries, name, place, crypto.randomUUID(), mode.meal.id));
      onDone(saved.localOnly ? PHONE_ONLY_TEXT : `Saved ${saved.name} as a usual`);
      onOpenChange(false);
    } catch {
      setError("Couldn't save this. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Save as a usual</DialogTitle>
        <DialogDescription>
          {mode.entries.length} {mode.entries.length === 1 ? "food" : "foods"} from {mode.meal.name}, {showNutrient("energy", dayTotals(mode.entries).energy)} kcal
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Where you eat it
        <Input value={place} maxLength={60} placeholder="Optional, like work or a cafe" onChange={(e) => setPlace(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => setPlace(s)} className="text-muted-foreground h-9 rounded-full border px-3 text-sm font-semibold">
            {s}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">Usuals saved for &quot;work&quot; go first while you&apos;re on shift.</p>
      {place.trim() !== "" && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={rememberHere} onChange={(e) => setRememberHere(e.target.checked)} className="size-4" />
          I&apos;m there now: remember this spot (kept on this phone only)
        </label>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={save} disabled={busy || name.trim() === ""}>
        Save usual
      </Button>
    </>
  );
}

function Log({ mode, onOpenChange, onDone }: Props & { mode: Extract<UsualsMode, { kind: "log" }> }) {
  const { profile } = useAuth();
  const [usuals, setUsuals] = useState<Stored<Usual>[] | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [planOk, setPlanOk] = useState(false);
  const [plan, setPlan] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsuals()
      .then(setUsuals)
      .catch(() => setUsuals([]));
    canPlan()
      .then(setPlanOk)
      .catch(() => {});
  }, []);

  const ranked = useMemo(() => {
    const now = new Date();
    const shifts = normalizeShifts(profile?.work_shifts);
    return rankUsuals(usuals ?? [], { here, places: loadPlaces(), now, onShift: isOnShift(now, shifts) });
  }, [usuals, here, profile?.work_shifts]);

  // Location is read only when you tap, and never leaves the phone.
  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const fix = await currentPosition(60_000);
      setHere({ lat: fix.lat, lng: fix.lng });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't find your location.");
    } finally {
      setLocating(false);
    }
  };

  const log = async (u: Usual) => {
    setBusy(true);
    setError(null);
    try {
      const entries = entriesFromUsual(u, mode.day, mode.meal, new Date(), () => crypto.randomUUID(), plan ? "planned" : "logged");
      await logUsual(u.id, entries);
      onDone(plan ? `Planned ${u.name} for ${mode.meal.name}` : `Logged ${u.name} to ${mode.meal.name}`);
      onOpenChange(false);
    } catch {
      setError("Couldn't log this. Try again.");
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeUsual(id);
      setUsuals((list) => (list ?? []).filter((u) => u.id !== id));
      setConfirmId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Log a usual</DialogTitle>
        <DialogDescription>To {mode.meal.name}</DialogDescription>
      </DialogHeader>
      {usuals !== null && usuals.length === 0 && (
        <p className="text-muted-foreground text-sm">No usuals yet. Log a meal, then use its menu to save it as a usual.</p>
      )}
      {usuals !== null && usuals.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void locate()} disabled={locating}>
              <LocateFixed /> {locating ? "Finding you…" : here ? "Location used" : "Use my location"}
            </Button>
          </div>
          {planOk && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} className="size-4" />
              Plan it: don&apos;t count it until I confirm I ate it
            </label>
          )}
          <ul className="flex flex-col gap-1">
            {ranked.map((u) => (
              <li key={u.id} className="bg-secondary/40 flex items-center gap-2 rounded-xl px-3 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void log(u)} disabled={busy}>
                  <span className="block truncate text-sm font-semibold">{u.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {u.items.length} {u.items.length === 1 ? "food" : "foods"}
                    {u.place ? ` · ${u.place}` : ""}
                    {u.localOnly ? ` · ${PHONE_ONLY_TEXT}` : ""}
                  </span>
                </button>
                {confirmId === u.id ? (
                  <Button type="button" variant="destructive" size="sm" onClick={() => void remove(u.id)} disabled={busy}>
                    Remove
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${u.name}`} onClick={() => setConfirmId(u.id)}>
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </>
  );
}
