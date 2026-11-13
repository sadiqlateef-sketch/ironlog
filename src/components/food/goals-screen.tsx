"use client";

// Food goals: energy and macros, per-weekday changes, training-day extra,
// bulk/cut phase per program, limits, protein per meal and calorie banking.
// Everything is the user's own setting; nothing here is advice.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { useActiveProgram } from "@/components/up-next";
import { useNutritionGoals } from "@/hooks/use-nutrition-goals";
import {
  macroGrams,
  normalizeGoals,
  percentProblem,
  STARTER_BASE,
  type BaseGoal,
  type MacroMode,
  type NutritionGoals,
  type PhaseMode,
  type Supplement,
  MAX_SUPPLEMENTS,
} from "@/lib/nutrition/goals";

type Draft = Record<string, string>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const parse = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function toDraft(g: NutritionGoals): Draft {
  const d: Draft = {
    mode: g.base?.mode ?? "percent",
    energy: str(g.base?.energy),
    protein: str(g.base?.protein),
    carbs: str(g.base?.carbs),
    fat: str(g.base?.fat),
    trEnergy: str(g.training?.energyDelta),
    trCarbs: str(g.training?.carbsDelta),
    trProtein: str(g.training?.proteinDelta),
    bulkPct: g.phase.bulkPct ? str(g.phase.bulkPct) : "",
    cutPct: g.phase.cutPct ? str(g.phase.cutPct) : "",
    deloadAsMaintain: g.phase.deloadAsMaintain ? "1" : "",
    fiber: str(g.micros.fiber),
    sugarsMax: str(g.micros.sugarsMax),
    sodiumMax: str(g.micros.sodiumMax),
    caffeineMax: str(g.micros.caffeineMax),
    water: str(g.micros.water),
    proteinPerMeal: str(g.proteinPerMeal),
    bankingOn: g.banking.on ? "1" : "",
    maxBoostPct: str(g.banking.maxBoostPct),
    countDrinks: g.hydration.countDrinks ? "1" : "",
    halfLifeH: str(g.caffeine.halfLifeH),
    sleepAt: g.caffeine.sleepAt,
    thresholdMg: str(g.caffeine.thresholdMg),
  };
  for (let i = 0; i < 7; i++) d[`wd${i}`] = str(g.weekdays[i]?.energy);
  return d;
}

export function fromDraft(prev: NutritionGoals, d: Draft, phase: { programId: string | null; mode: PhaseMode | "" }): NutritionGoals {
  const energy = parse(d.energy);
  const base: BaseGoal | null =
    energy === undefined
      ? null
      : {
          energy,
          mode: (d.mode as MacroMode) ?? "percent",
          protein: parse(d.protein) ?? 0,
          carbs: parse(d.carbs) ?? 0,
          fat: parse(d.fat) ?? 0,
        };
  const weekdays: NutritionGoals["weekdays"] = {};
  for (let i = 0; i < 7; i++) {
    const e = parse(d[`wd${i}`]);
    if (e !== undefined) weekdays[i] = { energy: e };
  }
  const tr = [parse(d.trEnergy), parse(d.trCarbs), parse(d.trProtein)];
  const byProgram = { ...prev.phase.byProgram };
  if (phase.programId) {
    if (phase.mode) byProgram[phase.programId] = phase.mode;
    else delete byProgram[phase.programId];
  }
  return normalizeGoals({
    ...prev,
    base,
    weekdays,
    training: tr.some((x) => x !== undefined) ? { energyDelta: tr[0] ?? 0, carbsDelta: tr[1] ?? 0, proteinDelta: tr[2] ?? 0 } : null,
    phase: { byProgram, bulkPct: parse(d.bulkPct) ?? 0, cutPct: parse(d.cutPct) ?? 0, deloadAsMaintain: d.deloadAsMaintain === "1" },
    micros: {
      fiber: parse(d.fiber),
      sugarsMax: parse(d.sugarsMax),
      sodiumMax: parse(d.sodiumMax),
      caffeineMax: parse(d.caffeineMax),
      water: parse(d.water),
    },
    proteinPerMeal: parse(d.proteinPerMeal) ?? null,
    banking: { on: d.bankingOn === "1", maxBoostPct: parse(d.maxBoostPct) ?? prev.banking.maxBoostPct },
    hydration: { countDrinks: d.countDrinks === "1" },
    caffeine: { halfLifeH: parse(d.halfLifeH) ?? prev.caffeine.halfLifeH, sleepAt: d.sleepAt || prev.caffeine.sleepAt, thresholdMg: parse(d.thresholdMg) ?? null },
  });
}

function Field({
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      <span>
        {label}
        {unit ? <span className="text-muted-foreground font-normal"> ({unit})</span> : null}
      </span>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-10" />
      {hint && <span className="text-muted-foreground font-normal">{hint}</span>}
    </label>
  );
}

function Section({ title, children, note, id }: { title: string; children: ReactNode; note?: string; id?: string }) {
  return (
    <Card className="scroll-mt-4 gap-3 p-4" id={id}>
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-muted-foreground -mt-2 text-xs">{note}</p>}
      {children}
    </Card>
  );
}

export function GoalsScreen() {
  const { goals, loading, save } = useNutritionGoals();
  const progress = useActiveProgram();
  // Null until the first edit: the saved goals are shown as they are.
  const [edits, setDraft] = useState<Draft | null>(null);
  const [phaseMode, setPhaseMode] = useState<PhaseMode | "" | null>(null);
  const [starter, setStarter] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Null until changed: the saved list is shown.
  const [suppEdits, setSupps] = useState<Supplement[] | null>(null);

  if (loading) return <SkeletonList rows={4} />;
  const draft = edits ?? toDraft(goals);

  const set = (k: string) => (v: string) => {
    setNote(null);
    setDraft((d) => ({ ...(d ?? toDraft(goals)), [k]: v }));
  };
  const programId = progress?.program_id ?? null;
  const shownPhase = phaseMode ?? (programId ? (goals.phase.byProgram[programId] ?? "") : "");
  const supps = suppEdits ?? goals.supplements;
  const next = fromDraft({ ...goals, supplements: supps }, draft, { programId, mode: shownPhase });
  const editSupp = (i: number, patch: Partial<Supplement>) => {
    setNote(null);
    setSupps(supps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  const pctSum = next.base ? percentProblem(next.base) : null;
  const grams = next.base ? macroGrams(next.base) : null;

  const applyStarter = () => {
    setStarter(true);
    setDraft((d) => ({
      ...(d ?? toDraft(goals)),
      mode: STARTER_BASE.mode,
      energy: str(STARTER_BASE.energy),
      protein: str(STARTER_BASE.protein),
      carbs: str(STARTER_BASE.carbs),
      fat: str(STARTER_BASE.fat),
    }));
  };

  const onSave = async () => {
    setBusy(true);
    try {
      const saved = await save(next);
      setDraft(toDraft(saved));
      setPhaseMode(null);
      setSupps(null);
      setNote("Saved.");
    } catch {
      setNote("Couldn't save. Sign in and try again.");
    } finally {
      setBusy(false);
    }
  };

  const unitWord = draft.mode === "percent" ? "% of kcal" : "g";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href="/food/">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Goals</h1>
      </header>

      <NutritionSyncChip />

      <Section title="Daily goal">
        {!next.base && !starter && (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">No goal set. The diary just shows totals until you set one.</p>
            <Button type="button" variant="secondary" className="self-start" onClick={applyStarter}>
              Set a goal
            </Button>
          </div>
        )}
        {(next.base || starter) && (
          <>
            {starter && <p className="text-muted-foreground text-xs">A starting point. Change it to yours.</p>}
            <div className="flex gap-2" role="radiogroup" aria-label="Macros as">
              {(["percent", "grams"] as const).map((m) => (
                <Button key={m} type="button" size="sm" variant={draft.mode === m ? "default" : "outline"} onClick={() => set("mode")(m)} role="radio" aria-checked={draft.mode === m}>
                  {m === "percent" ? "Percent" : "Grams"}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Energy" unit="kcal" value={draft.energy} onChange={set("energy")} />
              <Field label="Protein" unit={unitWord} value={draft.protein} onChange={set("protein")} />
              <Field label="Carbs" unit={unitWord} value={draft.carbs} onChange={set("carbs")} />
              <Field label="Fat" unit={unitWord} value={draft.fat} onChange={set("fat")} />
            </div>
            {pctSum !== null && <p className="text-destructive text-xs">Percentages add to {pctSum} %, not 100 %.</p>}
            {grams && draft.mode === "percent" && (
              <p className="text-muted-foreground text-xs tabular-nums">
                = protein {grams.protein} g · carbs {grams.carbs} g · fat {grams.fat} g (4/4/9 kcal per g)
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => {
                setStarter(false);
                setDraft((d) => ({ ...(d ?? toDraft(goals)), energy: "", protein: "", carbs: "", fat: "" }));
              }}
            >
              Clear goal
            </Button>
          </>
        )}
      </Section>

      {next.base && (
        <>
          <Section title="Different energy on some days" note="Leave blank to use the daily goal.">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WEEKDAYS.map((w, i) => (
                <Field key={w} label={w} value={draft[`wd${i}`]} onChange={set(`wd${i}`)} />
              ))}
            </div>
          </Section>

          <Section title="Training days" note="Added on days you log a workout or mark as training. Leave blank for none.">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Energy +" unit="kcal" value={draft.trEnergy} onChange={set("trEnergy")} />
              <Field label="Carbs +" unit="g" value={draft.trCarbs} onChange={set("trCarbs")} />
              <Field label="Protein +" unit="g" value={draft.trProtein} onChange={set("trProtein")} />
            </div>
          </Section>

          <Section title="Phase" note="Applied after the training-day extra. Carbs and fat move with energy; protein stays.">
            {programId ? (
              <label className="flex flex-col gap-1 text-xs font-medium">
                {progress?.program_name ?? "Active program"}
                <select
                  className="border-input bg-secondary h-10 rounded-xl border px-2 text-sm font-normal"
                  value={shownPhase}
                  onChange={(e) => setPhaseMode(e.target.value as PhaseMode | "")}
                >
                  <option value="">No phase</option>
                  <option value="bulk">Bulk</option>
                  <option value="cut">Cut</option>
                  <option value="maintain">Maintain</option>
                </select>
              </label>
            ) : (
              <p className="text-muted-foreground text-sm">Start a program to tie a phase to it.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bulk: energy +" unit="%" value={draft.bulkPct} onChange={set("bulkPct")} />
              <Field label="Cut: energy −" unit="%" value={draft.cutPct} onChange={set("cutPct")} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.deloadAsMaintain === "1"} onChange={(e) => set("deloadAsMaintain")(e.target.checked ? "1" : "")} className="size-4" />
              Deload weeks count as maintain
            </label>
          </Section>

          <Section title="Calorie banking" note="Eat under your goal one day and today's goal goes up (over: it goes down), spread over the rest of the week (Mon–Sun).">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.bankingOn === "1"} onChange={(e) => set("bankingOn")(e.target.checked ? "1" : "")} className="size-4" />
              Bank calories across the week
            </label>
            {draft.bankingOn === "1" && (
              <Field label="Most a day can change" unit="% of its goal" value={draft.maxBoostPct} onChange={set("maxBoostPct")} hint="An app setting. Change it to suit you." />
            )}
          </Section>
        </>
      )}

      <Section title="Limits and extras" note="Leave blank for none.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Fiber at least" unit="g" value={draft.fiber} onChange={set("fiber")} />
          <Field label="Sugars at most" unit="g" value={draft.sugarsMax} onChange={set("sugarsMax")} />
          <Field label="Sodium at most" unit="mg" value={draft.sodiumMax} onChange={set("sodiumMax")} />
          <Field label="Caffeine at most" unit="mg" value={draft.caffeineMax} onChange={set("caffeineMax")} />
          <Field label="Water" unit="ml" value={draft.water} onChange={set("water")} />
          <Field label="Protein per meal" unit="g" value={draft.proteinPerMeal} onChange={set("proteinPerMeal")} hint="Counts meals that reach it." />
        </div>
      </Section>

      <Section title="Water" id="water">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={draft.countDrinks === "1"} onChange={(e) => set("countDrinks")(e.target.checked ? "1" : "")} className="size-4" />
          Count drinks logged as food (in ml) toward water
        </label>
      </Section>

      <Section title="Supplements" id="supplements" note="Your own list, checked off on the diary. Times are when a dose is due (leave blank for once a day).">
        {supps.length === 0 && <p className="text-muted-foreground text-sm">None yet.</p>}
        {supps.map((x, i) => (
          <div key={x.id} className="grid grid-cols-[1fr_6rem] gap-2 border-b pb-3 last:border-b-0">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Name
              <Input value={x.name} maxLength={60} onChange={(e) => editSupp(i, { name: e.target.value })} className="h-10" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Dose
              <Input value={x.dose} maxLength={40} onChange={(e) => editSupp(i, { dose: e.target.value })} className="h-10" />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium">
              Times (HH:MM, comma between)
              <Input
                value={x.times.join(", ")}
                onChange={(e) => editSupp(i, { times: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                className="h-10"
                placeholder="08:00, 20:00"
              />
            </label>
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setSupps(supps.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        {supps.length < MAX_SUPPLEMENTS && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => setSupps([...supps, { id: crypto.randomUUID().slice(0, 12), name: "", dose: "", times: [] }])}
          >
            Add a supplement
          </Button>
        )}
      </Section>

      <Section
        title="Caffeine"
        id="caffeine"
        note="Settings for the caffeine estimate and cutoff on the diary. The half-life default is an app setting, not medical advice."
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Half-life" unit="h" value={draft.halfLifeH} onChange={set("halfLifeH")} />
          <label className="flex flex-col gap-1 text-xs font-medium">
            Usual sleep
            <Input type="time" value={draft.sleepAt} onChange={(e) => set("sleepAt")(e.target.value)} className="h-10" />
          </label>
          <Field label="Level at sleep" unit="mg" value={draft.thresholdMg} onChange={set("thresholdMg")} hint="Blank: no cutoff." />
        </div>
        <p className="text-muted-foreground text-xs">After a night shift, sleep counts from 30 min after the shift ends.</p>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void onSave()} disabled={busy || pctSum !== null}>
          Save goals
        </Button>
        {note && <p className="text-sm">{note}</p>}
      </div>
    </div>
  );
}
