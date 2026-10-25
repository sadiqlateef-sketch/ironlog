"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { SessionEditor } from "@/components/session-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatWeight } from "@/lib/units";
import {
  deleteSession,
  getSession,
  listExercises,
  listSessionSets,
  listSessionsOn,
  type Exercise,
  type WorkoutSession,
  type WorkoutSet,
} from "@/lib/workout-api";
import { formatDuration, trainingSummary } from "@/lib/stats";
import { workingSetNumbers } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";
import { describeTimedSet } from "@/lib/cardio";
import { SkeletonList } from "@/components/ui/skeleton";

let exerciseCache: Promise<Map<string, Exercise>> | null = null;
const exerciseMap = () => (exerciseCache ??= listExercises().then((xs) => new Map(xs.map((x) => [x.id, x]))));

/**
 * A finished workout: when, how long, and every set you logged, with
 * Edit and Delete. onChanged runs after either, so stats can reload.
 */
export function SessionSheet({
  sessionId,
  onOpenChange,
  onChanged,
}: {
  sessionId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  return (
    <Dialog open={!!sessionId} onOpenChange={onOpenChange}>
      <DialogContent>
        {sessionId && (
          <Details
            key={sessionId}
            id={sessionId}
            onChanged={() => onChanged?.()}
            onDeleted={() => {
              onChanged?.();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const longDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** Every workout you finished on one day, each with Edit and Delete. */
export function DaySheet({
  day,
  onOpenChange,
  onChanged,
}: {
  day: Date | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  return (
    <Dialog open={!!day} onOpenChange={onOpenChange}>
      <DialogContent>{day && <DayList key={day.getTime()} day={day} onChanged={() => onChanged?.()} />}</DialogContent>
    </Dialog>
  );
}

function DayList({ day, onChanged }: { day: Date; onChanged: () => void }) {
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    listSessionsOn(day)
      .then(setSessions)
      .catch((e: Error) => setError(e.message));
  }, [day, version]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl font-extrabold">{longDate(day)}</DialogTitle>
        <DialogDescription>
          {sessions == null ? "Loading…" : sessions.length ? `${sessions.length} workout${sessions.length > 1 ? "s" : ""}` : "No workout logged"}
        </DialogDescription>
      </DialogHeader>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {sessions?.length === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Nothing was logged on this day. Did you train but forget to log it? You can add it from a screenshot, photo or text.</p>
          <Button asChild variant="secondary">
            <Link href="/log/?tab=photo">Import a workout</Link>
          </Button>
        </div>
      )}
      {sessions?.map((s) => (
        <Details
          key={s.id}
          id={s.id}
          inDay
          onChanged={onChanged}
          onDeleted={() => {
            onChanged();
            setVersion((v) => v + 1);
          }}
        />
      ))}
    </>
  );
}

function Details({ id, inDay = false, onChanged, onDeleted }: { id: string; inDay?: boolean; onChanged: () => void; onDeleted: () => void }) {
  const { unit } = useAuth();
  const [data, setData] = useState<{ session: WorkoutSession; sets: WorkoutSet[]; names: Map<string, Exercise> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([getSession(id), listSessionSets(id), exerciseMap()])
      .then(([session, sets, names]) => setData({ session, sets: sets.filter((s) => s.is_completed), names }))
      .catch((e: Error) => setError(e.message));
  }, [id, version]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!data) return <SkeletonList rows={3} />;

  const { session, sets, names } = data;
  const minutes = session.end_time ? Math.round((Date.parse(session.end_time) - Date.parse(session.start_time)) / 60000) : null;
  const groups = [...new Set(sets.map((s) => s.exercise_order))].map((order) => sets.filter((s) => s.exercise_order === order));
  const title = session.name ?? "Workout";
  const start = new Date(session.start_time);
  const meta = (
    <>
      {inDay ? start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : longDate(start)}
      {minutes != null && ` · ${minutes} min`} · {formatWeight(session.volume, unit)} volume
    </>
  );

  async function remove() {
    setBusy(true);
    try {
      await deleteSession(session.id);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", inDay && "border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0")} data-testid="session-details">
      {inDay ? (
        <div>
          <h3 className="text-xl font-extrabold">{title}</h3>
          <p className="text-muted-foreground text-sm">{meta}</p>
        </div>
      ) : (
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">{title}</DialogTitle>
          <DialogDescription>{meta}</DialogDescription>
        </DialogHeader>
      )}

      {mode === "edit" ? (
        <SessionEditor
          session={session}
          sets={sets}
          names={names}
          onCancel={() => setMode("view")}
          onSaved={() => {
            setMode("view");
            setVersion((v) => v + 1);
            onChanged();
          }}
        />
      ) : (
        <>
          {sets.length > 0 && session.end_time && <SummaryRow session={session} sets={sets} />}
          {groups.length === 0 && <p className="text-muted-foreground text-sm">No sets were logged in this workout.</p>}
          {groups.map((g) => {
            const numbers = workingSetNumbers(g.map((s) => s.set_type));
            return (
              <section key={g[0].exercise_order} className="glass rounded-2xl p-3">
                <h4 className="mb-1 font-bold">{names.get(g[0].exercise_id)?.name ?? "Exercise"}</h4>
                <ol className="flex flex-col gap-0.5 num">
                  {g.map((s, i) => (
                    <li key={s.id} className="flex gap-3">
                      <span className={cn("w-5 text-center text-sm font-bold", setTone[s.set_type])}>
                        {s.set_type === "normal" ? numbers[i] : s.set_type[0].toUpperCase()}
                      </span>
                      <span className="font-bold">
                        {describeTimedSet(s, unit, (kg) => formatWeight(kg, unit)) ?? `${formatWeight(s.weight, unit)} × ${s.reps}`}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}

          {mode === "delete" ? (
            <div className="border-destructive/60 flex flex-col gap-3 rounded-2xl border p-3" role="alertdialog" aria-label="Delete workout?">
              <p className="text-sm">
                <span className="font-bold">Delete “{title}”?</span> Its {sets.length} set{sets.length === 1 ? "" : "s"} come out of your history, charts,
                records and recovery, and a program day it counted for is no longer ticked. This can&apos;t be undone.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="destructive" onClick={remove} disabled={busy}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setMode("edit")}>
                <Pencil /> Edit
              </Button>
              <Button variant="secondary" className="text-set-failure" onClick={() => setMode("delete")}>
                <Trash2 /> Delete workout
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const setTone = {
  normal: "text-muted-foreground",
  warmup: "text-set-warmup",
  drop: "text-set-drop",
  failure: "text-set-failure",
  amrap: "text-set-amrap",
} as const;

/** Where the time went: lifting, resting and idle (estimated from when sets were ticked off). */
function SummaryRow({ session, sets }: { session: WorkoutSession; sets: WorkoutSet[] }) {
  const sum = trainingSummary(session, sets);
  return (
    <dl className="bg-secondary grid grid-cols-3 gap-2 rounded-2xl p-3 text-center" aria-label="Training summary">
      {[
        ["Lifting", sum.liftingSec],
        ["Rest", sum.restSec],
        ["Idle", sum.idleSec],
      ].map(([label, sec]) => (
        <div key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="num text-lg font-bold">{formatDuration(Number(sec))}</dd>
        </div>
      ))}
    </dl>
  );
}
