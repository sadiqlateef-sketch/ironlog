"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Flame, Share2, Trophy } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { RecordBadge } from "@/components/workout/record";
import { Button } from "@/components/ui/button";
import type { Block } from "@/hooks/use-workout";
import { maxHrFor, strainBand, workoutStrain } from "@/lib/insights";
import { listHeartRate } from "@/lib/insights-api";
import { shareImage } from "@/lib/native";
import { drawWorkoutCard } from "@/lib/share-image";
import { formatDuration, weekStreak } from "@/lib/stats";
import { listSessionsSince } from "@/lib/workout-api";
import { bestE1rm, parseNumber } from "@/lib/workout-logic";
import type { PhysicalStats } from "@/types/database";

export interface FinishedWorkout {
  sessionId: string;
  name: string | null;
  startTime: string;
  endTime: string;
  blocks: Block[];
  recordIds: string[];
  synced: boolean;
}

interface Line {
  id: string;
  name: string;
  sets: number;
  top: { weight: number; reps: number } | null;
  record: boolean;
}

/** Sets you ticked off, in your unit, with the best set of each exercise. */
export function summarize(w: Pick<FinishedWorkout, "blocks" | "recordIds">) {
  let volume = 0;
  let sets = 0;
  const effort: { set_type: string; reps: number; rpe: number | null }[] = [];
  const lines: Line[] = [];
  for (const b of w.blocks) {
    const done = b.sets.filter((s) => s.done);
    if (!done.length) continue;
    sets += done.length;
    const working = done
      .filter((s) => s.type !== "warmup")
      .map((s) => ({ weight: parseNumber(s.weight) ?? 0, reps: parseNumber(s.reps) ?? 0, rpe: (s as { rpe?: number | string | null }).rpe ?? null }));
    for (const s of working) volume += s.weight * s.reps;
    effort.push(...done.map((s) => ({ set_type: s.type, reps: parseNumber(s.reps) ?? 0, rpe: rpeOf((s as { rpe?: number | string | null }).rpe) })));
    const top = working.reduce<{ weight: number; reps: number } | null>((m, s) => (!m || bestE1rm([s]) > bestE1rm([m]) ? s : m), null);
    const prev = lines.find((l) => l.id === b.exercise.id);
    if (prev) {
      prev.sets += done.length;
      if (top && (!prev.top || bestE1rm([top]) > bestE1rm([prev.top]))) prev.top = top;
    } else {
      lines.push({ id: b.exercise.id, name: b.exercise.name, sets: done.length, top: top && top.reps > 0 ? top : null, record: w.recordIds.includes(b.exercise.id) });
    }
  }
  return { volume, sets, exercises: lines.length, lines, effort };
}

const rpeOf = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseNumber(v) : v;
  return n != null && n > 0 ? n : null;
};

/**
 * The screen after Finish: time, volume, sets, new records, how hard it was
 * (strain), your week streak, and a Share button. `children` adds extras such
 * as the gym calendar note and next time's targets.
 */
export function FinishSummary({ workout, onDone, children }: { workout: FinishedWorkout; onDone: () => void; children?: ReactNode }) {
  const { unit, profile } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const sum = useMemo(() => summarize(workout), [workout]);
  const seconds = Math.max(0, (Date.parse(workout.endTime) - Date.parse(workout.startTime)) / 1000);
  const maxHr = maxHrFor((profile?.physical_stats ?? {}) as PhysicalStats);
  const [hr, setHr] = useState<{ t: number; bpm: number }[]>([]);
  const [streak, setStreak] = useState<number | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

  useEffect(() => {
    if (!workout.synced) return;
    // The watch may already have sent heart rate for this workout.
    listHeartRate([workout.sessionId])
      .then((rows) => setHr(rows.map((r) => ({ t: Date.parse(r.recorded_at), bpm: r.bpm }))))
      .catch(() => {});
    listSessionsSince(new Date(Date.now() - 120 * 86_400_000))
      .then((s) => setStreak(weekStreak(s)))
      .catch(() => {});
  }, [workout.sessionId, workout.synced]);

  const strain = workoutStrain({ start_time: workout.startTime, end_time: workout.endTime }, hr, sum.effort, maxHr);
  const band = strainBand(strain.score);
  const records = sum.lines.filter((l) => l.record);
  const title = workout.name ?? "Workout";
  const big = (n: number) => Math.round(n).toLocaleString("en-US");
  const detail = (l: Line) => (l.top && l.top.weight > 0 ? `${l.top.weight} ${u} × ${l.top.reps}` : l.top ? `${l.top.reps} reps` : `${l.sets} ${l.sets === 1 ? "set" : "sets"}`);

  async function share() {
    setSharing("Making the image…");
    try {
      const when = new Date(workout.startTime);
      const blob = await drawWorkoutCard({
        title,
        date: when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        records: records.length,
        stats: [
          { label: "Time", value: formatDuration(seconds) },
          { label: `Volume (${u})`, value: big(sum.volume) },
          { label: "Sets", value: String(sum.sets) },
          { label: "Exercises", value: String(sum.exercises) },
        ],
        lines: sum.lines.map((l) => ({ name: l.name, detail: detail(l), record: l.record })),
      });
      const how = await shareImage(blob, `ironlog-${workout.startTime.slice(0, 10)}.png`, title);
      setSharing(how === "downloaded" ? "Saved the image to your downloads." : null);
    } catch (e) {
      setSharing(`Couldn't share: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="finish-summary">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Workout complete</p>
        <h2 className="text-2xl leading-tight font-bold">{title} 💪</h2>
        {records.length > 0 && <RecordBadge count={records.length} className="self-start" />}
      </header>

      <dl className="grid grid-cols-2 gap-2">
        <Big label="Time" value={formatDuration(seconds)} />
        <Big label={`Volume (${u})`} value={big(sum.volume)} />
        <Big label="Sets" value={String(sum.sets)} />
        <Big label="Exercises" value={String(sum.exercises)} />
      </dl>

      <section className="bg-secondary grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl p-3" aria-label="Strain">
        <Activity className="text-set-failure size-6" aria-hidden />
        <div>
          <p className="text-sm">
            Strain <span className="text-lg font-bold tabular-nums">{strain.score}</span> · <span className="font-semibold">{band.label}</span>
          </p>
          <p className="text-muted-foreground text-xs">
            {band.note}
            {strain.cardio.source === "watch" && strain.cardio.avgHr ? ` Avg heart rate ${strain.cardio.avgHr} bpm.` : ""}
          </p>
        </div>
      </section>

      {streak != null && streak > 0 && (
        <p className="flex items-center gap-2 text-sm">
          <Flame className="text-set-warmup fill-set-warmup/30 size-5" aria-hidden />
          <span>
            <span className="font-bold">{streak}</span> {streak === 1 ? "week" : "weeks in a row"} with a workout.
          </span>
        </p>
      )}

      {sum.lines.length > 0 && (
        <section aria-label="Exercises">
          <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Best sets</h3>
          <ul className="flex flex-col">
            {sum.lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2 border-t py-2 text-sm first:border-t-0">
                {l.record ? <Trophy className="text-record size-4 shrink-0" aria-label="New record" /> : <span className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="font-bold tabular-nums">{detail(l)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {children}

      {sharing && (
        <p className="text-muted-foreground text-sm" role="status">
          {sharing}
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={onDone}>Done</Button>
        <Button variant="secondary" onClick={share} disabled={sharing === "Making the image…"} aria-label="Share this workout as an image">
          <Share2 /> Share
        </Button>
      </div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
