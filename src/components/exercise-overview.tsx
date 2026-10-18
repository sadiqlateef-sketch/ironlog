"use client";

import { useMemo, useState } from "react";
import { Mountain, Pencil, Target, Trash2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { countdown, GoalBar, goalLine, useBodyweight } from "@/components/progress/goal-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortDate } from "@/lib/chart-scale";
import { bestSets, daysToStatSets, findPlateaus, goalStatus, LIFT_LABELS, liftFor, sessionBests, strengthLevel } from "@/lib/insights";
import { localDay } from "@/lib/body";
import { kgToLb, toKg } from "@/lib/units";
import type { Exercise, ExercisePrefs } from "@/lib/workout-api";
import { parseNumber, roundHalf, type HistoryDay } from "@/lib/workout-logic";
import type { PhysicalStats } from "@/types/database";
import { cn } from "@/lib/utils";

type GoalPatch = Pick<ExercisePrefs, "goal_weight_kg" | "goal_date" | "goal_start_kg">;

/** Exercise detail's first tab: your goal, strength level, plateau check and best sets. */
export function OverviewTab({
  exercise,
  history,
  prefs,
  editingGoal,
  setEditingGoal,
  onSaveGoal,
}: {
  exercise: Exercise;
  history: HistoryDay[] | null;
  prefs: ExercisePrefs | null;
  editingGoal: boolean;
  setEditingGoal: (on: boolean) => void;
  onSaveGoal: (patch: GoalPatch) => void;
}) {
  const { unit, profile } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const conv = (kg: number) => (unit === "imperial" ? kgToLb(kg) : kg);
  const show = (kg: number) => roundHalf(conv(kg)).toLocaleString("en-US");
  const bw = useBodyweight();
  const lift = liftFor(exercise.slug);
  const sex = ((profile?.physical_stats ?? {}) as PhysicalStats).sex;

  const { bests, records, plateau } = useMemo(() => {
    const days = history ?? [];
    const sets = daysToStatSets(days, exercise.id);
    return {
      bests: sessionBests(sets, exercise.id), // kg
      records: bestSets(days),
      plateau: findPlateaus(sets, { unit: u })[0] ?? null,
    };
  }, [history, exercise.id, u]);

  if (!history) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const goalKg = prefs?.goal_weight_kg != null ? Number(prefs.goal_weight_kg) : null;
  const st = goalKg ? goalStatus(goalKg, bests, { start: prefs?.goal_start_kg != null ? Number(prefs.goal_start_kg) : null, due: prefs?.goal_date }) : null;
  // goalStatus works in kg here; convert the per-week numbers for the text.
  const stShown = st && {
    ...st,
    current: conv(st.current),
    remaining: conv(st.remaining),
    neededPerWeek: st.neededPerWeek != null ? conv(st.neededPerWeek) : null,
    pacePerWeek: st.pacePerWeek != null ? conv(st.pacePerWeek) : null,
  };
  const left = st && st.state !== "reached" ? countdown(st.daysLeft) : null;
  const level = lift && bw && records.e1rm ? strengthLevel(lift, records.e1rm.value, bw.kg, sex) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Goal */}
      <section className="glass flex flex-col gap-2 rounded-2xl p-3" aria-label="Goal">
        <div className="flex items-center gap-2">
          <Target className="text-success size-4 shrink-0" aria-hidden />
          <h3 className="flex-1 text-sm font-semibold">1RM goal</h3>
          {left && <span className={cn("text-xs font-semibold", st!.state === "overdue" ? "text-set-failure" : "text-muted-foreground")}>{left}</span>}
          {goalKg && !editingGoal && (
            <Button variant="ghost" size="icon" className="size-8" aria-label="Edit goal" onClick={() => setEditingGoal(true)}>
              <Pencil className="size-4" />
            </Button>
          )}
        </div>
        {editingGoal ? (
          <GoalForm
            u={u}
            initialWeight={goalKg ? String(roundHalf(conv(goalKg))) : ""}
            initialDate={prefs?.goal_date ?? ""}
            onCancel={() => setEditingGoal(false)}
            onClear={
              goalKg
                ? () => {
                    onSaveGoal({ goal_weight_kg: null, goal_date: null, goal_start_kg: null });
                    setEditingGoal(false);
                  }
                : undefined
            }
            onSave={(weight, date) => {
              const kg = toKg(weight, unit);
              const current = bests.reduce((m, b) => Math.max(m, b.e1rm), 0);
              // A new target starts the progress bar from where you are now.
              const start = goalKg && Math.abs(goalKg - kg) < 0.01 && prefs?.goal_start_kg != null ? Number(prefs.goal_start_kg) : current;
              onSaveGoal({ goal_weight_kg: kg, goal_date: date || null, goal_start_kg: start });
              setEditingGoal(false);
            }}
          />
        ) : stShown && goalKg ? (
          <>
            <GoalBar status={stShown} goal={conv(goalKg)} u={u} />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {prefs?.goal_date && st!.state !== "reached" && `By ${new Date(prefs.goal_date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. `}
              {goalLine(stShown, u)}
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">Pick a target estimated 1RM and a date. You&apos;ll get a countdown and the pace you need.</p>
            <Button variant="secondary" onClick={() => setEditingGoal(true)}>
              Set a goal
            </Button>
          </>
        )}
      </section>

      {/* Strength level */}
      {level && lift && (
        <section className="glass flex flex-col gap-1 rounded-2xl p-3" aria-label="Strength level">
          <div className="flex items-baseline gap-2">
            <h3 className="flex-1 text-sm font-semibold">{LIFT_LABELS[lift]} for your bodyweight</h3>
            <span className="text-lg font-bold tabular-nums">{level.ratio.toFixed(2)}×</span>
          </div>
          <p className="text-muted-foreground text-xs">
            {level.level ? (
              <>
                <span className="text-foreground font-semibold">{level.level}</span>
                {level.next && ` · ${show(level.next.ratio * bw!.kg - records.e1rm!.value)} ${u} more for ${level.next.level}`}
              </>
            ) : (
              "Add your sex in Settings to see a strength level."
            )}
          </p>
        </section>
      )}

      {/* Plateau */}
      {plateau && (
        <section className="border-set-warmup/40 flex flex-col gap-1 rounded-2xl border p-3" aria-label="Plateau">
          <h3 className="text-set-warmup flex items-center gap-2 text-sm font-semibold">
            <Mountain className="size-4" aria-hidden /> {plateau.stalled} workouts without a new best: {plateau.fix.title.toLowerCase()}
          </h3>
          <p className="text-muted-foreground text-xs leading-relaxed">{plateau.fix.detail}</p>
        </section>
      )}

      {/* Best sets */}
      {records.e1rm ? (
        <section aria-label="Best sets">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Personal records</h3>
          <dl className="grid grid-cols-2 gap-2">
            <Record label="Best est. 1RM" value={`${show(records.e1rm.value)} ${u}`} detail={`${show(records.e1rm.weight)} × ${records.e1rm.reps} · ${shortDate(records.e1rm.date)}`} />
            {records.heaviest && <Record label="Heaviest set" value={`${show(records.heaviest.weight)} ${u}`} detail={`× ${records.heaviest.reps} · ${shortDate(records.heaviest.date)}`} />}
            {records.mostReps && <Record label="Most reps" value={`${records.mostReps.reps} reps`} detail={`at ${show(records.mostReps.weight)} ${u} · ${shortDate(records.mostReps.date)}`} />}
            {records.volume && <Record label="Best workout volume" value={`${Math.round(conv(records.volume.value)).toLocaleString("en-US")} ${u}`} detail={shortDate(records.volume.date)} />}
          </dl>
          {records.repMaxes.length > 0 && (
            <table className="mt-3 w-full text-sm tabular-nums">
              <caption className="text-muted-foreground mb-1 text-left text-xs">Heaviest weight for at least this many reps</caption>
              <tbody>
                {records.repMaxes.map((r) => (
                  <tr key={r.reps} className="border-t">
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {r.reps} {r.reps === 1 ? "rep" : "reps"}
                    </th>
                    <td className="py-1.5 text-right font-bold">
                      {show(r.weight)} {u}
                    </td>
                    <td className="text-muted-foreground w-20 py-1.5 text-right text-xs">{shortDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">Log this lift and your records show up here.</p>
      )}
    </div>
  );
}

function Record({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="glass min-w-0 rounded-2xl p-3">
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      <dd className="text-muted-foreground truncate text-xs">{detail}</dd>
    </div>
  );
}

function GoalForm({
  u,
  initialWeight,
  initialDate,
  onSave,
  onCancel,
  onClear,
}: {
  u: string;
  initialWeight: string;
  initialDate: string;
  onSave: (weight: number, date: string) => void;
  onCancel: () => void;
  onClear?: () => void;
}) {
  const [weight, setWeight] = useState(initialWeight);
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const w = parseNumber(weight);
        if (!w || w <= 0) return setError(`Enter a goal in ${u}.`);
        if (date && date < localDay(new Date())) return setError("Pick a date from today on.");
        onSave(w, date);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Goal 1RM ({u})</span>
          <Input autoFocus inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label={`Goal in ${u}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">By (optional)</span>
          <Input type="date" value={date} min={localDay(new Date())} onChange={(e) => setDate(e.target.value)} aria-label="Goal date" />
        </label>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Save goal
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        {onClear && (
          <Button type="button" variant="secondary" size="icon" aria-label="Remove goal" onClick={onClear}>
            <Trash2 />
          </Button>
        )}
      </div>
    </form>
  );
}
