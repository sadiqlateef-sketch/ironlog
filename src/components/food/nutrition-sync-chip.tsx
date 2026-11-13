"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNutritionSync } from "@/hooks/use-nutrition-sync";
import { flushNutrition } from "@/lib/offline/nutrition-outbox";
import { discardWaitingFood } from "@/lib/offline/nutrition-store";
import { discardPrompt } from "@/lib/nutrition/display";

/** Food changes waiting to sync. Shows nothing when everything is saved. */
export function NutritionSyncChip() {
  const s = useNutritionSync();
  const [busy, setBusy] = useState(false);
  if (s.pending === 0 && !s.refused) return null;

  const retry = async () => {
    setBusy(true);
    try {
      await flushNutrition();
    } finally {
      setBusy(false);
    }
  };
  // Discard means all of them: the phone then shows what the server has, so the two agree.
  const discard = async () => {
    if (!window.confirm(discardPrompt(s.pending))) return;
    setBusy(true);
    try {
      await discardWaitingFood();
    } finally {
      setBusy(false);
    }
  };

  const label = `${s.pending} food change${s.pending === 1 ? "" : "s"} waiting`;
  const state = s.refused ? "" : !s.online ? " (offline)" : s.syncing ? " (syncing)" : "";

  return (
    <div role="status" className="bg-secondary/60 border-border/50 flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm">
      <p className="font-medium">
        {label}
        {state}
      </p>
      {s.refused && (
        <>
          <p className="text-muted-foreground">{s.refused}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={retry} disabled={busy}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={discard} disabled={busy}>
              Discard all
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
