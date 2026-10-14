"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { BodyHeatmap } from "@/components/body-heatmap";
import { PeriodizationCard } from "@/components/periodization-card";
import { OneRmCalculator } from "@/components/one-rm-calculator";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDate } from "@/lib/chart-scale";
import { MUSCLE_LABELS } from "@/lib/labels";
import { computeRecovery, LOOKBACK_HOURS, recoveryLabel, type MuscleRecovery } from "@/lib/recovery";
import { kgToLb, type UnitSystem } from "@/lib/units";
import {
  getE1rmHistory,
  getLoggedExercises,
  getMuscleSets,
  listSessionsSince,
  type E1rmPoint,
  type LoggedExercise,
  type WorkoutSession,
} from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "4w", label: "4 weeks", days: 28 },
  { key: "12w", label: "12 weeks", days: 84 },
  { key: "1y", label: "1 year", days: 365 },
] as const;

const conv = (kg: number, unit: UnitSystem) => (unit === "imperial" ? kgToLb(kg) : kg);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const fmt = (n: number) => Math.round(n).toLocaleString();

export default function ProgressPage() {
  return (
    <AppShell>
      <Progress />
    </AppShell>
  );
}

function Progress() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  // Set once per range change, so the charts' effects see a stable date.
  const [since, setSince] = useState(() => daysAgo(RANGES[1].days));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Progress</h1>
      <PeriodizationCard />
      <RecoveryCard />
      {/* One filter row, scoping every chart below it */}
      <div className="bg-secondary grid grid-cols-3 rounded-xl p-1" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range.key === r.key}
            onClick={() => {
              setRange(r);
              setSince(daysAgo(r.days));
            }}
            className={cn(
              "rounded py-1.5 text-sm font-semibold",
              range.key === r.key ? "bg-foreground text-background font-semibold" : "text-muted-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <VolumeCard since={since} />
      <StrengthCard since={since} />
      <Card>
        <CardHeader>
          <CardTitle>1RM calculator</CardTitle>
          <CardDescription>Estimate your max from any set, plus training percentages.</CardDescription>
        </CardHeader>
        <OneRmCalculator />
      </Card>
    </div>
  );
}

function TableView({ children }: { children: ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground cursor-pointer text-xs">Show as table</summary>
      <div className="mt-2 max-h-64 overflow-y-auto">{children}</div>
    </details>
  );
}

// ---------------- Recovery ----------------

function RecoveryCard() {
  const [data, setData] = useState<MuscleRecovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => setData(computeRecovery(sets)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const fatigued = (data ?? []).filter((m) => m.recovery < 90).sort((a, b) => a.recovery - b.recovery);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle recovery</CardTitle>
        <CardDescription>Estimated from your hard sets over the last 5 days.</CardDescription>
      </CardHeader>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {data && (
        <>
          <BodyHeatmap data={data} />
          {fatigued.length === 0 ? (
            <p className="text-sm">Everything is recovered. Good day to train anything.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {fatigued.slice(0, 5).map((m) => (
                <li key={m.muscle} className="flex items-baseline justify-between gap-2">
                  <span>{MUSCLE_LABELS[m.muscle]}</span>
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-semibold tabular-nums">{m.recovery}%</span> ·{" "}
                    {recoveryLabel(m.recovery)}
                    {m.hoursToReady > 0 && ` · ~${m.hoursToReady} h`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <TableView>
            <table className="w-full tabular-nums">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="text-left font-medium">Muscle</th>
                  <th className="text-right font-medium">Recovered</th>
                  <th className="text-right font-medium">Hard sets</th>
                </tr>
              </thead>
              <tbody>
                {[...data].sort((a, b) => a.recovery - b.recovery).map((m) => (
                  <tr key={m.muscle} className="border-t">
                    <td className="py-1">{MUSCLE_LABELS[m.muscle]}</td>
                    <td className="py-1 text-right">{m.recovery}%</td>
                    <td className="py-1 text-right">{m.sets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
          <p className="text-muted-foreground text-xs">
            A rule-of-thumb estimate, not a medical measurement. Soreness, sleep and food matter too.
          </p>
        </>
      )}
    </Card>
  );
}

// ---------------- Volume ----------------

function VolumeCard({ since }: { since: Date }) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);

  useEffect(() => {
    listSessionsSince(since).then(setSessions).catch(() => setSessions([]));
  }, [since]);

  const total = (sessions ?? []).reduce((n, s) => n + conv(s.volume, unit), 0);
  const bars = (sessions ?? []).map((s) => ({
    id: s.id,
    label: shortDate(s.start_time),
    value: conv(s.volume, unit),
    display: `${fmt(conv(s.volume, unit))} ${u}`,
  }));

  return (
    <Card className={cn(sessions === null && "opacity-60")}>
      <CardHeader>
        <CardTitle>Volume per workout</CardTitle>
        <CardDescription>Weight × reps of every working set, in {u}.</CardDescription>
      </CardHeader>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Workouts" value={String(sessions?.length ?? "–")} />
        <Stat label={`Total ${u}`} value={sessions ? compactNum(total) : "–"} />
        <Stat label={`Avg ${u}`} value={sessions?.length ? compactNum(total / sessions.length) : "–"} />
      </dl>
      {bars.length > 0 ? (
        <>
          <BarChart data={bars} ariaLabel={`Volume per workout in ${u}`} />
          <TableView>
            <table className="w-full tabular-nums">
              <tbody>
                {[...bars].reverse().map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-1">{b.label}</td>
                    <td className="py-1 text-right">{b.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        </>
      ) : (
        sessions && <p className="text-muted-foreground text-sm">No finished workouts in this range yet.</p>
      )}
    </Card>
  );
}

function compactNum(n: number) {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : fmt(n);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

// ---------------- Strength (e1RM) ----------------

function StrengthCard({ since }: { since: Date }) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [exercises, setExercises] = useState<LoggedExercise[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [history, setHistory] = useState<{ key: string; points: E1rmPoint[] } | null>(null);

  useEffect(() => {
    getLoggedExercises().then(setExercises).catch(() => setExercises([]));
  }, []);

  const exerciseId = picked ?? exercises?.[0]?.exercise_id ?? null;
  const key = `${exerciseId}|${since.toISOString()}`;
  const points = history?.key === key ? history.points : null;

  useEffect(() => {
    if (!exerciseId) return;
    getE1rmHistory(exerciseId, since)
      .then((p) => setHistory({ key: `${exerciseId}|${since.toISOString()}`, points: p }))
      .catch(() => setHistory({ key: `${exerciseId}|${since.toISOString()}`, points: [] }));
  }, [exerciseId, since]);

  const line = (points ?? []).map((p) => ({
    id: p.session_id,
    date: p.performed_at,
    value: conv(p.e1rm, unit),
    display: `${fmt(conv(p.e1rm, unit))} ${u}`,
    detail: `${fmt(conv(p.weight, unit))} × ${p.reps} · ${shortDate(p.performed_at)}`,
  }));
  const best = line.reduce((m, p) => Math.max(m, p.value), 0);
  const change = line.length > 1 ? line.at(-1)!.value - line[0].value : 0;

  return (
    <Card className={cn(exerciseId && points === null && "opacity-60")}>
      <CardHeader>
        <CardTitle>Estimated 1RM</CardTitle>
        <CardDescription>Best set of each workout, Epley formula.</CardDescription>
      </CardHeader>
      {exercises && exercises.length === 0 ? (
        <p className="text-muted-foreground text-sm">Finish a workout to start tracking strength.</p>
      ) : (
        <>
          <select
            aria-label="Exercise"
            className="border-input bg-secondary h-11 w-full rounded-xl border px-3 text-base"
            value={exerciseId ?? ""}
            onChange={(e) => setPicked(e.target.value)}
          >
            {(exercises ?? []).map((e) => (
              <option key={e.exercise_id} value={e.exercise_id}>
                {e.name}
              </option>
            ))}
          </select>
          {line.length > 0 && (
            <dl className="grid grid-cols-2 gap-2">
              <Stat label={`Best in range (${u})`} value={fmt(best)} />
              <Stat
                label="Change in range"
                value={line.length > 1 ? `${change >= 0 ? "+" : "−"}${fmt(Math.abs(change))} ${u}` : "–"}
              />
            </dl>
          )}
          {line.length > 0 ? (
            <>
              <LineChart data={line} ariaLabel={`Estimated one rep max in ${u}`} />
              <TableView>
                <table className="w-full tabular-nums">
                  <tbody>
                    {[...line].reverse().map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="py-1">{shortDate(p.date)}</td>
                        <td className="text-muted-foreground py-1">{p.detail.split(" · ")[0]}</td>
                        <td className="py-1 text-right font-semibold">{p.display}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableView>
            </>
          ) : (
            points && <p className="text-muted-foreground text-sm">No sets for this lift in this range.</p>
          )}
        </>
      )}
    </Card>
  );
}
