"use client";

import { useState } from "react";
import { BriefcaseMedical, CalendarClock, Moon, Play } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ShiftsSheet } from "@/components/shifts-sheet";
import { Button } from "@/components/ui/button";
import { workoutTitle } from "@/lib/labels";
import { dayKey, heaviness, normalizeShifts, planWeek } from "@/lib/shifts";
import type { RoutineWithExercises } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

type Day = RoutineWithExercises;

/**
 * This week's remaining program days laid over your work shifts: heavy days
 * on days off, lighter ones around shifts, rest after a night shift.
 * "Use this order" makes Up next follow it.
 */
export function ShiftPlan({
  days,
  done,
  nextId,
  trainedToday,
  busy,
  onStart,
  onApply,
}: {
  days: Day[];
  done: Set<string>;
  nextId: string | null;
  trainedToday: boolean;
  busy: boolean;
  onStart: (d: Day) => void;
  /** Reorder the week's days to these ids. */
  onApply: (ids: string[]) => void;
}) {
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const shifts = normalizeShifts(profile?.work_shifts);
  const today = dayKey(new Date());
  const left = days.filter((d) => !done.has(d.id));

  if (!left.length) return null;
  const sheet = <ShiftsSheet open={editing} onOpenChange={setEditing} />;
  if (!shifts.some((s) => s.date >= today)) {
    return (
      <section className="glass flex items-center gap-3 rounded-2xl p-3">
        <BriefcaseMedical className="text-muted-foreground size-5 shrink-0" />
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">Working shifts this week? Mark them and your plan keeps heavy days off them.</p>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Add shifts
        </Button>
        {sheet}
      </section>
    );
  }

  const { slots, unplaced } = planWeek(
    left.map((d) => ({
      id: d.id,
      heaviness: heaviness(d.routine_exercises.map((x) => ({ target_sets: x.target_sets, target_reps: x.target_reps, equipment: x.exercises?.equipment }))),
    })),
    shifts,
    today,
    { skipToday: trainedToday },
  );
  const byId = new Map(days.map((d) => [d.id, d]));
  const planned = slots.filter((s) => s.dayId).map((s) => s.dayId!);
  const order = [...days.filter((d) => done.has(d.id)).map((d) => d.id), ...planned, ...unplaced];
  const sameOrder = order.join() === days.map((d) => d.id).join();
  const todaySlot = slots[0];
  const todayDay = todaySlot.dayId ? byId.get(todaySlot.dayId) : null;
  const weekday = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <CalendarClock className="size-3.5" /> Your week around work
      </h2>
      <div className="glass flex flex-col gap-3 rounded-3xl p-4">
        {!trainedToday && todaySlot.readiness.kind === "post-night" && (
          <p className="flex items-center gap-2 text-sm">
            <Moon className="size-4 shrink-0" /> You worked last night. Today is for sleep; your next workout is planned for later this week.
          </p>
        )}
        {todayDay && todayDay.id !== nextId && (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">
              Today fits <span className="font-semibold">{workoutTitle(todayDay.name)}</span> better{todaySlot.readiness.kind !== "off" ? ` around your ${todaySlot.readiness.label.toLowerCase()}` : ""}.
            </p>
            <Button size="sm" disabled={busy} onClick={() => onStart(todayDay)}>
              <Play /> Start
            </Button>
          </div>
        )}
        <ol className="flex flex-col">
          {slots.map((s) => {
            const d = s.dayId ? byId.get(s.dayId) : null;
            return (
              <li key={s.date} className="flex items-center gap-3 py-1.5 text-sm">
                <span className={cn("w-10 font-semibold", s.date === today && "text-primary-text")}>{s.date === today ? "Today" : weekday(s.date)}</span>
                <span
                  className={cn(
                    "w-28 shrink-0 truncate text-xs",
                    s.readiness.kind === "off" ? "text-muted-foreground" : s.readiness.kind === "post-night" ? "text-set-warmup font-semibold" : "font-semibold",
                  )}
                >
                  {s.readiness.label}
                </span>
                {d ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate">
                      {d.program_day ? `Day ${d.program_day} · ` : ""}
                      {workoutTitle(d.name)}
                    </span>
                    {s.heavy && <span className="bg-primary/15 text-primary-text shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold">HEAVY</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground min-w-0 flex-1">Rest</span>
                )}
              </li>
            );
          })}
        </ol>
        {unplaced.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {unplaced.map((id) => workoutTitle(byId.get(id)?.name ?? "")).join(", ")} didn&apos;t fit this week between shifts.
          </p>
        )}
        <div className={cn("grid gap-2", sameOrder ? "grid-cols-1" : "grid-cols-2")}>
          {!sameOrder && (
            <Button size="sm" onClick={() => onApply(order)} data-testid="apply-shift-order">
              Use this order
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit shifts
          </Button>
        </div>
      </div>
      {sheet}
    </section>
  );
}
