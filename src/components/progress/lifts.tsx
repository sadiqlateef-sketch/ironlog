"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Mountain, Plus, Scale, Target, Trophy } from "lucide-react";
import { ExerciseDetail, type Tab } from "@/components/exercise-detail";
import { ExercisePicker } from "@/components/exercise-picker";
import { useAuth } from "@/components/providers/auth-provider";
import type { StatsData } from "@/components/progress/overview";
import { countdown, GoalBar, goalLine, useBodyweight } from "@/components/progress/goal-bits";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  findPlateaus,
  goalStatus,
  LEVELS,
  LIFT_LABELS,
  liftFor,
  sessionBests,
  strengthLevel,
  type Lift,
} from "@/lib/insights";
import { listGoals, type Goal } from "@/lib/insights-api";
import { kgToLb } from "@/lib/units";
import type { Exercise } from "@/lib/workout-api";
import type { PhysicalStats } from "@/types/database";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** Goals, strength levels and plateaus: everything about your lifts. */
export function LiftsTab({ data, reloadKey }: { data: StatsData; reloadKey: number }) {
  const [open, setOpen] = useState<{ exercise: Exercise; tab: Tab } | null>(null);
  const [goalsKey, setGoalsKey] = useState(0);
  const show = (id: string, tab: Tab = "overview") => {
    const ex = data.exercises.get(id);
    if (ex) setOpen({ exercise: ex, tab });
  };
  return (
    <>
      <GoalsCard data={data} reloadKey={reloadKey + goalsKey} onOpen={show} onPick={(ex) => setOpen({ exercise: ex, tab: "overview" })} />
      <StrengthCard data={data} onOpen={show} />
      <PlateauCard data={data} onOpen={show} />
      <ExerciseDetail
        exercise={open?.exercise ?? null}
        tab={open?.tab}
        onOpenChange={(o) => {
          if (o) return;
          setOpen(null);
          setGoalsKey((k) => k + 1); // a goal may have changed
        }}
      />
    </>
  );
}

// ---------------- Goals ----------------

function GoalsCard({
  data,
  reloadKey,
  onOpen,
  onPick,
}: {
  data: StatsData;
  reloadKey: number;
  onOpen: (id: string) => void;
  onPick: (ex: Exercise) => void;
}) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const conv = (kg: number) => (unit === "imperial" ? kgToLb(kg) : kg);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    listGoals().then(setGoals).catch(() => setGoals([]));
  }, [reloadKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="text-success size-5" aria-hidden /> Lift goals
        </CardTitle>
        <CardDescription>Your target estimated 1RM, with a countdown and the pace you need.</CardDescription>
      </CardHeader>
      {goals === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : goals.length === 0 ? (
        <p className="text-muted-foreground text-sm">No goals yet. Pick a lift, then tap Set a goal.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((g) => {
            const bests = sessionBests(data.sets, g.exercise_id);
            const st = goalStatus(conv(Number(g.goal_weight_kg)), bests, {
              start: g.goal_start_kg != null ? conv(Number(g.goal_start_kg)) : null,
              due: g.goal_date,
              now: data.now,
            });
            const left = countdown(st.state === "reached" ? null : st.daysLeft);
            return (
              <li key={g.exercise_id}>
                <button
                  type="button"
                  onClick={() => onOpen(g.exercise_id)}
                  className="bg-secondary hover:bg-accent flex w-full flex-col gap-2 rounded-xl p-3 text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{g.exercises?.name ?? "Exercise"}</span>
                    {left && <span className={cn("shrink-0 text-xs font-semibold", st.state === "overdue" ? "text-set-failure" : "text-muted-foreground")}>{left}</span>}
                  </span>
                  <GoalBar status={st} goal={conv(Number(g.goal_weight_kg))} u={u} />
                  <span className="text-muted-foreground text-xs leading-relaxed">{goalLine(st, u)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" onClick={() => setPicking(true)}>
        <Plus /> Add a goal
      </Button>
      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(ex) => {
          setPicking(false);
          onPick(ex);
        }}
      />
    </Card>
  );
}

// ---------------- Relative strength ----------------

function StrengthCard({ data, onOpen }: { data: StatsData; onOpen: (id: string, tab?: Tab) => void }) {
  const { unit, profile } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const sex = ((profile?.physical_stats ?? {}) as PhysicalStats).sex;
  const bw = useBodyweight();
  const bwShown = bw ? (unit === "imperial" ? kgToLb(bw.kg) : bw.kg) : null;

  // Best e1RM in the last 6 months for each standard lift you've done.
  const rows = useMemo(() => {
    const best = new Map<Lift, { id: string; e1rm: number }>();
    const since = data.now - 182 * DAY;
    for (const s of data.sets) {
      if (s.set_type === "warmup" || !s.completed_at || Date.parse(s.completed_at) < since) continue;
      const ex = data.exercises.get(s.exercise_id);
      const lift = ex && liftFor(ex.slug);
      if (!lift) continue;
      const e = s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30);
      if (s.weight > 0 && s.reps > 0 && e > (best.get(lift)?.e1rm ?? 0)) best.set(lift, { id: s.exercise_id, e1rm: e });
    }
    return (Object.keys(LIFT_LABELS) as Lift[]).filter((l) => best.has(l)).map((l) => ({ lift: l, ...best.get(l)! }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="text-primary-text size-5" aria-hidden /> Relative strength
        </CardTitle>
        <CardDescription>
          Your best estimated 1RM divided by your bodyweight
          {bwShown ? ` (${Math.round(bwShown * 10) / 10} ${u}${bw?.on ? `, logged ${new Date(bw.on + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""})` : ""}.
        </CardDescription>
      </CardHeader>
      {bw === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !bwShown ? (
        <p className="text-muted-foreground text-sm">
          Log your weight on the Body tab (or turn on Health Connect) to see how strong you are for your size.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Log a squat, bench, deadlift, overhead press or barbell row to see your levels.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const lv = strengthLevel(r.lift, r.e1rm, bwShown, sex);
            return (
              <li key={r.lift}>
                <button type="button" onClick={() => onOpen(r.id, "chart")} className="hover:bg-accent -mx-2 flex w-[calc(100%+1rem)] flex-col gap-1.5 rounded-xl px-2 py-1.5 text-left">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 font-semibold">{LIFT_LABELS[r.lift]}</span>
                    <span className="text-xl font-bold tabular-nums">{lv.ratio.toFixed(2)}×</span>
                  </span>
                  {lv.index != null ? (
                    <>
                      <LevelMeter index={lv.index} toNext={lv.toNext ?? 0} />
                      <span className="text-muted-foreground text-xs">
                        <span className="text-foreground font-semibold">{lv.level}</span>
                        {lv.next ? ` · ${num(lv.next.ratio * bwShown - r.e1rm)} ${u} more for ${lv.next.level} (${lv.next.ratio}×)` : " · top level"}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">Est. 1RM {num(r.e1rm)} {u}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {bwShown && sex !== "male" && sex !== "female" && rows.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Levels use separate standards for men and women.{" "}
          <Link href="/settings/#about" className="text-primary-text underline">
            Add your sex in Settings
          </Link>{" "}
          to see them.
        </p>
      )}
      <p className="text-muted-foreground text-xs">Levels are rounded from common strength standards. They&apos;re a guide, not a test.</p>
    </Card>
  );
}

/** Five segments, Beginner to Elite; filled up to your level, the next one part-filled. */
function LevelMeter({ index, toNext }: { index: number; toNext: number }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {LEVELS.map((l, i) => (
        <span key={l} className="bg-background/40 h-2 flex-1 overflow-hidden rounded-full">
          <span
            className="bg-primary block h-full rounded-full"
            style={{ width: i <= index ? "100%" : i === index + 1 ? `${toNext}%` : "0%", opacity: i <= index ? 1 : 0.55 }}
          />
        </span>
      ))}
    </span>
  );
}

// ---------------- Plateaus ----------------

function PlateauCard({ data, onOpen }: { data: StatsData; onOpen: (id: string, tab?: Tab) => void }) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const list = useMemo(() => findPlateaus(data.sets, { unit: u, now: data.now }), [data, u]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mountain className="text-set-warmup size-5" aria-hidden /> Plateau watch
        </CardTitle>
        <CardDescription>Lifts that haven&apos;t hit a new best in 3 or more workouts, and what to try.</CardDescription>
      </CardHeader>
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-sm">
          <Trophy className="text-success size-4 shrink-0" aria-hidden />
          No stalled lifts. Everything you train often is still moving.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.slice(0, 5).map((p) => (
            <li key={p.exerciseId}>
              <button type="button" onClick={() => onOpen(p.exerciseId, "chart")} className="bg-secondary hover:bg-accent flex w-full flex-col gap-1 rounded-xl p-3 text-left">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{data.exercises.get(p.exerciseId)?.name ?? "Exercise"}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {p.stalled} workouts · best {num(p.best)} {u}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </span>
                <span className="text-set-warmup text-sm font-semibold">{p.fix.title}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">{p.fix.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
