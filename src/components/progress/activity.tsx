"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Share2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { SessionSheet } from "@/components/session-sheet";
import { RecordBadge } from "@/components/workout/record";
import { Button } from "@/components/ui/button";
import { shareImage } from "@/lib/native";
import { drawWorkoutCard } from "@/lib/share-image";
import { formatDuration, sessionRecords, trainingSummary, type TrainingSummary } from "@/lib/stats";
import { kgToLb, type UnitSystem } from "@/lib/units";
import { listExercises, listFinishedSetsSince, listSessionsSince, type Exercise, type StatsSet, type WorkoutSession } from "@/lib/workout-api";
import { bestE1rm } from "@/lib/workout-logic";

const PAGE = 10;

type Feed = {
  sessions: WorkoutSession[]; // newest first
  setsBy: Map<string, StatsSet[]>;
  records: Map<string, string[]>;
  exercises: Map<string, Exercise>;
};

/** Every finished workout, newest first, with its training summary and records. */
export function ActivityTab({ reloadKey, onChanged }: { reloadKey: number; onChanged?: () => void }) {
  const [feed, setFeed] = useState<{ key: number; data: Feed } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listSessionsSince(new Date(0)), listFinishedSetsSince(new Date(0)), listExercises()])
      .then(([sessions, sets, exercises]) => {
        const setsBy = new Map<string, StatsSet[]>();
        for (const s of sets) setsBy.set(s.session_id, [...(setsBy.get(s.session_id) ?? []), s]);
        setFeed({
          key: reloadKey,
          data: {
            sessions: [...sessions].reverse(),
            setsBy,
            records: sessionRecords(sets, sessions),
            exercises: new Map(exercises.map((e) => [e.id, e])),
          },
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadKey]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!feed) return <p className="text-muted-foreground text-sm">Loading…</p>;
  const { sessions } = feed.data;
  if (!sessions.length) return <p className="text-muted-foreground text-sm">Finish a workout and it shows up here.</p>;

  return (
    <>
      <p className="text-muted-foreground text-xs">
        Lifting, rest and idle time are estimated from when you ticked off each set.
      </p>
      <ul className="flex flex-col gap-3" aria-label="Workouts">
        {sessions.slice(0, shown).map((s) => (
          <li key={s.id}>
            <WorkoutCard session={s} feed={feed.data} onOpen={() => setOpen(s.id)} />
          </li>
        ))}
      </ul>
      {shown < sessions.length && (
        <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
          Show more workouts
        </Button>
      )}
      <SessionSheet sessionId={open} onOpenChange={(o) => !o && setOpen(null)} onChanged={onChanged} />
    </>
  );
}

const weightIn = (kg: number, unit: UnitSystem) => (unit === "imperial" ? kgToLb(kg) : kg);
const compact = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : Math.round(n).toLocaleString());

function WorkoutCard({ session, feed, onOpen }: { session: WorkoutSession; feed: Feed; onOpen: () => void }) {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const sets = useMemo(() => feed.setsBy.get(session.id) ?? [], [feed, session.id]);
  const records = feed.records.get(session.id) ?? [];
  const sum = useMemo(() => trainingSummary(session, sets), [session, sets]);
  const names = [...new Set(sets.filter((s) => s.set_type !== "warmup").map((s) => s.exercise_id))].map(
    (id) => feed.exercises.get(id)?.name ?? "Exercise",
  );
  const [sharing, setSharing] = useState<string | null>(null);
  const title = session.name ?? "Workout";
  const when = new Date(session.start_time);

  async function share() {
    setSharing("Making the image…");
    try {
      const blob = await drawWorkoutCard(shareCard(title, when, sum, sets, records, feed.exercises, unit));
      const how = await shareImage(blob, `ironlog-${session.start_time.slice(0, 10)}.png`, title);
      setSharing(how === "downloaded" ? "Saved the image to your downloads." : null);
    } catch (e) {
      setSharing(`Couldn't share: ${(e as Error).message}`);
    }
  }

  return (
    <article className="glass flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold">{title}</h3>
          <p className="text-muted-foreground text-sm">
            {when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} ·{" "}
            {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        {records.length > 0 && <RecordBadge count={records.length} className="shrink-0" />}
      </header>

      <section aria-label="Training summary" className="bg-secondary rounded-2xl p-3">
        <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Training summary</p>
        <dl className="grid grid-cols-3 gap-x-2 gap-y-3">
          <Item label="Total time" value={formatDuration(sum.totalSec)} />
          <Item label="Lifting" value={formatDuration(sum.liftingSec)} />
          <Item label="Rest" value={formatDuration(sum.restSec)} />
          <Item label="Idle" value={formatDuration(sum.idleSec)} />
          <Item label="Exercises" value={String(sum.exercises)} />
          <Item label={`Volume (${u})`} value={compact(weightIn(sum.volume, unit))} />
        </dl>
      </section>

      {names.length > 0 && (
        <p className="text-muted-foreground truncate text-sm">
          {names.slice(0, 3).join(", ")}
          {names.length > 3 && ` +${names.length - 3} more`}
        </p>
      )}
      {sharing && (
        <p className="text-muted-foreground text-sm" role="status">
          {sharing}
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="secondary" onClick={onOpen}>
          View, edit or delete <ChevronRight />
        </Button>
        <Button variant="secondary" size="icon" aria-label={`Share ${title} as an image`} disabled={sharing === "Making the image…"} onClick={share}>
          <Share2 />
        </Button>
      </div>
    </article>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="num text-lg font-bold">{value}</dd>
    </div>
  );
}

function shareCard(
  title: string,
  when: Date,
  sum: TrainingSummary,
  sets: StatsSet[],
  records: string[],
  exercises: Map<string, Exercise>,
  unit: UnitSystem,
) {
  const u = unit === "imperial" ? "lb" : "kg";
  const order = [...new Set(sets.filter((s) => s.set_type !== "warmup").map((s) => s.exercise_id))];
  return {
    title,
    date: when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    records: records.length,
    stats: [
      { label: "Time", value: formatDuration(sum.totalSec) },
      { label: `Volume (${u})`, value: compact(weightIn(sum.volume, unit)) },
      { label: "Sets", value: String(sum.sets) },
      { label: "Exercises", value: String(sum.exercises) },
    ],
    lines: order.map((id) => {
      const mine = sets.filter((s) => s.exercise_id === id && s.set_type !== "warmup");
      const top = mine.reduce((a, b) => (bestE1rm([b]) > bestE1rm([a]) ? b : a), mine[0]);
      const w = Math.round(weightIn(top.weight, unit) * 2) / 2;
      return {
        name: exercises.get(id)?.name ?? "Exercise",
        detail: top.weight > 0 ? `${w} ${u} × ${top.reps}` : `${top.reps} reps`,
        record: records.includes(id),
      };
    }),
  };
}
