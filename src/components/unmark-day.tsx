"use client";

import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unmarkRoutineDone } from "@/lib/workout-api";

/** "Done" with a way to take the tick back, for a test run or a mis-tap. */
export function UnmarkDay({ routineId, onDone }: { routineId: string; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unmark() {
    setBusy(true);
    setError(null);
    try {
      await unmarkRoutineDone(routineId);
      setAsking(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-secondary flex flex-col gap-2 rounded-xl p-3" data-testid="unmark-day">
      <div className="flex items-center gap-2">
        <Check className="text-success size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-sm font-semibold">Marked as done</span>
        {!asking && (
          <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
            <Undo2 /> Mark not done
          </Button>
        )}
      </div>
      {asking && (
        <>
          <p className="text-muted-foreground text-sm">
            This day goes back to not done, so it can come up next again. The workout itself stays in your history. To remove it completely, delete it from
            the Progress calendar instead.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAsking(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={unmark} disabled={busy}>
              Mark not done
            </Button>
          </div>
        </>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
