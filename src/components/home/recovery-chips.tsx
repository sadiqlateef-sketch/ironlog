"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { MUSCLE_LABELS } from "@/lib/labels";
import { computeRecovery, LOOKBACK_HOURS, READY_THRESHOLD, recoveryLabel, type MuscleRecovery } from "@/lib/recovery";
import { getMuscleSets } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const chipStyle = {
  Recovered: "bg-success/15 text-success",
  Recovering: "bg-primary/15 text-primary-text",
  Fatigued: "bg-destructive/15 text-destructive",
} as const;

/** Muscles you've trained lately, coloured by how recovered they are. */
export function RecoveryChips() {
  const [recovery, setRecovery] = useState<MuscleRecovery[] | null>(null);

  useEffect(() => {
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => setRecovery(computeRecovery(sets)))
      .catch(() => setRecovery([]));
  }, []);

  const worked = (recovery ?? []).filter((m) => m.sets > 0).sort((a, b) => a.recovery - b.recovery);
  const allReady = worked.every((m) => m.recovery >= READY_THRESHOLD);

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="recovery-chips">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Recovery</h2>
      {recovery === null ? null : worked.length === 0 ? (
        <p className="text-muted-foreground text-sm">No recent sets, so every muscle is fresh.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {worked.map((m) => (
              <span key={m.muscle} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", chipStyle[recoveryLabel(m.recovery)])}>
                {MUSCLE_LABELS[m.muscle]}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">{allReady ? "Everything you trained is recovered." : "Green is ready, red needs more rest."}</p>
        </>
      )}
    </Card>
  );
}
