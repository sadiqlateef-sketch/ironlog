"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, Home, Minus, Plus, Trash2, Warehouse, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useKits } from "@/hooks/use-kits";
import { defaultHomeKit, dumbbellWeights, KIT_EQUIPMENT, maxBarbellKg, type Kit, type KitWeight } from "@/lib/kit";
import { EQUIPMENT_LABEL } from "@/lib/plan-options";
import { ALL_PLATES } from "@/lib/plates";
import { formatWeight, toKg, type UnitSystem } from "@/lib/units";
import { listExercises, type Exercise } from "@/lib/workout-api";
import { parseNumber } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

/**
 * Your equipment: one kit per place you train (your gym, your home set).
 * Plans, swaps, the plate calculator and home workouts only use what's in a kit.
 * `kitId` opens straight into that kit.
 */
export function EquipmentSheet({ open, onOpenChange, kitId }: { open: boolean; onOpenChange: (open: boolean) => void; kitId?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">{open && <Kits initial={kitId} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function Kits({ initial, onDone }: { initial?: string; onDone: () => void }) {
  const { kits, active } = useKits();
  const { unit } = useAuth();
  const [editing, setEditing] = useState<Kit | null>(() => kits.find((k) => k.id === initial) ?? null);
  const hasHome = kits.some((k) => k.kind === "home");

  if (editing) return <KitForm kit={editing} onBack={() => (initial ? onDone() : setEditing(null))} />;

  const newGym = (): Kit => ({ ...kits.find((k) => k.kind === "gym")!, id: `gym-${Date.now().toString(36)}`, name: "Another gym", missing: [] });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Your equipment</DialogTitle>
        <DialogDescription>What each place you train has. Plans, swaps, the plate calculator and home workouts only use what&apos;s there.</DialogDescription>
      </DialogHeader>
      <ul className="-mx-2 flex flex-col">
        {kits.map((k) => (
          <li key={k.id}>
            <button type="button" onClick={() => setEditing(k)} className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left">
              {k.kind === "home" ? <Home className="text-muted-foreground size-5 shrink-0" /> : <Warehouse className="text-muted-foreground size-5 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {k.name}
                  {k.id === active.id && <span className="bg-primary/15 text-primary-text rounded-full px-2 py-0.5 text-xs">In use</span>}
                </span>
                <span className="text-muted-foreground block truncate text-sm">{summary(k, unit)}</span>
              </span>
              <ChevronRight className="text-muted-foreground size-5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setEditing(newGym())}>
          <Plus /> Add a gym
        </Button>
        {!hasHome && (
          <Button variant="secondary" onClick={() => setEditing(defaultHomeKit(`home-${Date.now().toString(36)}`))}>
            <Home /> Add home kit
          </Button>
        )}
      </div>
    </>
  );
}

function summary(k: Kit, unit: UnitSystem): string {
  const dbs = dumbbellWeights(k);
  const max = maxBarbellKg(k);
  const bits = k.equipment.map((e) => {
    if (e === "dumbbell" && dbs) return dbs.length ? `Dumbbells ${dbs.map((d) => formatWeight(d, unit)).join(", ")}` : "Dumbbells";
    if (e === "barbell" && max != null) return `Bar up to ${formatWeight(max, unit)}`;
    return EQUIPMENT_LABEL[e] ?? e;
  });
  return bits.join(" · ") || "Bodyweight only";
}

const toUnit = (kg: number, unit: UnitSystem) => Math.round((unit === "imperial" ? kg * 2.2046226218 : kg) * 4) / 4;
const kgOf = (v: number, unit: UnitSystem) => Math.round(toKg(v, unit) * 1000) / 1000;

function KitForm({ kit, onBack }: { kit: Kit; onBack: () => void }) {
  const { unit } = useAuth();
  const { kits, active, saveKit, removeKit, switchKit } = useKits();
  const u = unit === "imperial" ? "lb" : "kg";
  const [draft, setDraft] = useState<Kit>(kit);
  const [bar, setBar] = useState(kit.bar_kg != null ? String(toUnit(kit.bar_kg, unit)) : "");
  const [counted, setCounted] = useState(kit.plates.some((p) => p.count != null) || kit.kind === "home");
  const [newDb, setNewDb] = useState("");
  const [names, setNames] = useState<Map<string, Exercise>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = kits.some((k) => k.id === kit.id);
  const gyms = kits.filter((k) => k.kind === "gym").length;

  useEffect(() => {
    if (kit.missing.length) listExercises().then((xs) => setNames(new Map(xs.map((x) => [x.id, x])))).catch(() => {});
  }, [kit.missing.length]);

  const patch = (p: Partial<Kit>) => setDraft((d) => ({ ...d, ...p }));
  const plateCount = (size: number) => draft.plates.find((p) => toUnit(p.kg, unit) === size);
  const setPlate = (size: number, count: number | null | undefined) => {
    const rest = draft.plates.filter((p) => toUnit(p.kg, unit) !== size);
    patch({ plates: count === undefined || count === 0 ? rest : [...rest, { kg: kgOf(size, unit), count }].sort((a, b) => b.kg - a.kg) });
  };
  const setDb = (kg: number, count: number) => {
    const rest = (draft.dumbbells ?? []).filter((d) => d.kg !== kg);
    patch({ dumbbells: count <= 0 ? rest : [...rest, { kg, count }].sort((a, b) => a.kg - b.kg) });
  };

  async function save(andUse = false) {
    const b = parseNumber(bar);
    if (draft.equipment.includes("barbell") && b == null) return setError(`Enter the bar's weight in ${u}.`);
    if (!draft.name.trim()) return setError("Give this place a name.");
    setBusy(true);
    setError(null);
    try {
      const plates: KitWeight[] = draft.plates.map((p) => ({ kg: p.kg, count: counted ? (p.count ?? 2) : null }));
      const next = { ...draft, name: draft.name.trim().slice(0, 40), bar_kg: b != null ? kgOf(b, unit) : null, plates };
      await saveKit(next);
      if (andUse) await switchKit(next.id);
      onBack();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{saved ? draft.name : draft.kind === "home" ? "Your home kit" : "New gym"}</DialogTitle>
        <DialogDescription>Tick what&apos;s here. Anything else is left out of plans, swaps and the plate calculator.</DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={40} />
      </label>

      <Field label="Equipment">
        <div className="flex flex-wrap gap-2">
          {KIT_EQUIPMENT.map((x) => {
            const on = draft.equipment.includes(x);
            return (
              <Chip key={x} on={on} onClick={() => patch({ equipment: on ? draft.equipment.filter((e) => e !== x) : [...draft.equipment, x] })}>
                {EQUIPMENT_LABEL[x] ?? x}
              </Chip>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip on={draft.bench} onClick={() => patch({ bench: !draft.bench })}>Bench</Chip>
          <Chip on={draft.rack} onClick={() => patch({ rack: !draft.rack })}>Squat rack</Chip>
          <Chip on={draft.pullup_bar} onClick={() => patch({ pullup_bar: !draft.pullup_bar })}>Pull-up / dip bar</Chip>
        </div>
      </Field>

      {draft.equipment.includes("barbell") && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Bar ({u})
            <Input inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value)} placeholder={unit === "imperial" ? "45" : "20"} />
          </label>
          <Field label={`Plates (${u})`}>
            <Switch on={counted} onClick={() => {
                if (!counted) patch({ plates: draft.plates.map((x) => ({ ...x, count: x.count ?? 2 })) });
                setCounted(!counted);
              }} label="Count my plates" detail={counted ? "How many of each you own" : "A gym has plenty of each"} />
            {counted ? (
              <ul className="flex flex-col gap-1">
                {ALL_PLATES[unit].map((p) => (
                  <Stepper key={p} label={`${p} ${u}`} value={plateCount(p)?.count ?? 0} onChange={(n) => setPlate(p, n)} />
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {ALL_PLATES[unit].map((p) => {
                  const on = !!plateCount(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPlate(p, on ? undefined : null)}
                      className={cn("h-12 rounded-xl border num text-base font-bold", on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground")}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </>
      )}

      {draft.equipment.includes("dumbbell") && (
        <Field label="Dumbbells">
          <Switch
            on={draft.dumbbells == null}
            onClick={() => patch({ dumbbells: draft.dumbbells == null ? [] : null })}
            label="Full rack"
            detail={draft.dumbbells == null ? "Pairs of every weight" : "Only the ones listed below"}
          />
          {draft.dumbbells != null && (
            <>
              <ul className="flex flex-col gap-1">
                {draft.dumbbells.map((d) => (
                  <Stepper key={d.kg} label={formatWeight(d.kg, unit)} value={d.count ?? 2} onChange={(n) => setDb(d.kg, n)} />
                ))}
              </ul>
              <div className="flex gap-2">
                <Input inputMode="decimal" value={newDb} onChange={(e) => setNewDb(e.target.value)} placeholder={`Weight (${u})`} aria-label={`New dumbbell weight in ${u}`} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const v = parseNumber(newDb);
                    if (v == null || v <= 0) return;
                    setDb(kgOf(v, unit), 1);
                    setNewDb("");
                  }}
                >
                  <Plus /> Add
                </Button>
              </div>
              {draft.dumbbells.length > 0 && !draft.dumbbells.some((d) => (d.count ?? 2) >= 2) && (
                <p className="text-muted-foreground text-xs">Just one of each weight, so workouts use one-dumbbell and one-arm moves.</p>
              )}
            </>
          )}
        </Field>
      )}

      {draft.missing.length > 0 && (
        <Field label="Not available here">
          <ul className="flex flex-col">
            {draft.missing.map((id) => (
              <li key={id} className="flex items-center gap-2 py-1 text-sm">
                <span className="flex-1 truncate">{names.get(id)?.name ?? "Exercise"}</span>
                <Button variant="ghost" size="icon" aria-label="It's available after all" onClick={() => patch({ missing: draft.missing.filter((m) => m !== id) })}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={() => save()} disabled={busy}>
          <Check /> Save
        </Button>
      </div>
      {active.id !== draft.id && (
        <Button variant="secondary" onClick={() => save(true)} disabled={busy}>
          Save and use here now
        </Button>
      )}
      {saved && !(draft.kind === "gym" && gyms <= 1) && (
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await removeKit(draft.id);
              onBack();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <Trash2 /> Delete {draft.name}
        </Button>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {children}
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "bg-primary text-primary-foreground border-primary font-semibold" : "text-muted-foreground")}
    >
      {children}
    </button>
  );
}

export function Switch({ on, onClick, label, detail }: { on: boolean; onClick: () => void; label: string; detail?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex w-full items-center gap-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {detail && <span className="text-muted-foreground block text-xs">{detail}</span>}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-foreground/20")}>
        <span className={cn("bg-background absolute top-0.5 size-5 rounded-full transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 num font-semibold">{label}</span>
      <Button variant="secondary" size="icon" aria-label={`One fewer ${label}`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0}>
        <Minus />
      </Button>
      <span className="w-8 text-center num text-lg font-bold" aria-label={`${value} of ${label}`}>
        {value}
      </span>
      <Button variant="secondary" size="icon" aria-label={`One more ${label}`} onClick={() => onChange(Math.min(20, value + 1))}>
        <Plus />
      </Button>
    </li>
  );
}
