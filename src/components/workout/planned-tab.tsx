"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CalendarRange,
  ChartColumn,
  Check,
  Clock,
  Dumbbell,
  Link2,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  Play,
  PersonStanding,
  RotateCcw,
  Square,
} from "lucide-react";
import { ExerciseDetail, type Tab } from "@/components/exercise-detail";
import { MuscleFigure, sideOf } from "@/components/muscle-map";
import { UnmarkDay } from "@/components/unmark-day";
import { WorkoutEditor } from "@/components/workout-editor";
import { ActionSheet, type SheetAction } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { DeloadOffer } from "@/components/deload-offer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SortableList } from "@/components/ui/sortable-list";
import { useSlot } from "@/hooks/use-slot";
import { MUSCLE_LABELS, workoutTitle } from "@/lib/labels";
import { agoLabel, estimateMinutes, setsLabel, topMuscles } from "@/lib/workout-plan";
import {
  getExercise,
  getProgramProgress,
  listPrograms,
  listRoutinesWithExercises,
  listWorkoutLog,
  reorderProgramDays,
  reorderRoutineExercises,
  startProgram,
  stopProgram,
  type Exercise,
  type ProgramProgress,
  type ProgramWithWorkouts,
  type Routine,
  type RoutineWithExercises,
} from "@/lib/workout-api";
import { cn } from "@/lib/utils";
import type { MuscleGroup } from "@/types/database";

type Day = RoutineWithExercises;

/**
 * Your plan: the active program's banner and this week's days, then your own
 * routines. Tap a day for its details; drag the handle to reorder.
 */
export function PlannedTab({
  onStart,
  busy,
  onFindPlan,
}: {
  onStart: (r?: Routine) => void;
  busy: boolean;
  onFindPlan: () => void;
}) {
  const [program, setProgram] = useState<ProgramWithWorkouts | null | undefined>(undefined);
  const [progress, setProgress] = useState<ProgramProgress | null>(null);
  const [routines, setRoutines] = useState<Day[]>([]);
  const [lastDone, setLastDone] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState<Day | null>(null);
  const [editing, setEditing] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slot = useSlot("bottom-bar-slot");

  const load = useCallback(() => {
    Promise.all([listPrograms(), getProgramProgress(), listRoutinesWithExercises(), listWorkoutLog()])
      .then(([programs, prog, mine, log]) => {
        const active = programs.find((p) => p.is_active) ?? null;
        // "Last done" for a program day counts that day in any week.
        const dayOf = new Map(active?.routines.map((r) => [r.id, `day:${r.program_day}`]) ?? []);
        const last = new Map<string, string>();
        for (const s of log) {
          if (!s.routine_id) continue;
          const k = dayOf.get(s.routine_id) ?? s.routine_id;
          if (!last.has(k)) last.set(k, s.start_time);
        }
        setProgram(active);
        setProgress(prog);
        setRoutines(mine);
        setLastDone(last);
        // Keep an open day sheet showing fresh data.
        setOpen((o) => (o ? ([...(active?.routines ?? []), ...mine].find((r) => r.id === o.id) ?? null) : o));
      })
      .catch((e: Error) => {
        setError(e.message);
        setProgram(null);
      });
  }, []);
  useEffect(load, [load]);

  if (program === undefined) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const week = progress?.next_week ?? program?.weeks ?? 1;
  const days = (program?.routines ?? []).filter((r) => r.program_week === week).sort((a, b) => a.program_day! - b.program_day!);
  const done = new Set(progress?.done_routine_ids ?? []);
  const next = days.find((d) => d.id === progress?.next_routine_id) ?? null;
  const lastFor = (d: Day) => lastDone.get(d.program_id ? `day:${d.program_day}` : d.id);

  async function reorderDays(next: Day[]) {
    if (!program) return;
    // Show the new order straight away, then save it.
    setProgram({
      ...program,
      routines: program.routines.map((r) => {
        const i = next.findIndex((d) => d.id === r.id);
        return i >= 0 ? { ...r, program_day: i + 1 } : r;
      }),
    });
    try {
      await reorderProgramDays(program.id, week, next.map((d) => d.id));
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {program ? (
        <>
          <ProgramBanner program={program} progress={progress} week={week} onChange={load} onStartEmpty={() => onStart()} />
          {program.deload_suggestion && progress?.next_routine_id && (
            <DeloadOffer programId={program.id} reason={program.deload_suggestion} onChange={load} />
          )}
        </>
      ) : (
        <section className="glass flex flex-col gap-3 rounded-3xl p-5">
          <p className="text-lg font-bold">No program running</p>
          <p className="text-muted-foreground text-sm">Pick a ready-made plan, let the AI build one, or just start an empty workout.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onFindPlan}>Find a plan</Button>
            <Button variant="secondary" onClick={() => onStart()} disabled={busy}>
              <Play /> Empty workout
            </Button>
          </div>
        </section>
      )}

      {days.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Overview · Week {week}
            {days.some((d) => d.is_deload) && <span className="text-set-warmup"> · Deload</span>}
          </h2>
          <SortableList
            items={days}
            keyOf={(d) => d.id}
            labelOf={(d) => `Day ${d.program_day}`}
            onReorder={reorderDays}
            renderItem={(d, handle) => (
              <DayCard
                day={d}
                title={`Day ${d.program_day}`}
                subtitle={workoutTitle(d.name)}
                handle={handle}
                next={d.id === next?.id}
                done={done.has(d.id)}
                last={lastFor(d)}
                onOpen={() => setOpen(d)}
              />
            )}
          />
        </section>
      )}

      {routines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">My workouts</h2>
          <ul className="flex flex-col gap-2">
            {routines.map((r) => (
              <li key={r.id}>
                <DayCard day={r} title={r.name} subtitle={r.description ?? undefined} last={lastFor(r)} onOpen={() => setOpen(r)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DayDetails
        day={open}
        title={open?.program_day ? `Day ${open.program_day} · ${workoutTitle(open.name)}` : (open?.name ?? "")}
        last={open ? lastFor(open) : undefined}
        done={!!open && done.has(open.id)}
        busy={busy}
        onOpenChange={(o) => !o && setOpen(null)}
        onStart={(d) => onStart(d)}
        onEdit={(d) => setEditing(d)}
        onReordered={load}
      />
      <WorkoutEditor routine={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={load} />

      {/* Floating Start Workout: your next program day, or an empty workout. */}
      {slot &&
        createPortal(
          <div className="mx-auto flex max-w-md justify-end px-3 pb-2">
            <Button
              size="lg"
              className="h-14 rounded-full px-6 text-base"
              disabled={busy}
              onClick={() => onStart(next ?? undefined)}
              data-testid="floating-start"
            >
              <Play className="fill-current" /> {next ? `Start Day ${next.program_day}` : "Start Workout"}
            </Button>
          </div>,
          slot,
        )}
    </div>
  );
}

function ProgramBanner({
  program,
  progress,
  week,
  onChange,
  onStartEmpty,
}: {
  program: ProgramWithWorkouts;
  progress: ProgramProgress | null;
  week: number;
  onChange: () => void;
  onStartEmpty: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const muscles = topMuscles(
    program.routines.flatMap((r) => r.routine_exercises.map((x) => x.exercises?.primary_muscle).filter((m): m is MuscleGroup => !!m)),
    6,
  );
  const actions: SheetAction[] = [
    {
      label: "Restart from week 1",
      icon: RotateCcw,
      onSelect: async () => {
        if (!confirm("Restart from week 1, day 1? Your logged workouts stay in your history.")) return;
        await startProgram(program.id);
        onChange();
      },
    },
    { label: "Start an empty workout", icon: Dumbbell, onSelect: onStartEmpty },
    {
      label: "Stop program",
      icon: Square,
      destructive: true,
      onSelect: async () => {
        await stopProgram(program.id);
        onChange();
      },
    },
  ];

  return (
    <section className="glass relative overflow-hidden rounded-3xl" data-testid="program-banner">
      {/* The "picture": a glowing figure with the program's main muscles lit up. */}
      <div className="from-primary/45 via-ai/20 relative h-36 bg-gradient-to-br to-transparent" aria-hidden>
        <MuscleFigure
          side="front"
          className="absolute -top-2 right-6 h-44 opacity-90"
          fill={(m) => (muscles.includes(m) ? "var(--primary-text)" : "rgb(255 255 255 / 0.12)")}
        />
        <MuscleFigure
          side="back"
          className="absolute -top-2 right-28 h-44 opacity-50"
          fill={(m) => (muscles.includes(m) ? "var(--primary-text)" : "rgb(255 255 255 / 0.1)")}
        />
      </div>
      <div className="absolute top-3 left-3 flex gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href="/plans/">
            <CalendarRange /> Plan
          </Link>
        </Button>
        <Button variant="secondary" size="icon" className="size-9" aria-label="Program options" onClick={() => setMenu(true)}>
          <MoreHorizontal />
        </Button>
      </div>
      <div className="p-5 pt-0">
        <p className="text-primary-text text-xs font-bold tracking-wide uppercase">
          Week {week} of {program.weeks}
        </p>
        <h2 className="text-2xl leading-tight font-extrabold">{program.name}</h2>
        {progress && (
          <p className="text-muted-foreground text-sm">
            {progress.done} of {progress.total} workouts done
          </p>
        )}
      </div>
      <ActionSheet open={menu} onOpenChange={setMenu} title={program.name} actions={actions} />
    </section>
  );
}

function DayCard({
  day,
  title,
  subtitle,
  handle,
  next,
  done,
  last,
  onOpen,
}: {
  day: Day;
  title: string;
  subtitle?: string;
  handle?: React.ReactNode;
  next?: boolean;
  done?: boolean;
  last?: string;
  onOpen: () => void;
}) {
  const muscles = topMuscles(day.routine_exercises.map((x) => x.exercises?.primary_muscle).filter((m): m is MuscleGroup => !!m));
  const minutes = estimateMinutes(day.routine_exercises);
  return (
    <div
      className={cn("glass flex items-center gap-1 rounded-2xl py-2 pr-3 pl-1", next && "ring-primary ring-2", !handle && "pl-3")}
      data-testid="day-card"
    >
      {handle}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-lg font-bold">{title}</span>
            {next && <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px] font-bold">NEXT</span>}
            {done && <Check className="text-success size-4" aria-label="Done this week" />}
          </span>
          {subtitle && <span className="text-muted-foreground block truncate text-sm">{subtitle}</span>}
          <span className="text-foreground/85 block truncate text-sm">
            {muscles.map((m) => MUSCLE_LABELS[m]).join(", ") || "No exercises yet"}
          </span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <Clock className="size-3.5" /> ~{minutes} min · {day.routine_exercises.length} exercises
            {last && <> · {agoLabel(last)}</>}
          </span>
        </span>
        <span className="bg-secondary grid size-16 shrink-0 place-items-center rounded-2xl">
          <MuscleFigure
            side={muscles[0] ? sideOf(muscles[0]) : "front"}
            fill={(m) => (muscles.includes(m) ? "var(--primary-text)" : undefined)}
            className="h-14 w-auto"
          />
        </span>
      </button>
    </div>
  );
}

function DayDetails({
  day,
  title,
  last,
  done = false,
  busy,
  onOpenChange,
  onStart,
  onEdit,
  onReordered,
}: {
  day: Day | null;
  title: string;
  last?: string;
  done?: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (d: Day) => void;
  onEdit: (d: Day) => void;
  onReordered: () => void;
}) {
  const [order, setOrder] = useState<Day["routine_exercises"] | null>(null);
  const [menuFor, setMenuFor] = useState<Day["routine_exercises"][number] | null>(null);
  const [detail, setDetail] = useState<{ exercise: Exercise; tab: Tab } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = order ?? day?.routine_exercises ?? [];

  async function reorder(next: Day["routine_exercises"]) {
    if (!day) return;
    setOrder(next);
    try {
      await reorderRoutineExercises(day.id, next.map((x) => x.id));
      onReordered();
    } catch (e) {
      setError((e as Error).message);
      setOrder(null);
    }
  }

  async function show(exerciseId: string, tab: Tab) {
    try {
      setDetail({ exercise: await getExercise(exerciseId), tab });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Dialog
        open={!!day}
        onOpenChange={(o) => {
          if (!o) setOrder(null);
          onOpenChange(o);
        }}
      >
        <DialogContent>
          {day && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-extrabold">{title}</DialogTitle>
                <DialogDescription>
                  ~{estimateMinutes(items)} min · {items.length} exercises
                  {last && <> · last done {agoLabel(last).toLowerCase()}</>}
                </DialogDescription>
              </DialogHeader>
              {done && <UnmarkDay routineId={day.id} onDone={onReordered} />}
              {error && <p className="text-destructive text-sm">{error}</p>}
              <SortableList
                items={items}
                keyOf={(x) => x.id}
                labelOf={(x) => x.exercises?.name ?? "exercise"}
                onReorder={reorder}
                className="gap-0"
                renderItem={(x, handle, i) => {
                  const linkedToNext = x.superset_group != null && items[i + 1]?.superset_group === x.superset_group;
                  return (
                    <div className="relative flex items-center gap-2 py-1.5">
                      {handle}
                      {x.exercises?.image_urls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={x.exercises.image_urls[0]} alt="" className="size-12 shrink-0 rounded-full bg-white object-cover" />
                      ) : (
                        <span className="bg-secondary grid size-12 shrink-0 place-items-center rounded-full">
                          <Dumbbell className="text-muted-foreground size-5" />
                        </span>
                      )}
                      {linkedToNext && (
                        <Link2
                          className="text-set-drop bg-popover absolute top-full left-[4.25rem] z-10 size-5 -translate-y-1/2 rotate-90 rounded-full p-0.5"
                          aria-label="Superset with the next exercise"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{x.exercises?.name ?? "Exercise"}</p>
                        <p className="text-muted-foreground font-mono text-sm">{setsLabel(x)}</p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Muscles worked by ${x.exercises?.name}`} onClick={() => show(x.exercise_id, "guide")}>
                        <PersonStanding />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Options for ${x.exercises?.name}`} onClick={() => setMenuFor(x)}>
                        <MoreHorizontal />
                      </Button>
                    </div>
                  );
                }}
              />
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button variant="secondary" size="lg" onClick={() => onEdit(day)}>
                  <Pencil /> Edit
                </Button>
                <Button size="lg" disabled={busy} onClick={() => onStart(day)}>
                  <Play className="fill-current" /> Start Workout
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ActionSheet
        open={!!menuFor}
        onOpenChange={(o) => !o && setMenuFor(null)}
        title={menuFor?.exercises?.name ?? ""}
        actions={
          menuFor && day
            ? [
                { label: "How to do it", icon: PersonStanding, onSelect: () => show(menuFor.exercise_id, "guide") },
                { label: "History and chart", icon: ChartColumn, onSelect: () => show(menuFor.exercise_id, "chart") },
                { label: "Edit this workout", icon: ListOrdered, onSelect: () => onEdit(day) },
              ]
            : []
        }
      />
      <ExerciseDetail exercise={detail?.exercise ?? null} tab={detail?.tab} onOpenChange={(o) => !o && setDetail(null)} />
    </>
  );
}
