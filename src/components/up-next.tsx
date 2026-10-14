"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { workoutTitle } from "@/lib/labels";
import { getProgramProgress, getRoutine, startSession, type ProgramProgress } from "@/lib/workout-api";

/** Your active program's next workout, reloaded when reloadKey changes. `undefined` while loading. */
export function useActiveProgram(reloadKey = 0) {
  const [progress, setProgress] = useState<ProgramProgress | null | undefined>(undefined);
  useEffect(() => {
    getProgramProgress()
      .then(setProgress)
      .catch(() => setProgress(null));
  }, [reloadKey]);
  return progress;
}

/** The big "do this next" card for the active program. */
export function UpNext({ progress }: { progress: ProgramProgress }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = !progress.next_routine_id;

  async function start() {
    if (!progress.next_routine_id) return;
    setBusy(true);
    setError(null);
    try {
      await startSession(await getRoutine(progress.next_routine_id));
      router.push("/workout/");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("one_active") ? "Finish or discard your current workout first." : msg);
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary gap-3 p-4" data-testid="up-next">
      <div className="min-w-0">
        <p className="text-primary-text text-xs font-bold tracking-wide uppercase">
          {finished ? "Program complete" : `Up next · Week ${progress.next_week} of ${progress.weeks}`}
        </p>
        <p className="truncate text-lg font-bold">
          {finished ? progress.program_name : `Day ${progress.next_day}: ${workoutTitle(progress.next_routine_name ?? "")}`}
        </p>
        <p className="text-muted-foreground truncate text-sm">
          {finished ? `All ${progress.total} workouts done. Nice work!` : `${progress.program_name} · ${progress.done} of ${progress.total} done`}
        </p>
      </div>
      {finished ? (
        <Button asChild variant="secondary">
          <Link href="/plans/">Pick your next program</Link>
        </Button>
      ) : (
        <Button size="lg" onClick={start} disabled={busy}>
          <Play /> Start Week {progress.next_week} · Day {progress.next_day}
        </Button>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </Card>
  );
}
