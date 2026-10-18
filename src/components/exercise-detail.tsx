"use client";

import { useEffect, useState } from "react";
import { Star, Target } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ExerciseAnimation } from "@/components/exercise-animation";
import { LineChart } from "@/components/charts/line-chart";
import { MuscleFigure } from "@/components/muscle-map";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getExerciseHistory,
  getExercisePrefs,
  saveExercisePrefs,
  type Exercise,
  type ExercisePrefs,
} from "@/lib/workout-api";
import { shortDate } from "@/lib/chart-scale";
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import { kgToLb, toKg } from "@/lib/units";
import {
  CHART_RANGES,
  chartPoints,
  formatClock,
  groupHistory,
  instructionSteps,
  muscleShare,
  parseNumber,
  roundHalf,
  type HistoryDay,
} from "@/lib/workout-logic";
import { cn } from "@/lib/utils";
import { describeTimedSet } from "@/lib/cardio";
import type { MuscleGroup } from "@/types/database";
import { SkeletonList } from "@/components/ui/skeleton";

export type Tab = "history" | "chart" | "guide";

/**
 * Everything about one exercise in a bottom sheet: your history, a progress
 * chart with your goal, and a how-to guide with the muscles it works.
 */
export function ExerciseDetail({
  exercise,
  onOpenChange,
  showChart,
  tab,
}: {
  exercise: Exercise | null;
  onOpenChange: (open: boolean) => void;
  /** Open on the Chart tab instead of History. */
  showChart?: boolean;
  /** Which tab to open on (overrides showChart). */
  tab?: Tab;
}) {
  return (
    <Dialog open={!!exercise} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed so every exercise starts fresh on its own first tab. */}
        {exercise && <Detail key={exercise.id} exercise={exercise} initialTab={tab ?? (showChart ? "chart" : "history")} />}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ exercise, initialTab }: { exercise: Exercise; initialTab: Tab }) {
  const { unit } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [prefs, setPrefs] = useState<ExercisePrefs | null>(null);
  const [history, setHistory] = useState<HistoryDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const u = unit === "imperial" ? "lb" : "kg";
  /** kg -> the user's unit, to the nearest 0.5 (42.5 lb stays 42.5) */
  const show = (kg: number) => roundHalf(unit === "imperial" ? kgToLb(kg) : kg);

  useEffect(() => {
    getExercisePrefs(exercise.id).then(setPrefs).catch(() => setPrefs(null));
    getExerciseHistory(exercise.id)
      .then(({ sets, sessions }) => setHistory(groupHistory(sets, sessions)))
      .catch((e: Error) => {
        setError(e.message);
        setHistory([]);
      });
  }, [exercise.id]);

  const save = async (patch: Parameters<typeof saveExercisePrefs>[1]) => {
    setPrefs((p) => ({ ...(p ?? emptyPrefs(exercise.id)), ...patch }));
    try {
      setPrefs(await saveExercisePrefs(exercise.id, patch));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const favorite = prefs?.favorite ?? false;

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3">
        {exercise.image_urls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={exercise.image_urls[0]} alt="" className="size-16 shrink-0 rounded-full bg-white object-cover" />
        ) : (
          <div className="bg-secondary flex size-16 shrink-0 items-center justify-center rounded-full">
            <MuscleFigure side="front" className="h-12" fill={(m) => (m === exercise.primary_muscle ? "var(--primary)" : undefined)} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-2xl leading-tight font-extrabold">{exercise.name}</DialogTitle>
          <DialogDescription>
            {EQUIPMENT_LABELS[exercise.equipment]} · {exercise.mechanic === "compound" ? "Compound" : "Isolation"}
          </DialogDescription>
          {exercise.aliases.length > 0 && (
            <p className="text-muted-foreground line-clamp-2 text-xs">Also called {exercise.aliases.join(", ")}</p>
          )}
        </div>
      </DialogHeader>

      <div className="flex gap-2">
        <GoalButton goalKg={prefs?.goal_weight_kg ?? null} unit={unit} show={show} onSave={(kg) => save({ goal_weight_kg: kg })} />
        <Button
          variant="secondary"
          className="flex-1"
          aria-pressed={favorite}
          onClick={() => save({ favorite: !favorite })}
        >
          <Star className={cn(favorite && "fill-set-warmup text-set-warmup")} />
          {favorite ? "Favourite" : "Add to favourites"}
        </Button>
      </div>

      <div role="tablist" aria-label="Exercise details" className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1">
        {(["history", "chart", "guide"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "h-9 rounded-lg text-sm font-semibold capitalize",
              tab === t ? "bg-foreground text-background" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {tab === "history" && <HistoryTab history={history} show={show} u={u} />}
      {tab === "chart" && <ChartTab history={history} show={show} u={u} goalKg={prefs?.goal_weight_kg ?? null} />}
      {tab === "guide" && <GuideTab exercise={exercise} />}

      <NotesField key={prefs ? "loaded" : "empty"} initial={prefs?.notes ?? ""} onSave={(notes) => save({ notes: notes || null })} />
    </>
  );
}

function emptyPrefs(exerciseId: string): ExercisePrefs {
  const now = new Date().toISOString();
  return { user_id: "", exercise_id: exerciseId, goal_weight_kg: null, favorite: false, notes: null, created_at: now, updated_at: now };
}

function GoalButton({
  goalKg,
  unit,
  show,
  onSave,
}: {
  goalKg: number | null;
  unit: "metric" | "imperial";
  show: (kg: number) => number;
  onSave: (kg: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const u = unit === "imperial" ? "lb" : "kg";

  if (editing) {
    const commit = () => {
      const v = parseNumber(text);
      onSave(v && v > 0 ? toKg(v, unit) : null);
      setEditing(false);
    };
    return (
      <form
        className="flex flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Input
          autoFocus
          inputMode="decimal"
          aria-label={`Goal weight in ${u}`}
          placeholder={`Goal (${u})`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
      </form>
    );
  }
  return (
    <Button
      variant="secondary"
      className="flex-1"
      onClick={() => {
        setText(goalKg ? String(show(goalKg)) : "");
        setEditing(true);
      }}
    >
      <Target className="text-success" />
      {goalKg ? (
        <>
          Goal <span className="num font-bold">{show(goalKg)}</span> {u}
        </>
      ) : (
        "Set a goal"
      )}
    </Button>
  );
}

function HistoryTab({ history, show, u }: { history: HistoryDay[] | null; show: (kg: number) => number; u: string }) {
  const { unit } = useAuth();
  if (!history) return <SkeletonList rows={3} />;
  if (!history.length) return <p className="text-muted-foreground text-sm">You haven&apos;t logged this yet. Your sets will show up here.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {history.slice(0, 30).map((d) => {
        let working = 0;
        return (
          <li key={d.sessionId} className="glass rounded-2xl p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="truncate font-semibold">
                {d.name ?? "Workout"} <span className="text-muted-foreground text-sm font-normal">· {shortDate(d.date)}</span>
              </p>
              <p className="text-muted-foreground shrink-0 text-xs">
                {d.restSeconds != null && (
                  <>
                    Rest <span className="num">{formatClock(d.restSeconds)}</span> ·{" "}
                  </>
                )}
                1RM <span className="text-foreground num font-bold">{show(d.e1rm)}</span>
              </p>
            </div>
            <ol className="flex flex-col gap-1">
              {d.sets.map((s, i) => {
                const label = s.set_type === "warmup" ? "W" : String(++working);
                const best = i === d.best;
                return (
                  <li key={i} className="flex items-center gap-3 num">
                    <span className={cn("w-5 text-center text-sm font-bold", s.set_type === "warmup" ? "text-set-warmup" : "text-muted-foreground")}>
                      {label}
                    </span>
                    <span className={cn("text-lg font-bold", best && "text-primary-text")}>
                      {describeTimedSet({ ...s, duration_seconds: s.duration_seconds ?? null, distance_m: s.distance_m ?? null }, unit, (kg) => `${show(kg)} ${u}`) ?? `${show(s.weight)} ${u} × ${s.reps}`}
                    </span>
                    {best && <span className="text-primary-text font-sans text-xs font-semibold">Best set</span>}
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ul>
  );
}

function ChartTab({
  history,
  show,
  u,
  goalKg,
}: {
  history: HistoryDay[] | null;
  show: (kg: number) => number;
  u: string;
  goalKg: number | null;
}) {
  const [range, setRange] = useState<(typeof CHART_RANGES)[number]["label"]>("3M");
  const [metric, setMetric] = useState<"e1rm" | "volume">("e1rm");
  if (!history) return <SkeletonList rows={3} />;

  const days = CHART_RANGES.find((r) => r.label === range)!.days;
  const { points, min, max } = chartPoints(history, metric, days);
  const data = points.map((p) => {
    const best = p.day.sets[p.day.best];
    return {
      id: p.day.sessionId,
      date: p.day.date,
      value: show(p.value),
      display: `${show(p.value).toLocaleString()} ${u}`,
      detail: `${best ? `${show(best.weight)} × ${best.reps} · ` : ""}${shortDate(p.day.date)}`,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Time range">
        {CHART_RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            aria-pressed={range === r.label}
            onClick={() => setRange(r.label)}
            className={cn(
              "h-9 min-w-11 shrink-0 rounded-lg px-2 text-sm font-semibold",
              range === r.label ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="bg-secondary grid grid-cols-2 gap-1 rounded-xl p-1" role="group" aria-label="What to chart">
        {(
          [
            ["e1rm", "Est. 1RM"],
            ["volume", "Volume"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
            className={cn("h-9 rounded-lg text-sm font-semibold", metric === m ? "bg-foreground text-background" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {data.length ? (
        <LineChart
          data={data}
          ariaLabel={`${metric === "e1rm" ? "Estimated one rep max" : "Volume"} in ${u}`}
          goal={metric === "e1rm" && goalKg ? { value: show(goalKg), label: "Goal" } : null}
        />
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm">No workouts in this range.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["Min", min],
            ["Max", max],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="glass rounded-2xl p-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{label}</p>
            <p className="num text-2xl font-bold">
              {v == null ? "–" : show(v.value).toLocaleString()} <span className="text-muted-foreground text-sm font-normal">{u}</span>
            </p>
            {v && <p className="text-muted-foreground text-xs">{shortDate(v.date)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GuideTab({ exercise }: { exercise: Exercise }) {
  const shares = muscleShare<MuscleGroup>(exercise.primary_muscle, exercise.secondary_muscles);
  const pct = new Map(shares.map((s) => [s.muscle, s.pct]));
  // Main muscle in solid blue, helpers in a lighter wash.
  const fill = (m: MuscleGroup) => {
    const p = pct.get(m);
    if (!p) return undefined;
    return m === exercise.primary_muscle ? "var(--primary)" : "color-mix(in oklab, var(--primary) 55%, var(--secondary))";
  };
  const steps = instructionSteps(exercise.instructions);

  return (
    <div className="flex flex-col gap-4">
      <ExerciseAnimation exercise={exercise} />
      <section className="glass flex items-center gap-3 rounded-2xl p-3">
        <div className="grid w-32 shrink-0 grid-cols-2">
          <MuscleFigure side="front" fill={fill} className="h-auto w-full" />
          <MuscleFigure side="back" fill={fill} className="h-auto w-full" />
        </div>
        <ul className="flex flex-1 flex-col gap-2" aria-label="Muscles worked">
          {shares.map((s, i) => (
            <li key={s.muscle} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className={cn(i === 0 && "font-semibold")}>{MUSCLE_LABELS[s.muscle]}</span>
                <span className="text-primary-text num font-bold">{s.pct}%</span>
              </div>
              <div className="bg-secondary h-1.5 rounded-full">
                <div className="bg-primary h-full rounded-full" style={{ width: `${s.pct}%`, opacity: i === 0 ? 1 : 0.6 }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      {steps.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">How to do it</h3>
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="bg-secondary text-primary-text flex size-6 shrink-0 items-center justify-center rounded-full num text-xs font-bold">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function NotesField({ initial, onSave }: { initial: string; onSave: (notes: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">My notes</span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== initial && onSave(text.trim())}
        rows={2}
        placeholder="Seat height, grip, cues that help…"
        className="border-input bg-secondary placeholder:text-muted-foreground focus-visible:ring-ring/50 rounded-xl border px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
      />
    </label>
  );
}
