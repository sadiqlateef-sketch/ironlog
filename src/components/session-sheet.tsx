"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatWeight } from "@/lib/units";
import { getSession, listExercises, listSessionSets, type Exercise, type WorkoutSession, type WorkoutSet } from "@/lib/workout-api";
import { workingSetNumbers } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

let exerciseCache: Promise<Map<string, Exercise>> | null = null;
const exerciseMap = () => (exerciseCache ??= listExercises().then((xs) => new Map(xs.map((x) => [x.id, x]))));

/** A finished workout: when, how long, and every set you logged. */
export function SessionSheet({ sessionId, onOpenChange }: { sessionId: string | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!sessionId} onOpenChange={onOpenChange}>
      <DialogContent>{sessionId && <Details key={sessionId} id={sessionId} />}</DialogContent>
    </Dialog>
  );
}

function Details({ id }: { id: string }) {
  const { unit } = useAuth();
  const [data, setData] = useState<{ session: WorkoutSession; sets: WorkoutSet[]; names: Map<string, Exercise> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSession(id), listSessionSets(id), exerciseMap()])
      .then(([session, sets, names]) => setData({ session, sets: sets.filter((s) => s.is_completed), names }))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!data) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const { session, sets, names } = data;
  const minutes = session.end_time ? Math.round((Date.parse(session.end_time) - Date.parse(session.start_time)) / 60000) : null;
  const groups = [...new Set(sets.map((s) => s.exercise_order))].map((order) => sets.filter((s) => s.exercise_order === order));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl font-extrabold">{session.name ?? "Workout"}</DialogTitle>
        <DialogDescription>
          {new Date(session.start_time).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          {minutes != null && ` · ${minutes} min`} · {formatWeight(session.volume, unit)} volume
        </DialogDescription>
      </DialogHeader>
      {groups.length === 0 && <p className="text-muted-foreground text-sm">No sets were logged in this workout.</p>}
      {groups.map((g) => {
        const numbers = workingSetNumbers(g.map((s) => s.set_type));
        return (
          <section key={g[0].exercise_order} className="glass rounded-2xl p-3">
            <h3 className="mb-1 font-bold">{names.get(g[0].exercise_id)?.name ?? "Exercise"}</h3>
            <ol className="flex flex-col gap-0.5 font-mono">
              {g.map((s, i) => (
                <li key={s.id} className="flex gap-3">
                  <span className={cn("w-5 text-center text-sm font-bold", s.set_type === "warmup" ? "text-set-warmup" : "text-muted-foreground")}>
                    {s.set_type === "warmup" ? "W" : numbers[i]}
                  </span>
                  <span className="font-bold">
                    {formatWeight(s.weight, unit)} × {s.reps}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </>
  );
}
