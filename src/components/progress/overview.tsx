"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Flame, Lightbulb, RefreshCw, Settings } from "lucide-react";
import { ExerciseDetail } from "@/components/exercise-detail";
import { useAuth } from "@/components/providers/auth-provider";
import { DaySheet } from "@/components/session-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MUSCLE_FILTERS } from "@/lib/labels";
import {
  COMPARISONS,
  comparisonRanges,
  dayKey,
  insights,
  monthGrid,
  muscleBreakdown,
  periodTotals,
  progressIndex,
  thisWeek,
  topE1rms,
  weekStreak,
  type Comparison,
  type StatSession,
  type StatSet,
} from "@/lib/stats";
import { kgToLb } from "@/lib/units";
import { roundHalf } from "@/lib/workout-logic";
import {
  countFinishedSessions,
  listExercises,
  listFinishedSetsSince,
  listSessionsSince,
  type Exercise,
} from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

export interface StatsData {
  sessions: StatSession[];
  sets: StatSet[];
  exercises: Map<string, Exercise>;
  total: number;
  /** When the data was loaded: the "now" every card measures from. */
  now: number;
}

/** Everything the overview needs, loaded once; weights converted to your unit. */
export function useStats(reloadKey: number) {
  const { unit } = useAuth();
  const [raw, setRaw] = useState<{ key: number; data: StatsData } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listSessionsSince(new Date(Date.now() - 400 * DAY)),
      listFinishedSetsSince(new Date(Date.now() - 200 * DAY)),
      listExercises(),
      countFinishedSessions(),
    ])
      .then(([sessions, sets, exercises, total]) =>
        setRaw({ key: reloadKey, data: { sessions, sets, exercises: new Map(exercises.map((e) => [e.id, e])), total, now: Date.now() } }),
      )
      .catch((e: Error) => setError(e.message));
  }, [reloadKey]);

  // Stored in kg; shown in your unit.
  const data = useMemo(() => {
    if (!raw) return null;
    const c = (kg: number) => (unit === "imperial" ? kgToLb(kg) : kg);
    return {
      ...raw.data,
      sessions: raw.data.sessions.map((s) => ({ ...s, volume: c(s.volume) })),
      sets: raw.data.sets.map((s) => ({ ...s, weight: c(s.weight) })),
    };
  }, [raw, unit]);

  return { data, loading: raw?.key !== reloadKey, error };
}

const groupFor = (exercises: Map<string, Exercise>) => (id: string) => {
  const m = exercises.get(id)?.primary_muscle;
  return MUSCLE_FILTERS.find((f) => m && f.muscles.includes(m))?.label;
};

// ---------------- Profile header (#45) ----------------

export function ProfileHeader({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const { profile } = useAuth();
  const name = profile?.display_name || profile?.email?.split("@")[0] || "You";
  return (
    <header className="flex items-center gap-3">
      <div className="from-primary grid size-14 to-[#6a4be0] shrink-0 place-items-center rounded-full bg-gradient-to-br text-2xl font-extrabold text-white">
        {name[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold">{name}</h1>
        <p className="text-muted-foreground truncate text-sm">{profile?.email}</p>
      </div>
      <Button variant="secondary" size="icon" aria-label="Refresh" onClick={onSync} disabled={syncing}>
        <RefreshCw className={cn(syncing && "animate-spin")} />
      </Button>
      <Button asChild variant="secondary" size="icon" aria-label="Settings">
        <Link href="/settings/">
          <Settings />
        </Link>
      </Button>
    </header>
  );
}

// ---------------- This week (#46) ----------------

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">No workouts last week</span>;
  const up = pct >= 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-sm font-bold", up ? "text-success" : "text-set-failure")}>
      {up ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
      {Math.abs(pct)}%<span className="text-muted-foreground ml-1 text-xs font-normal">vs last week</span>
    </span>
  );
}

export function WeekCards({ data }: { data: StatsData }) {
  const { unit } = useAuth();
  const w = thisWeek(data.sessions, data.now);
  const u = unit === "imperial" ? "lb" : "kg";
  return (
    <section className="grid grid-cols-2 gap-3" aria-label="This week">
      <div className="glass flex flex-col gap-1 rounded-2xl p-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Volume this week</p>
        <p className="font-mono text-2xl font-extrabold">
          {compact(w.volume)} <span className="text-muted-foreground text-sm font-normal">{u}</span>
        </p>
        <Change pct={w.volumePct} />
      </div>
      <div className="glass flex flex-col gap-1 rounded-2xl p-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Time this week</p>
        <p className="font-mono text-2xl font-extrabold">
          {w.minutes >= 60 ? `${Math.floor(w.minutes / 60)}h ${w.minutes % 60}m` : `${w.minutes}m`}
        </p>
        <Change pct={w.minutesPct} />
      </div>
    </section>
  );
}

function compact(n: number) {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : Math.round(n).toLocaleString();
}

// ---------------- Calendar + totals (#47, #48) ----------------

export function CalendarCard({ data, onChanged }: { data: StatsData; onChanged?: () => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date(data.now);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [open, setOpen] = useState<Date | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, StatSession[]>();
    for (const s of data.sessions) m.set(dayKey(s.start_time), [...(m.get(dayKey(s.start_time)) ?? []), s]);
    return m;
  }, [data.sessions]);
  const today = dayKey(data.now);
  const grid = monthGrid(month.y, month.m);
  const label = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const inMonth = data.sessions.filter((s) => {
    const d = new Date(s.start_time);
    return d.getFullYear() === month.y && d.getMonth() === month.m;
  }).length;
  const streak = weekStreak(data.sessions, data.now);
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <h2 className="font-bold">{label}</h2>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Workouts in ${label}`}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-muted-foreground text-xs font-semibold" aria-hidden>
            {d}
          </span>
        ))}
        {grid.flat().map((d, i) => {
          if (!d) return <span key={i} />;
          const k = dayKey(d.getTime());
          const ss = byDay.get(k);
          const isToday = k === today;
          return (
            <button
              key={i}
              type="button"
              disabled={k > today}
              onClick={() => setOpen(d)}
              aria-label={`${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${ss ? `: ${ss.length} workout${ss.length > 1 ? "s" : ""}` : ""}`}
              className={cn(
                "mx-auto grid size-9 place-items-center rounded-full font-mono text-sm",
                ss ? "bg-primary text-primary-foreground font-bold" : "text-foreground/85 hover:bg-accent",
                k > today && "text-muted-foreground",
                isToday && "ring-primary-text ring-2",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-center text-xs">Tap a day to see, fix or delete its workout.</p>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-secondary rounded-xl px-2 py-2">
          <dt className="text-muted-foreground text-xs">This month</dt>
          <dd className="font-mono text-xl font-extrabold">{inMonth}</dd>
        </div>
        <div className="bg-secondary rounded-xl px-2 py-2">
          <dt className="text-muted-foreground text-xs">All sessions</dt>
          <dd className="font-mono text-xl font-extrabold">{data.total}</dd>
        </div>
        <div className="bg-secondary rounded-xl px-2 py-2">
          <dt className="text-muted-foreground text-xs">Week streak</dt>
          <dd className="flex items-center justify-center gap-1 font-mono text-xl font-extrabold">
            <Flame className={cn("size-5", streak ? "text-set-warmup fill-set-warmup/30" : "text-muted-foreground")} />
            {streak}
          </dd>
        </div>
      </dl>
      <DaySheet day={open} onOpenChange={(o) => !o && setOpen(null)} onChanged={onChanged} />
    </Card>
  );
}

// ---------------- Progress Index (#51) ----------------

export function ProgressIndexCard({ data }: { data: StatsData }) {
  const series = progressIndex(data.sets, 12, data.now);
  const now = series.at(-1)?.value;
  const W = 280, H = 60;
  const lo = Math.min(100, ...series.map((p) => p.value));
  const hi = Math.max(lo + 1, ...series.map((p) => p.value));
  const path = series
    .map((p, i) => `${i ? "L" : "M"}${(i / Math.max(1, series.length - 1)) * W},${H - ((p.value - lo) / (hi - lo)) * H}`)
    .join(" ");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress Index</CardTitle>
        <CardDescription>Your lifts&apos; estimated 1RMs against where they were 12 weeks ago. 100 = no change.</CardDescription>
      </CardHeader>
      {now == null ? (
        <p className="text-muted-foreground text-sm">Log the same lift in 3 different weeks to get your index.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div>
            <p className="font-mono text-4xl font-extrabold" data-testid="progress-index">
              {now.toFixed(1)}
            </p>
            <p className={cn("text-sm font-semibold", now >= 100 ? "text-success" : "text-set-failure")}>
              {now >= 100 ? `${(now - 100).toFixed(1)}% stronger` : `${(100 - now).toFixed(1)}% down`}
            </p>
          </div>
          <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="h-16 flex-1" preserveAspectRatio="none" aria-hidden>
            <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}
    </Card>
  );
}

// ---------------- Muscle breakdown (#49) ----------------

const GROUP_COLORS: Record<string, string> = {
  Chest: "var(--chart-1)",
  Back: "var(--ai)",
  Shoulders: "var(--set-drop)",
  Arms: "var(--set-warmup)",
  Legs: "var(--success)",
  Core: "var(--set-failure)",
};

export function MuscleBreakdownCard({ data }: { data: StatsData }) {
  const since = data.now - 28 * DAY;
  const ids = new Set(data.sessions.filter((s) => Date.parse(s.start_time) >= since).map((s) => s.id));
  const rows = muscleBreakdown(data.sets.filter((s) => ids.has(s.session_id)), groupFor(data.exercises));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle breakdown</CardTitle>
        <CardDescription>Share of your working sets, last 4 weeks.</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sets in the last 4 weeks.</p>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>
            {rows.map((r) => (
              <div key={r.group} style={{ width: `${r.pct}%`, background: GROUP_COLORS[r.group] }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.group} className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ background: GROUP_COLORS[r.group] }} aria-hidden />
                <span className="flex-1">{r.group}</span>
                <span className="font-mono font-bold">{r.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ---------------- Top 1RMs (#50) ----------------

export function TopLiftsCard({ data }: { data: StatsData }) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [open, setOpen] = useState<Exercise | null>(null);
  const since = data.now - 91 * DAY;
  const top = topE1rms(data.sets.filter((s) => s.completed_at && Date.parse(s.completed_at) >= since), 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 1RMs</CardTitle>
        <CardDescription>Best estimated one-rep max per lift, last 3 months.</CardDescription>
      </CardHeader>
      {top.length === 0 ? (
        <p className="text-muted-foreground text-sm">Log some sets to see your best lifts.</p>
      ) : (
        <ol className="flex flex-col">
          {top.map((t, i) => {
            const ex = data.exercises.get(t.exerciseId);
            return (
              <li key={t.exerciseId}>
                <button
                  type="button"
                  onClick={() => ex && setOpen(ex)}
                  className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                >
                  <span className="text-muted-foreground w-4 font-mono text-sm font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{ex?.name ?? "Exercise"}</span>
                    <span className="text-muted-foreground text-xs">
                      {roundHalf(t.weight)} {u} × {t.reps}
                    </span>
                  </span>
                  <span className="text-primary-text font-mono text-xl font-extrabold">
                    {Math.round(t.e1rm)} <span className="text-muted-foreground text-xs font-normal">{u}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <ExerciseDetail exercise={open} tab="chart" onOpenChange={(o) => !o && setOpen(null)} />
    </Card>
  );
}

// ---------------- Insights (#52) ----------------

export function InsightsCard({ data }: { data: StatsData }) {
  const { unit } = useAuth();
  const lines = insights(data.sessions, data.sets, {
    groupOf: groupFor(data.exercises),
    nameOf: (id) => data.exercises.get(id)?.name,
    unit: unit === "imperial" ? "lb" : "kg",
  }, data.now);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="text-set-warmup size-5" /> Insights
        </CardTitle>
        <CardDescription>Patterns from your last 8 weeks of training.</CardDescription>
      </CardHeader>
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">Finish a few more workouts and insights will show up here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l} className="bg-secondary rounded-xl px-3 py-2 text-sm leading-relaxed">
              {l}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------- Compare with… (#53) ----------------

export function CompareCard({ data }: { data: StatsData }) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [kind, setKind] = useState<Comparison>("month");
  const [cf, ct, pf, pt] = comparisonRanges(kind, data.now);
  const cur = periodTotals(data.sessions, data.sets, cf, ct);
  const prev = periodTotals(data.sessions, data.sets, pf, pt);
  const rows: [string, number, number, (n: number) => string][] = [
    ["Workouts", cur.workouts, prev.workouts, String],
    ["Working sets", cur.sets, prev.sets, String],
    [`Volume (${u})`, cur.volume, prev.volume, compact],
    ["Training time", cur.minutes, prev.minutes, (n) => `${Math.floor(n / 60)}h ${n % 60}m`],
    ["Avg workout", cur.avgMinutes, prev.avgMinutes, (n) => `${n} min`],
  ];
  const labels = COMPARISONS.find((c) => c.key === kind)!.label.split(" vs ");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare with…</CardTitle>
      </CardHeader>
      <select
        aria-label="Periods to compare"
        className="border-input bg-secondary h-11 w-full rounded-xl border px-3 text-base"
        value={kind}
        onChange={(e) => setKind(e.target.value as Comparison)}
      >
        {COMPARISONS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="text-left font-semibold" />
            <th className="text-right font-semibold capitalize">{labels[0]}</th>
            <th className="text-right font-semibold capitalize">{labels[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, f]) => (
            <tr key={label} className="border-t">
              <td className="py-2">{label}</td>
              <td className={cn("py-2 text-right font-mono font-bold", a > b ? "text-success" : a < b && "text-set-failure")}>{f(a)}</td>
              <td className="text-muted-foreground py-2 text-right font-mono">{f(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
