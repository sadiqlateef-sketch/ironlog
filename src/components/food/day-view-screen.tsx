"use client";

// One food day as a story: sleep, shifts, workouts, meals, water, supplements
// and caffeine on board, in time order. Read-only; edits happen in the diary.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BedDouble, Briefcase, ChevronLeft, ChevronRight, Coffee, Droplet, Dumbbell, Pill, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { FuelPlanCard } from "@/components/food/fuel-plan-card";
import { useMinuteClock, useNutritionDay } from "@/hooks/use-nutrition-day";
import { useNutritionGoals } from "@/hooks/use-nutrition-goals";
import { useNutritionLogs } from "@/hooks/use-nutrition-logs";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { workoutTitle } from "@/lib/labels";
import { buildStory, type StoryItem, type StorySession } from "@/lib/nutrition/day-view";
import { dayLabel, foodDayFor, shiftDay } from "@/lib/nutrition/day";
import { listDay, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { loadManualSleepHours } from "@/lib/readiness";
import { SHIFT_PRESETS } from "@/lib/shifts";
import { listSessionsSince } from "@/lib/workout-api";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function dayFromUrl(): string | null {
  const d = new URLSearchParams(window.location.search).get("d");
  return d && DAY.test(d) ? d : null;
}

export function DayViewScreen() {
  const { prefs, loading: prefsLoading } = useNutritionPrefs();
  const { goals } = useNutritionGoals();
  const shifts = useWorkShifts();
  const now = useMinuteClock();
  const current = foodDayFor(now, prefs, shifts);
  // Rendered only after sign-in is known (AppShell), so reading the URL here is safe.
  const [picked, setPicked] = useState<string | null>(() => dayFromUrl());
  const day = prefsLoading ? null : (picked ?? current);
  const isCurrent = day === current;
  const { entries, loading } = useNutritionDay(day);
  const logs = useNutritionLogs();
  const [earlier, setEarlier] = useState<DiaryEntry[]>([]);
  const [sessions, setSessions] = useState<StorySession[]>([]);
  const [sleep] = useState(loadManualSleepHours);

  useEffect(() => {
    if (!day) return;
    let live = true;
    const load = () =>
      listDay(shiftDay(day, -1))
        .then((l) => live && setEarlier(l))
        .catch(() => {});
    void load();
    const [y, m, d] = day.split("-").map(Number);
    listSessionsSince(new Date(y, m - 1, d - 1))
      .then((l) => live && setSessions(l.filter((s) => s.start_time < new Date(y, m - 1, d + 2).toISOString())))
      .catch(() => live && setSessions([]));
    window.addEventListener(NUTRITION_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, load);
    };
  }, [day]);

  const story = useMemo(() => {
    if (!day) return [];
    return buildStory({
      day,
      entries,
      earlier,
      sessions,
      logs,
      shifts,
      sleep,
      dayOf: (t) => foodDayFor(t, prefs, shifts),
      supplementNames: Object.fromEntries(goals.supplements.map((s) => [s.id, s.name])),
      halfLifeH: goals.caffeine.halfLifeH,
      until: isCurrent ? now : undefined,
    });
  }, [day, entries, earlier, sessions, logs, shifts, sleep, prefs, goals, isCurrent, now]);

  const go = (next: string) => {
    const clamped = next > current ? current : next;
    setPicked(clamped === current ? null : clamped);
    window.history.replaceState(null, "", clamped === current ? "/food/day/" : `/food/day/?d=${clamped}`);
  };

  const caffeine = story.filter((i): i is Extract<StoryItem, { kind: "caffeine" }> => i.kind === "caffeine");
  const rest = story.filter((i) => i.kind !== "caffeine");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to food">
          <Link href={day && !isCurrent ? `/food/?d=${day}` : "/food/"}>
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Your day</h1>
      </header>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Previous day" disabled={!day} onClick={() => day && go(shiftDay(day, -1))}>
          <ChevronLeft />
        </Button>
        <p className="text-base font-semibold" data-testid="day-view-label">
          {day ? dayLabel(day, current) : ""}
        </p>
        <Button type="button" variant="outline" size="icon" aria-label="Next day" disabled={!day || isCurrent} onClick={() => day && go(shiftDay(day, 1))}>
          <ChevronRight />
        </Button>
      </div>

      {day === null || loading ? (
        <SkeletonList rows={4} />
      ) : (
        <Card className="gap-0 p-0" data-testid="day-story">
          <ol className="divide-border divide-y">
            {rest.map((item, i) => (
              <StoryRow key={`${item.kind}-${item.at ?? "x"}-${i}`} item={item} />
            ))}
          </ol>
          {rest.length === 1 && <p className="text-muted-foreground px-4 pb-4 text-sm">Nothing logged on this day yet.</p>}
        </Card>
      )}

      {day && <FuelPlanCard day={day} shifts={shifts} meals={prefs.meals} showOffDay />}

      {caffeine.length > 0 && (
        <Card className="gap-2 p-4" data-testid="day-caffeine">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Coffee className="text-primary-text size-4" aria-hidden /> Caffeine on board
          </h2>
          <ul className="text-muted-foreground grid grid-cols-3 gap-x-3 gap-y-1 text-xs tabular-nums sm:grid-cols-4">
            {caffeine.map((c) => (
              <li key={c.at}>
                {clock(c.at)} · {c.mg} mg
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">Estimated from your logged drinks and your half-life setting ({goals.caffeine.halfLifeH} h).</p>
        </Card>
      )}
    </div>
  );
}

function StoryRow({ item }: { item: StoryItem }) {
  const Icon = {
    sleep: BedDouble,
    meal: Utensils,
    workout: Dumbbell,
    water: Droplet,
    supplement: Pill,
    "shift-start": Briefcase,
    "shift-end": Briefcase,
    caffeine: Coffee,
  }[item.kind];
  let title = "";
  let detail: string | null = null;
  switch (item.kind) {
    case "sleep":
      title = item.hours === null ? "No sleep data" : `Slept ${item.hours} h`;
      detail = item.hours === null ? "Add last night's sleep on the readiness card." : "From your readiness card.";
      break;
    case "meal":
      title = `${item.name} · ${item.incomplete ? "≥ " : ""}${item.kcal} kcal`;
      detail = item.foods.join(", ");
      break;
    case "workout":
      title = workoutTitle(item.name);
      detail = item.end ? `Until ${clock(item.end)}` : null;
      break;
    case "water":
      title = `Water · ${item.ml} ml`;
      break;
    case "supplement":
      title = item.doses > 1 ? `${item.name} × ${item.doses}` : item.name;
      break;
    case "shift-start":
      title = `${SHIFT_PRESETS[item.shiftType].label} shift starts`;
      break;
    case "shift-end":
      title = `${SHIFT_PRESETS[item.shiftType].label} shift ends`;
      break;
    case "caffeine":
      title = `${item.mg} mg caffeine`;
      break;
  }
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="text-muted-foreground w-16 shrink-0 pt-0.5 text-xs tabular-nums">{item.at ? clock(item.at) : ""}</span>
      <Icon className="text-primary-text mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {detail && <span className="text-muted-foreground block truncate text-xs">{detail}</span>}
      </span>
    </li>
  );
}
