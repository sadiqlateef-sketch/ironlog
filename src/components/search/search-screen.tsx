"use client";

// One search box for everything: exercises (names, nicknames, muscles,
// equipment), past workouts, programs and their days, and the app's screens.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronRight, Dumbbell, SearchX, Sparkles, X } from "lucide-react";
import { ExerciseDetail } from "@/components/exercise-detail";
import { MoreRow, useMoreActions } from "@/components/more/more-screen";
import { SessionSheet } from "@/components/session-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, workoutTitle } from "@/lib/labels";
import { MORE_SECTIONS, TABS, type MoreItem } from "@/lib/nav";
import { rank } from "@/lib/search";
import { listExercises, listPrograms, listWorkoutLog, type Exercise, type ProgramWithWorkouts } from "@/lib/workout-api";

type LoggedWorkout = Awaited<ReturnType<typeof listWorkoutLog>>[number];

const SHOWN = 5;
const SUGGESTIONS = ["bench", "squat", "push", "legs", "light mode"];

const SCREENS: MoreItem[] = [
  ...TABS.filter((t) => t.href !== "/more/").map((t) => ({ label: t.label, detail: "Tab", icon: t.icon, href: t.href })),
  ...MORE_SECTIONS.flatMap((s) => s.items.filter((i) => !i.hidden)),
];

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function initialQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [workouts, setWorkouts] = useState<LoggedWorkout[] | null>(null);
  const [programs, setPrograms] = useState<ProgramWithWorkouts[] | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const actions = useMoreActions();

  useEffect(() => {
    listExercises().then(setExercises).catch(() => setExercises([]));
    listWorkoutLog().then(setWorkouts).catch(() => setWorkouts([]));
    listPrograms().then(setPrograms).catch(() => setPrograms([]));
  }, []);

  // Keep the search in the address, so coming back to this screen shows the same results.
  useEffect(() => {
    const id = setTimeout(() => window.history.replaceState(window.history.state, "", q ? `?q=${encodeURIComponent(q)}` : "?"), 300);
    return () => clearTimeout(id);
  }, [q]);

  const query = q.trim();
  const results = useMemo(
    () => ({
      screens: rank(query, SCREENS, (s) => [s.label, s.detail, s.keywords]),
      exercises: rank(query, exercises ?? [], (e) => [
        e.name,
        ...e.aliases,
        MUSCLE_LABELS[e.primary_muscle],
        EQUIPMENT_LABELS[e.equipment],
        ...e.secondary_muscles.map((m) => MUSCLE_LABELS[m]),
      ]),
      workouts: rank(query, workouts ?? [], (w) => [workoutTitle(w.name ?? "Workout"), w.name, day(w.start_time)]),
      programs: rank(query, programs ?? [], (p) => [p.name, p.methodology, p.summary, ...p.routines.map((r) => r.name)]),
    }),
    [query, exercises, workouts, programs],
  );
  const loading = !exercises || !workouts || !programs;
  const total = results.screens.length + results.exercises.length + results.workouts.length + results.programs.length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
          <ArrowLeft />
        </Button>
        <div className="relative flex-1">
          <input
            type="search"
            autoFocus
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Exercises, workouts, programs…"
            aria-label="Search"
            className="border-input bg-secondary placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-12 w-full rounded-2xl border pr-11 pl-4 text-base outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted-foreground absolute inset-y-0 right-0 grid w-11 place-items-center">
              <X className="size-5" />
            </button>
          )}
        </div>
      </header>

      {!query ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Search every exercise (by name, nickname, muscle or equipment), the workouts you&apos;ve logged this year, your programs, and the app&apos;s screens.</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setQ(s)} className="bg-secondary rounded-full px-3 py-1.5 text-sm font-semibold">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : loading && total === 0 ? (
        <SkeletonList rows={4} />
      ) : total === 0 ? (
        <EmptyState icon={SearchX} title={`Nothing matches “${query}”`}>
          Check the spelling, or try fewer words, a muscle (&ldquo;quads&rdquo;) or equipment (&ldquo;dumbbell&rdquo;).
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5" aria-live="polite">
          <Group key={`s-${query}`} title="Screens" items={results.screens} render={(s) => <MoreRow key={s.label} item={s} onAction={actions.run} />} />
          <Group
            key={`E-${query}`}
            title="Exercises"
            items={results.exercises}
            render={(e) => (
              <ResultRow key={e.id} icon={<Dumbbell className="size-5" />} title={e.name} detail={`${MUSCLE_LABELS[e.primary_muscle]} · ${EQUIPMENT_LABELS[e.equipment]}`} onClick={() => setExercise(e)} />
            )}
          />
          <Group
            key={`W-${query}`}
            title="Past workouts"
            items={results.workouts}
            render={(w) => (
              <ResultRow key={w.id} icon={<CalendarDays className="size-5" />} title={workoutTitle(w.name ?? "Workout")} detail={day(w.start_time)} onClick={() => setSession(w.id)} />
            )}
          />
          <Group
            key={`P-${query}`}
            title="Programs"
            items={results.programs}
            render={(p) => (
              <ResultRow
                key={p.id}
                icon={<Sparkles className="size-5" />}
                title={p.name}
                detail={`${p.is_active ? "Active · " : ""}${p.weeks} weeks · ${p.days_per_week} days a week`}
                href="/plans/"
              />
            )}
          />
        </div>
      )}

      <ExerciseDetail exercise={exercise} onOpenChange={(o) => !o && setExercise(null)} />
      <SessionSheet sessionId={session} onOpenChange={(o) => !o && setSession(null)} />
      {actions.sheets}
    </div>
  );
}

function Group<T>({ title, items, render }: { title: string; items: T[]; render: (item: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
        {title} <span className="tabular-nums">· {items.length}</span>
      </h2>
      <div className="glass flex flex-col rounded-2xl p-1.5">{(all ? items : items.slice(0, SHOWN)).map(render)}</div>
      {items.length > SHOWN && !all && (
        <button type="button" onClick={() => setAll(true)} className="text-primary-text self-start px-1 py-1 text-sm font-semibold">
          Show all {items.length}
        </button>
      )}
    </section>
  );
}

function ResultRow({ icon, title, detail, onClick, href }: { icon: ReactNode; title: string; detail: string; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="bg-secondary text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="text-muted-foreground block truncate text-sm">{detail}</span>
      </span>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </>
  );
  const cls = "hover:bg-accent active:bg-accent flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
