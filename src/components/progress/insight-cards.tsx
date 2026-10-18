"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, CalendarCheck, Flame, HeartPulse, RefreshCw, Sparkles } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { useAuth } from "@/components/providers/auth-provider";
import type { StatsData } from "@/components/progress/overview";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDate } from "@/lib/chart-scale";
import {
  consistencyGrid,
  dailyStrain,
  maxHrFor,
  monthConsistency,
  strainBand,
  streakStats,
  workoutStrain,
  type HeatCell,
  type WorkoutStrain,
} from "@/lib/insights";
import {
  getWeeklyRecap,
  listEffortSets,
  listHeartRate,
  makeWeeklyRecap,
  recapWeek,
  type WeeklyRecapRow,
} from "@/lib/insights-api";
import { scheduleRecapReminder } from "@/lib/native";
import { dayKey } from "@/lib/stats";
import { kgToLb } from "@/lib/units";
import { listSessionsSince, type WorkoutSession } from "@/lib/workout-api";
import type { PhysicalStats } from "@/types/database";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

// ---------------- Weekly recap ----------------

/**
 * This week's recap from Sunday 6 PM, otherwise last week's. Written once
 * per week (by Claude when it can, by rules otherwise) and kept.
 */
export function RecapCard({ data }: { data: StatsData }) {
  const { unit } = useAuth();
  const week = useMemo(() => recapWeek(data.now), [data.now]);
  const [recap, setRecap] = useState<WeeklyRecapRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trained = data.total > 0;

  async function make() {
    setBusy(true);
    setError(null);
    try {
      setRecap(await makeWeeklyRecap(week.weekStart));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    scheduleRecapReminder();
    let live = true;
    getWeeklyRecap(week.weekStart)
      .then(async (r) => {
        if (!live) return;
        setRecap(r);
        // First visit after it unlocks: write it now.
        if (!r && trained) {
          setBusy(true);
          try {
            const made = await makeWeeklyRecap(week.weekStart);
            if (live) setRecap(made);
          } catch (e) {
            if (live) setError((e as Error).message);
          } finally {
            if (live) setBusy(false);
          }
        }
      })
      .catch((e: Error) => live && (setRecap(null), setError(e.message)));
    return () => {
      live = false;
    };
  }, [week.weekStart, trained]);

  if (!trained) return null;
  const range = `${new Date(week.monday).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(week.monday + 6 * DAY).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const r = recap?.recap;
  const vol = (kg: number) => num(unit === "imperial" ? kgToLb(kg) : kg);
  const u = unit === "imperial" ? "lb" : "kg";

  return (
    <Card className="border-ai/30 border" data-testid="weekly-recap">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-ai size-5" aria-hidden /> Weekly recap
        </CardTitle>
        <CardDescription>
          {range}. A new one every Sunday at 6 PM.
        </CardDescription>
      </CardHeader>
      {recap === undefined || (busy && !r) ? (
        <p className="text-muted-foreground text-sm" role="status">
          {busy ? "Writing your recap…" : "Loading…"}
        </p>
      ) : r ? (
        <>
          <p className="text-lg leading-snug font-bold">{r.headline}</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Tile label="Workouts" value={String(r.numbers.workouts)} />
            <Tile label={`Volume (${u})`} value={vol(r.numbers.volume_kg)} />
            <Tile label="Records" value={String(r.numbers.records)} />
          </dl>
          <RecapList title="Wins" items={r.wins} dot="bg-success" />
          <RecapList title="Watch out" items={r.watch_outs} dot="bg-set-warmup" />
          <RecapList title="Next week" items={r.next_week} dot="bg-primary" />
          <p className="text-muted-foreground text-xs">{recap!.source === "ai" ? "Written by Claude from your logged workouts." : "Made from your logged workouts."}</p>
        </>
      ) : (
        <>
          {error && <p className="text-muted-foreground text-sm">Couldn&apos;t make your recap: {error}</p>}
          <Button variant="secondary" onClick={make} disabled={busy}>
            <RefreshCw className={cn(busy && "animate-spin")} /> {error ? "Try again" : "Make my recap"}
          </Button>
        </>
      )}
    </Card>
  );
}

function RecapList({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-sm leading-relaxed">
            <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-secondary min-w-0 rounded-xl px-2 py-2">
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-muted-foreground truncate text-xs">{sub}</dd>}
    </div>
  );
}

// ---------------- Daily strain ----------------

type StrainData = { workouts: (WorkoutStrain & { session: WorkoutSession })[]; now: number };

/** Strain for each workout in the last 4 weeks, from heart rate, sets and RPE. */
export function useStrain(reloadKey: number) {
  const { profile } = useAuth();
  const maxHr = maxHrFor((profile?.physical_stats ?? {}) as PhysicalStats);
  const [state, setState] = useState<{ key: string; data: StrainData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${reloadKey}|${maxHr}`;

  useEffect(() => {
    const now = Date.now();
    listSessionsSince(new Date(now - 28 * DAY))
      .then(async (sessions) => {
        const ids = sessions.map((s) => s.id);
        const [hr, sets] = await Promise.all([listHeartRate(ids), listEffortSets(ids)]);
        const workouts = sessions.map((s) =>
          Object.assign(
            workoutStrain(
              s,
              hr.filter((h) => h.session_id === s.id).map((h) => ({ t: Date.parse(h.recorded_at), bpm: h.bpm })),
              sets.filter((x) => x.session_id === s.id),
              maxHr,
            ),
            { session: s },
          ),
        );
        setState({ key: `${reloadKey}|${maxHr}`, data: { workouts, now } });
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadKey, maxHr]);

  return { data: state?.key === key ? state.data : null, error, maxHr };
}

export function StrainCard({ reloadKey }: { reloadKey: number }) {
  const { data, error, maxHr } = useStrain(reloadKey);
  const days = useMemo(
    () => (data ? dailyStrain(data.workouts.map((w) => ({ start: Date.parse(w.session.start_time), cardio: w.cardio.load, muscular: w.muscular.load }))) : null),
    [data],
  );

  if (error) return null;
  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Activity className="text-set-failure size-5" aria-hidden /> Daily strain
      </CardTitle>
      <CardDescription>How hard each day was, 0–100, from your heart rate, sets and RPE.</CardDescription>
    </CardHeader>
  );
  if (!data || !days) {
    return (
      <Card className="opacity-60">
        {header}
        <p className="text-muted-foreground text-sm">Loading…</p>
      </Card>
    );
  }

  const today = dayKey(data.now);
  const latestKey = days.has(today) ? today : [...days.keys()].sort().at(-1);
  const latest = latestKey ? days.get(latestKey)! : null;
  const latestWorkouts = data.workouts.filter((w) => dayKey(w.session.start_time) === latestKey);
  const band = latest ? strainBand(latest.score) : null;

  // The last 14 days, rest days as 0.
  const bars = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(data.now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    const k = dayKey(d.getTime());
    const s = days.get(k)?.score ?? 0;
    return { id: k, label: shortDate(d.toISOString()), value: s, display: s ? `${s} · ${strainBand(s).label}` : "Rest day" };
  });
  const avg = (from: number, to: number) => {
    const xs = bars.slice(from, to).map((b) => b.value);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const thisWeek = avg(7, 14);
  const lastWeek = avg(0, 7);
  const change = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  // Put the day's workouts together for the readout.
  const zones = [0, 0, 0, 0, 0];
  let sets = 0;
  const rpes: number[] = [];
  let hrSource: "watch" | "summary" | "time" = "time";
  let avgHr: number | null = null;
  let peak: number | null = null;
  for (const w of latestWorkouts) {
    w.cardio.zones.forEach((z, i) => (zones[i] += z));
    sets += w.muscular.sets;
    if (w.muscular.avgRpe != null) rpes.push(w.muscular.avgRpe);
    if (w.cardio.source !== "time") {
      hrSource = w.cardio.source;
      avgHr = w.cardio.avgHr;
      peak = Math.max(peak ?? 0, w.cardio.peakHr ?? 0) || null;
    }
  }

  return (
    <Card>
      {header}
      {!latest ? (
        <p className="text-muted-foreground text-sm">Finish a workout to see your strain.</p>
      ) : (
        <>
          {/* Monitor-style readout */}
          <div className="bg-background/50 grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border p-4" data-testid="strain-readout">
            <div className="text-center">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{latestKey === today ? "Today" : shortDate(latestWorkouts[0].session.start_time)}</p>
              <p className="text-5xl font-bold tabular-nums">{latest.score}</p>
              <p className="text-sm font-semibold">{band!.label}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <Vital icon={<HeartPulse className="text-set-failure size-3.5" aria-hidden />} label="Avg HR" value={avgHr ? `${avgHr}` : "–"} unit={avgHr ? "bpm" : ""} />
              <Vital label="Peak HR" value={peak ? `${peak}` : "–"} unit={peak ? "bpm" : ""} />
              <Vital label="Working sets" value={String(sets)} />
              <Vital label="Avg RPE" value={rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : "–"} />
            </dl>
          </div>
          <p className="text-muted-foreground text-sm">{band!.note}</p>
          {hrSource === "watch" && <ZoneBar zones={zones} maxHr={maxHr} />}
          {hrSource !== "watch" && (
            <p className="text-muted-foreground text-xs">
              {hrSource === "summary" ? "Only an average heart rate was saved, so the score is rougher." : "No heart rate for this day, so the score estimates it from workout time. Wear the watch for a truer number."}
              {!rpes.length && " Logging RPE on your sets makes it more accurate."}
            </p>
          )}
          <BarChart data={bars} height={150} ariaLabel="Daily strain, last 14 days" />
          {change != null && Math.abs(change) >= 10 && (
            <p className="text-sm">
              This week&apos;s strain is <span className="font-bold">{Math.abs(change)}% {change > 0 ? "higher" : "lower"}</span> than last week.
              {change >= 40 && " Watch your recovery."}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Vital({ icon, label, value, unit }: { icon?: ReactNode; label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground flex items-center gap-1 truncate text-xs">
        {icon}
        {label}
      </dt>
      <dd className="text-lg leading-tight font-bold tabular-nums">
        {value}
        {unit && <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>}
      </dd>
    </div>
  );
}

const ZONE_SHADE = [0.35, 0.5, 0.65, 0.82, 1];

/** Minutes in each heart-rate zone as one bar (darker = harder), with a labelled key. */
function ZoneBar({ zones, maxHr }: { zones: number[]; maxHr: number }) {
  const total = zones.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <section aria-label="Time in heart-rate zones">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {zones.map((z, i) =>
          z > 0 ? <div key={i} style={{ flexGrow: z, background: "var(--set-failure)", opacity: ZONE_SHADE[i] }} /> : null,
        )}
      </div>
      <ul className="text-muted-foreground mt-1.5 grid grid-cols-5 text-center text-[11px] tabular-nums">
        {zones.map((z, i) => (
          <li key={i}>
            <span className="text-foreground font-semibold">Z{i + 1}</span> {Math.round(z)}m
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1 text-xs">Zones are 50–100% of your max heart rate ({maxHr} bpm).</p>
    </section>
  );
}

// ---------------- Streaks and consistency ----------------

const HEAT = ["var(--secondary)", "color-mix(in oklab, var(--chart-1) 38%, transparent)", "color-mix(in oklab, var(--chart-1) 58%, transparent)", "color-mix(in oklab, var(--chart-1) 80%, transparent)", "var(--chart-1)"];

export function ConsistencyCard({ data }: { data: StatsData }) {
  const { profile } = useAuth();
  const target = profile?.training_days_per_week ?? null;
  const st = streakStats(data.sessions, target, data.now);
  const grid = useMemo(() => consistencyGrid(data.sessions, 26, data.now), [data]);
  const months = monthConsistency(data.sessions, target, 6, data.now);
  const [picked, setPicked] = useState<HeatCell | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="text-primary-text size-5" aria-hidden /> Streaks and consistency
        </CardTitle>
        <CardDescription>
          {target ? `Your target is ${target} workouts a week.` : "Set how many days a week you train in Settings to track a target."}
        </CardDescription>
      </CardHeader>
      <dl className="grid grid-cols-2 gap-2">
        <Tile label="Week streak" value={String(st.current)} sub={st.current ? "weeks in a row" : "train this week to start"} />
        <Tile label="Longest streak" value={String(st.longest)} sub="weeks" />
        <Tile label="Weeks on target" value={st.onTarget == null ? "–" : String(st.onTarget)} sub={st.onTarget == null ? "no target set" : "in a row"} />
        <Tile label="Active days" value={String(st.activeDays30)} sub="last 30 days" />
      </dl>

      <section aria-label="Training days, last 26 weeks">
        <div className="flex gap-[3px]" role="grid">
          {grid.map((week, w) => (
            <div key={w} className="flex flex-1 flex-col gap-[3px]" role="row">
              {week.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="gridcell"
                  disabled={c.future}
                  onClick={() => setPicked(c)}
                  aria-label={`${new Date(c.date).toLocaleDateString(undefined, { month: "long", day: "numeric" })}: ${c.workouts ? `${c.workouts} workout${c.workouts > 1 ? "s" : ""}` : "rest"}`}
                  className={cn("aspect-square w-full rounded-[3px]", c.future && "opacity-0", picked?.key === c.key && "ring-foreground ring-1")}
                  style={{ background: HEAT[c.level] }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
          <span aria-live="polite">
            {picked
              ? `${new Date(picked.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${picked.workouts ? `${picked.workouts} workout${picked.workouts > 1 ? "s" : ""}` : "rest day"}`
              : "Tap a square for its day."}
          </span>
          <span className="flex shrink-0 items-center gap-1" aria-hidden>
            Less
            {HEAT.map((h, i) => (
              <span key={i} className="size-2.5 rounded-[2px]" style={{ background: h }} />
            ))}
            More volume
          </span>
        </div>
      </section>

      <section aria-label="Workouts per month">
        <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">By month</h3>
        <ul className="flex flex-col gap-2">
          {months.map((m) => (
            <li key={`${m.year}-${m.month}`} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
              <span>{new Date(m.year, m.month, 1).toLocaleDateString(undefined, { month: "short", year: m.year !== new Date(data.now).getFullYear() ? "2-digit" : undefined })}</span>
              <span className="bg-secondary h-2 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${m.pct ?? Math.min(100, (m.workouts / Math.max(1, ...months.map((x) => x.workouts))) * 100)}%`,
                    background: "var(--chart-1)",
                  }}
                />
              </span>
              <span className="text-right tabular-nums">
                <span className="font-bold">{m.workouts}</span>
                {m.planned != null && <span className="text-muted-foreground"> / {m.planned}</span>}
              </span>
            </li>
          ))}
        </ul>
        {target && (
          <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
            <Flame className="text-set-warmup size-3.5" aria-hidden /> Bars show workouts against your target for each month (so far for this one).
          </p>
        )}
      </section>
    </Card>
  );
}
