"use client";

// A week of food: days logged, averages (complete days only), goal hits, the
// logging streak, body weight beside intake, and a CSV export for a dietitian
// or doctor. Numbers only; nothing here is advice.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { useActiveProgram } from "@/components/up-next";
import { useLoggingStreak } from "@/hooks/use-logging-streak";
import { useMinuteClock } from "@/hooks/use-nutrition-day";
import { useNutritionGoals } from "@/hooks/use-nutrition-goals";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { listMeasurements } from "@/lib/body-api";
import { kvGet } from "@/lib/offline/kv";
import { listDay, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { shareImage } from "@/lib/native";
import { dayLabel, foodDayFor, shiftDay } from "@/lib/nutrition/day";
import { dayTotalsCsv, daysInRange, entriesCsv } from "@/lib/nutrition/export";
import { resolveDayGoal } from "@/lib/nutrition/goals";
import { phaseFor } from "@/lib/nutrition/phase-goal";
import { normalizeOverride, trainingDay } from "@/lib/nutrition/training-day";
import { ENERGY_HIT_PCT, weekEnding, weekReport, type WeekReport, type WeightPoint } from "@/lib/nutrition/week-report";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";
import { formatWeight } from "@/lib/units";
import { listSessionsSince } from "@/lib/workout-api";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function endFromUrl(): string | null {
  const d = new URLSearchParams(window.location.search).get("d");
  return d && DAY.test(d) ? d : null;
}

const short = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function WeekScreen() {
  const { unit } = useAuth();
  const { prefs, loading: prefsLoading } = useNutritionPrefs();
  const { goals, loading: goalsLoading } = useNutritionGoals();
  const progress = useActiveProgram();
  const shifts = useWorkShifts();
  const now = useMinuteClock();
  const current = foodDayFor(now, prefs, shifts);
  // Rendered only after sign-in is known (AppShell), so reading the URL here is safe.
  const [picked, setPicked] = useState<string | null>(() => endFromUrl());
  const end = prefsLoading ? null : (picked ?? current);
  const streak = useLoggingStreak(prefsLoading ? null : current);
  const [byDay, setByDay] = useState<{ end: string; entries: Record<string, DiaryEntry[]>; sessions: Record<string, number>; overrides: Record<string, unknown> } | null>(null);
  const [weights, setWeights] = useState<WeightPoint[]>([]);

  useEffect(() => {
    listMeasurements()
      .then(setWeights)
      .catch(() => setWeights([]));
  }, []);

  useEffect(() => {
    if (!end) return;
    let live = true;
    const days = weekEnding(end);
    const load = async () => {
      const [y, m, d] = days[0].split("-").map(Number);
      const [lists, sessions, overrides] = await Promise.all([
        Promise.all(days.map((day) => listDay(day).catch(() => [] as DiaryEntry[]))),
        listSessionsSince(new Date(y, m - 1, d - 1)).catch(() => []),
        Promise.all(days.map((day) => kvGet<unknown>(`nutrition-daytype:${day}`).catch(() => null))),
      ]);
      const count: Record<string, number> = {};
      for (const s of sessions) {
        const fd = foodDayFor(new Date(s.start_time), prefs, shifts);
        count[fd] = (count[fd] ?? 0) + 1;
      }
      if (live)
        setByDay({
          end,
          entries: Object.fromEntries(days.map((day, i) => [day, lists[i]])),
          sessions: count,
          overrides: Object.fromEntries(days.map((day, i) => [day, overrides[i]])),
        });
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(NUTRITION_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, onChange);
    };
  }, [end, prefs, shifts]);

  const ready = end !== null && byDay?.end === end && !goalsLoading;
  let report: WeekReport | null = null;
  if (ready && byDay) {
    const days = weekEnding(end);
    const phase = phaseFor(goals, progress ?? null);
    const goalByDay = Object.fromEntries(
      days.map((d) => {
        const t = trainingDay({ sessionsOnDay: byDay.sessions[d] ?? 0, override: normalizeOverride(byDay.overrides[d]) });
        return [d, resolveDayGoal(goals, d, { training: t.training, phaseMode: phase.mode, deload: phase.deload })];
      }),
    );
    report = weekReport({ days, entriesByDay: byDay.entries, goalByDay, weights });
  }

  const go = (next: string) => {
    const clamped = next > current ? current : next;
    setPicked(clamped === current ? null : clamped);
    window.history.replaceState(null, "", clamped === current ? "/food/week/" : `/food/week/?d=${clamped}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to food">
          <Link href="/food/">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Week</h1>
      </header>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Previous week" disabled={!end} onClick={() => end && go(shiftDay(end, -7))}>
          <ChevronLeft />
        </Button>
        <p className="text-base font-semibold" data-testid="week-label">
          {end ? (end === current ? "Last 7 days" : `${short(shiftDay(end, -6))} - ${short(end)}`) : ""}
        </p>
        <Button type="button" variant="outline" size="icon" aria-label="Next week" disabled={!end || end === current} onClick={() => end && go(shiftDay(end, 7))}>
          <ChevronRight />
        </Button>
      </div>

      {!report ? <SkeletonList rows={3} /> : <ReportCard report={report} unit={unit} current={current} hasGoal={!!goals.base} />}

      {streak && (
        <p className="text-muted-foreground px-1 text-sm" data-testid="week-streak">
          Logging streak: {streak.days} {streak.days === 1 ? "day" : "days"}
          {!streak.todayLogged && streak.days > 0 ? " (today still open)" : ""}
        </p>
      )}

      {end && <ExportCard defaultTo={current} />}
    </div>
  );
}

function ReportCard({ report, unit, current, hasGoal }: { report: WeekReport; unit: "metric" | "imperial"; current: string; hasGoal: boolean }) {
  const r = report;
  return (
    <Card className="gap-3 p-4" data-testid="week-report">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Days logged</dt>
        <dd className="text-right font-semibold tabular-nums">{r.daysLogged} of 7</dd>
        <dt className="text-muted-foreground">Average energy</dt>
        <dd className="text-right font-semibold tabular-nums">{r.avgEnergy === null ? "–" : `${r.avgEnergy} kcal`}</dd>
        <dt className="text-muted-foreground">Average protein</dt>
        <dd className="text-right font-semibold tabular-nums">{r.avgProtein === null ? "–" : `${r.avgProtein} g`}</dd>
        {hasGoal && (
          <>
            <dt className="text-muted-foreground">Energy goal hit</dt>
            <dd className="text-right font-semibold tabular-nums">
              {r.energyHits} of {r.goalDays}
            </dd>
            <dt className="text-muted-foreground">Protein goal reached</dt>
            <dd className="text-right font-semibold tabular-nums">
              {r.proteinHits} of {r.goalDays}
            </dd>
          </>
        )}
        {r.bestDay && (
          <>
            <dt className="text-muted-foreground">Closest to goal</dt>
            <dd className="text-right font-semibold tabular-nums">
              {dayLabel(r.bestDay.day, current)} · {r.bestDay.energy} of {r.bestDay.goal}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Body weight</dt>
        <dd className="text-right font-semibold tabular-nums">
          {r.weight
            ? r.weight.count > 1
              ? `${formatWeight(r.weight.first.weight_kg, unit)} → ${formatWeight(r.weight.last.weight_kg, unit)}`
              : formatWeight(r.weight.last.weight_kg, unit)
            : "–"}
        </dd>
      </dl>
      {r.incompleteDays.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Left out of the averages (some values unknown): {r.incompleteDays.map((d) => dayLabel(d, current)).join(", ")}.
        </p>
      )}
      {hasGoal && <p className="text-muted-foreground text-xs">A day counts as a hit within {ENERGY_HIT_PCT}% of that day&apos;s energy goal.</p>}
      {!r.weight && <p className="text-muted-foreground text-xs">Log your weight under Progress to see it beside your intake.</p>}
    </Card>
  );
}

function ExportCard({ defaultTo }: { defaultTo: string }) {
  const [from, setFrom] = useState(() => shiftDay(defaultTo, -6));
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const valid = DAY.test(from) && DAY.test(to) && from <= to;

  const share = async (kind: "entries" | "days") => {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    try {
      const days = daysInRange(from, to);
      const all: DiaryEntry[] = [];
      for (let i = 0; i < days.length; i += 7) {
        const chunk = await Promise.all(days.slice(i, i + 7).map((d) => listDay(d).catch(() => [] as DiaryEntry[])));
        for (const list of chunk) all.push(...list);
      }
      const csv = kind === "entries" ? entriesCsv(all, from, to) : dayTotalsCsv(all, from, to);
      const name = `ironlog-food-${kind === "entries" ? "entries" : "daily"}-${from}-to-${to}.csv`;
      const how = await shareImage(new Blob([csv], { type: "text/csv" }), name, "Ironlog food log");
      setNote(how === "downloaded" ? "Saved to your downloads." : how === "cancelled" ? null : "Shared.");
    } catch {
      setNote("Couldn't make the file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-3 p-4" id="export" data-testid="food-export">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-semibold">Export for your dietitian or doctor</h2>
        <p className="text-muted-foreground text-xs">A spreadsheet (CSV) of what you logged. Planned food is left out; unknown values stay blank.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          From <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="max-w-40" />
        </label>
        <label className="flex items-center gap-2">
          to <Input type="date" value={to} max={defaultTo} onChange={(e) => setTo(e.target.value)} className="max-w-40" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !valid} onClick={() => void share("entries")}>
          <Share2 /> Every entry
        </Button>
        <Button type="button" variant="outline" disabled={busy || !valid} onClick={() => void share("days")}>
          <Share2 /> Daily totals
        </Button>
      </div>
      {note && <p className="text-sm">{note}</p>}
    </Card>
  );
}
