"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExerciseList } from "@/components/exercise-list";
import { NewExerciseDialog } from "@/components/new-exercise-dialog";
import { Button } from "@/components/ui/button";
import { listExercises, type Exercise } from "@/lib/workout-api";

export default function ExercisesPage() {
  return (
    <AppShell>
      <Library />
    </AppShell>
  );
}

function Library() {
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listExercises().then(setExercises).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <Plus /> New
        </Button>
      </header>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {exercises ? (
        <ExerciseList exercises={exercises} onSelect={setSelected} />
      ) : (
        !error && <p className="text-muted-foreground text-sm">Loading…</p>
      )}
      <ExerciseDetail exercise={selected} onOpenChange={(o) => !o && setSelected(null)} />
      <NewExerciseDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(ex) => setExercises((list) => [...(list ?? []), ex].sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </div>
  );
}
