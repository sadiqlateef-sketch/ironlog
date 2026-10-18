"use client";

// Import a whole history file: JEFIT's export first of all, or Strong, Hevy,
// FitNotes, or any spreadsheet. Read it on the phone, show what was found and
// how each exercise will be matched, then save it as finished workouts.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, FileUp, Loader2, Plus, Search, Undo2, X } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createImportedExercise, existingHistory, saveHistory } from "@/lib/history-api";
import { exerciseNames, guessExerciseDetails, matchForImport, readHistoryFile, toSessionToSave, type FileHistory, type SessionToSave } from "@/lib/history-import";
import { cn } from "@/lib/utils";
import { listExercises, type Exercise } from "@/lib/workout-api";
import type { EquipmentType, MuscleGroup } from "@/types/database";

type Choice = { kind: "match"; id: string; sure: boolean } | { kind: "new" } | { kind: "skip" };

const APP_NAMES: Record<FileHistory["app"], string> = { jefit: "JEFIT", strong: "Strong", hevy: "Hevy", spreadsheet: "your spreadsheet" };
const MAP_KEY = "ironlog.import-map";

/** Your earlier choices ("Bench Press (Barbell)" is my Bench Press), so the next import asks less. */
function rememberedMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function remember(map: Record<string, string>) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify({ ...rememberedMap(), ...map }));
  } catch {
    // Private mode or storage full: next time just asks again.
  }
}

const monthYear = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });

export function HistoryImport({ onBack }: { onBack?: () => void }) {
  const [file, setFile] = useState<{ name: string; history: FileHistory } | null>(null);
  const [done, setDone] = useState<{ saved: number; created: number } | null>(null);

  if (done) return <Done saved={done.saved} created={done.created} onAnother={() => { setDone(null); setFile(null); }} />;
  if (file) return <Review fileName={file.name} history={file.history} onBack={() => setFile(null)} onDone={setDone} />;
  return <PickFile onBack={onBack} onRead={(name, history) => setFile({ name, history })} />;
}

// ---------- Step 1: pick the file ----------

function PickFile({ onRead, onBack }: { onRead: (name: string, h: FileHistory) => void; onBack?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      if (f.size > 50_000_000) throw new Error("That file is over 50 MB, which is bigger than any workout export. Check it's the right file.");
      const text = await f.text();
      onRead(f.name, readHistoryFile(text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
            <ArrowLeft />
          </Button>
        )}
        <h1 className="text-2xl font-bold">Import your history</h1>
      </header>
      <p className="text-muted-foreground text-sm">
        Pick the export file from JEFIT (or Strong, Hevy, FitNotes, or a spreadsheet saved as CSV). You&apos;ll see what was found and how each exercise
        matches before anything is saved, and importing the same file twice won&apos;t double up.
      </p>
      <Button size="lg" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
        {busy ? "Reading the file…" : "Choose export file"}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          read(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Card className="gap-2 p-4 text-sm">
        <p className="font-semibold">Getting your file out of JEFIT</p>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
          <li>
            Sign in at{" "}
            <a className="text-foreground underline" href="https://www.jefit.com/login" target="_blank" rel="noreferrer">
              jefit.com
            </a>{" "}
            on your phone&apos;s browser or a computer.
          </li>
          <li>Open Settings and look for Export (or Export workout data / backup).</li>
          <li>Download the CSV file (JEFIT may email it to you instead).</li>
          <li>Come back here and choose that file. On a phone it&apos;s usually in Downloads.</li>
        </ol>
      </Card>
    </div>
  );
}

// ---------- Step 2: check what was found, then import ----------

function Review({
  fileName,
  history,
  onBack,
  onDone,
}: {
  fileName: string;
  history: FileHistory;
  onBack: () => void;
  onDone: (r: { saved: number; created: number }) => void;
}) {
  const { unit, session } = useAuth();
  const [fileUnit, setFileUnit] = useState<"lb" | "kg">(history.unit ?? (unit === "imperial" ? "lb" : "kg"));
  const [library, setLibrary] = useState<Exercise[] | null>(null);
  const [existing, setExisting] = useState<{ keys: Set<string>; loggedDays: Set<string> } | null>(null);
  const [choices, setChoices] = useState<Map<string, Choice>>(new Map());
  const [skipLoggedDays, setSkipLoggedDays] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; step: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => exerciseNames(history), [history]);

  useEffect(() => {
    Promise.all([listExercises(), existingHistory()])
      .then(([lib, ex]) => {
        setLibrary(lib);
        setExisting(ex);
        const byId = new Map(lib.map((e) => [e.id, e]));
        const saved = rememberedMap();
        const next = new Map<string, Choice>();
        for (const { name } of names) {
          const k = name.toLowerCase();
          const remembered = saved[k] && byId.get(saved[k]);
          if (remembered) {
            next.set(k, { kind: "match", id: remembered.id, sure: true });
            continue;
          }
          const best = matchForImport(name, lib);
          next.set(k, best ? { kind: "match", id: best.exercise.id, sure: best.sure } : { kind: "new" });
        }
        setChoices(next);
      })
      .catch((e) => setError((e as Error).message));
  }, [names]);

  const byId = useMemo(() => new Map((library ?? []).map((e) => [e.id, e])), [library]);
  const ready = library != null && existing != null;

  const plan = useMemo(() => {
    if (!existing) return null;
    let already = 0;
    let loggedDay = 0;
    const sessions = history.sessions.filter((s) => {
      if (existing.keys.has(s.key)) {
        already++;
        return false;
      }
      if (existing.loggedDays.has(s.date)) {
        loggedDay++;
        if (skipLoggedDays) return false;
      }
      return true;
    });
    return { sessions, already, loggedDay };
  }, [existing, history.sessions, skipLoggedDays]);

  const counts = useMemo(() => {
    let matched = 0;
    let created = 0;
    let skipped = 0;
    let check = 0;
    for (const c of choices.values()) {
      if (c.kind === "match") {
        matched++;
        if (!c.sure) check++;
      } else if (c.kind === "new") created++;
      else skipped++;
    }
    return { matched, created, skipped, check };
  }, [choices]);

  const first = history.sessions[0];
  const last = history.sessions[history.sessions.length - 1];
  const totalSets = history.sessions.reduce((n, s) => n + s.exercises.reduce((m, x) => m + x.sets.length, 0), 0);
  const example = first.exercises.flatMap((x) => x.sets.filter((s) => s.weight).slice(0, 1).map((s) => `${x.name}: ${s.weight} × ${s.reps}`))[0];
  const setChoice = (name: string, c: Choice) => setChoices((m) => new Map(m).set(name.toLowerCase(), c));

  async function runImport() {
    if (!plan || !session) return;
    setError(null);
    try {
      // 1. Add the exercises Ironlog doesn't have.
      const ids = new Map<string, string>();
      const toCreate = names.filter((n) => choices.get(n.name.toLowerCase())?.kind === "new");
      let created = 0;
      for (const n of toCreate) {
        setProgress({ done: created, total: toCreate.length, step: "Adding exercises" });
        const g = guessExerciseDetails(n.name);
        const e = await createImportedExercise(session.user.id, {
          name: n.name,
          primary_muscle: g.primary_muscle as MuscleGroup,
          equipment: g.equipment as EquipmentType,
          mechanic: g.mechanic,
          tracking: n.timed ? "time" : "weight_reps",
        });
        ids.set(n.name.toLowerCase(), e.id);
        created++;
      }
      const map: Record<string, string> = {};
      for (const [k, c] of choices) {
        if (c.kind === "match") {
          ids.set(k, c.id);
          map[k] = c.id;
        }
      }
      for (const [k, id] of ids) map[k] = id;
      remember(map);

      // 2. Save the workouts.
      const appName = APP_NAMES[history.app];
      const sessions = plan.sessions
        .map((s) => toSessionToSave(s, ids, fileUnit, history.app === "spreadsheet" ? "Imported workout" : `${appName} workout`))
        .filter((s): s is SessionToSave => s != null);
      setProgress({ done: 0, total: sessions.length, step: "Saving workouts" });
      const saved = await saveHistory(sessions, (done) => setProgress({ done, total: sessions.length, step: "Saving workouts" }));
      onDone({ saved, created });
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  if (progress) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center" role="status">
        <Loader2 className="text-muted-foreground size-10 animate-spin" />
        <p className="text-lg font-semibold">{progress.step}…</p>
        <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
          <div className="bg-foreground h-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
        </p>
        <p className="text-muted-foreground text-xs">Keep the app open until this finishes. If it stops, run it again: anything already saved is skipped.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Check your import</h1>
          <p className="text-muted-foreground truncate text-xs">{fileName}</p>
        </div>
      </header>

      <Card className="gap-1 p-4">
        <p className="text-sm font-semibold">From {APP_NAMES[history.app]}</p>
        <p className="text-3xl font-bold tabular-nums">{history.sessions.length.toLocaleString()} workouts</p>
        <p className="text-muted-foreground text-sm">
          {monthYear(first.date)}
          {last.date !== first.date && ` to ${monthYear(last.date)}`} · {totalSets.toLocaleString()} sets · {names.length} exercises
        </p>
        {history.skippedRows > 0 && (
          <p className="text-muted-foreground text-xs">{history.skippedRows.toLocaleString()} rows had no date or no sets and were left out.</p>
        )}
      </Card>

      {history.unit == null && (
        <Card className="gap-2 p-4">
          <p className="text-sm font-semibold">Weights in this file are in</p>
          <div className="bg-secondary grid grid-cols-2 gap-1 rounded-xl p-1" role="radiogroup" aria-label="Weight unit in the file">
            {(["lb", "kg"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={fileUnit === u}
                onClick={() => setFileUnit(u)}
                className={cn("h-10 rounded-lg text-sm font-semibold", fileUnit === u ? "bg-foreground text-background" : "text-muted-foreground")}
              >
                {u === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}
              </button>
            ))}
          </div>
          {example && <p className="text-muted-foreground text-xs">For example, your first workout has {example}. Pick the unit you used in {APP_NAMES[history.app]}.</p>}
        </Card>
      )}

      {plan && (plan.already > 0 || plan.loggedDay > 0) && (
        <Card className="gap-2 p-4 text-sm">
          {plan.already > 0 && (
            <p>
              <Check className="text-success mr-1 inline size-4" aria-hidden />
              {plan.already.toLocaleString()} {plan.already === 1 ? "workout is" : "workouts are"} already imported and will be skipped.
            </p>
          )}
          {plan.loggedDay > 0 && (
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-5" checked={skipLoggedDays} onChange={(e) => setSkipLoggedDays(e.target.checked)} />
              <span>
                Skip {plan.loggedDay.toLocaleString()} {plan.loggedDay === 1 ? "day" : "days"} you already logged in Ironlog
                <span className="text-muted-foreground block text-xs">So a workout you logged in both apps isn&apos;t counted twice.</span>
              </span>
            </label>
          )}
        </Card>
      )}

      <section className="flex flex-col gap-2" aria-label="Exercises">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Exercises</h2>
          <p className="text-muted-foreground text-xs">
            {counts.matched} matched · {counts.created} new{counts.skipped ? ` · ${counts.skipped} left out` : ""}
          </p>
        </div>
        {counts.check > 0 && (
          <p className="text-set-warmup flex items-center gap-1 text-xs">
            <AlertTriangle className="size-3.5" aria-hidden /> Check the {counts.check} marked in yellow: the names are close but not the same.
          </p>
        )}
        {!ready && !error && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Matching exercises…
          </p>
        )}
        {ready && (
          <ul className="flex flex-col gap-2">
            {names.map((n) => {
              const c = choices.get(n.name.toLowerCase()) ?? { kind: "new" };
              const target = c.kind === "match" ? byId.get(c.id) : undefined;
              return (
                <li key={n.name}>
                  <Card className={cn("flex-row items-center gap-3 p-3", c.kind === "match" && !c.sure && "ring-set-warmup/60 ring-2", c.kind === "skip" && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{n.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {n.sets.toLocaleString()} sets ·{" "}
                        {c.kind === "match" ? (
                          <>→ {target?.name ?? "exercise"}</>
                        ) : c.kind === "new" ? (
                          <span className="text-foreground">New exercise</span>
                        ) : (
                          "Left out"
                        )}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setMenu(n.name)} aria-label={`Change ${n.name}`}>
                      Change
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={runImport} disabled={!ready || !plan || plan.sessions.length === 0}>
          <Check />
          {plan && plan.sessions.length === 0 ? "Nothing new to import" : `Import ${plan?.sessions.length.toLocaleString() ?? ""} workouts`}
        </Button>
      </div>

      <ExercisePicker
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        title={picking ? `Match "${picking}"` : "Choose exercise"}
        onPick={(e) => {
          if (picking) setChoice(picking, { kind: "match", id: e.id, sure: true });
          setLibrary((l) => (l && !l.some((x) => x.id === e.id) ? [...l, e] : l));
        }}
      />
      <ActionSheet
        open={menu !== null}
        onOpenChange={(o) => !o && setMenu(null)}
        title={menu ?? ""}
        description="What should this exercise be in Ironlog?"
        actions={
          menu
            ? [
                { label: "Pick from the library", icon: Search, onSelect: () => setPicking(menu) },
                ...(choices.get(menu.toLowerCase())?.kind !== "new" ? [{ label: "Add it as a new exercise", icon: Plus, onSelect: () => setChoice(menu, { kind: "new" }) }] : []),
                choices.get(menu.toLowerCase())?.kind === "skip"
                  ? { label: "Include it again", icon: Undo2, onSelect: () => setChoice(menu, { kind: "new" }) }
                  : { label: "Leave it out", icon: X, destructive: true, onSelect: () => setChoice(menu, { kind: "skip" }) },
              ]
            : []
        }
      />
    </div>
  );
}

// ---------- Step 3: done ----------

function Done({ saved, created, onAnother }: { saved: number; created: number; onAnother: () => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center">
      <div className="bg-success/15 text-success grid size-16 place-items-center rounded-full">
        <Check className="size-8" />
      </div>
      <h1 className="text-2xl font-bold">
        {saved.toLocaleString()} {saved === 1 ? "workout" : "workouts"} imported
      </h1>
      <p className="text-muted-foreground text-sm">
        {created > 0 && `${created} new ${created === 1 ? "exercise was" : "exercises were"} added to your library. `}
        Your history, records, charts and recovery include them now.
      </p>
      <div className="grid w-full grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onAnother}>
          Import another file
        </Button>
        <Button onClick={() => router.push("/progress/")}>See progress</Button>
      </div>
    </div>
  );
}
