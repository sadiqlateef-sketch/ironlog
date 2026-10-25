"use client";

import { useState } from "react";
import { BatteryCharging } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyEarlyDeload, dismissEarlyDeload } from "@/lib/workout-api";

/** Small "Deload" tag for a lighter week or workout. */
export function DeloadTag() {
  return (
    <span className="text-set-warmup border-set-warmup/50 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-bold tracking-wide uppercase">
      <BatteryCharging className="size-3" aria-hidden /> Deload
    </span>
  );
}

/** "You keep missing your targets: take a deload week now?" with Take it / Not now. */
export function DeloadOffer({ programId, reason, onChange }: { programId: string; reason: string; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(take: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (take) {
        const week = await applyEarlyDeload(programId);
        setDone(`Week ${week} is now a deload week. Your later weeks pick up from there.`);
      } else {
        await dismissEarlyDeload(programId);
        setDone("Okay, staying on plan.");
      }
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-secondary flex flex-col gap-2 rounded-lg p-3" data-testid="deload-offer">
      <p className="text-set-warmup flex items-center gap-1.5 text-sm font-semibold">
        <BatteryCharging className="size-4" aria-hidden /> Time for a deload week?
      </p>
      {done ? (
        <p className="text-sm leading-snug">{done}</p>
      ) : (
        <>
          <p className="text-sm leading-snug">{reason}</p>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(false)}>
              Not now
            </Button>
            <Button size="sm" disabled={busy} onClick={() => act(true)} data-testid="take-deload">
              Take a deload week
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
