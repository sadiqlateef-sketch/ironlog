"use client";

import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Repeat, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/units";
import { applyAdjustment, dismissAdjustment, type AdjustmentWithContext } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const ACTIONS = {
  increase: { label: "Add weight", icon: ArrowUp, tone: "text-primary-text" },
  hold: { label: "Repeat", icon: Repeat, tone: "text-muted-foreground" },
  deload: { label: "Deload", icon: ArrowDown, tone: "text-set-warmup" },
  adjust_reps: { label: "New rep target", icon: ArrowRight, tone: "text-set-drop" },
} as const;

/** "Next time" suggestion cards with Apply / Dismiss. */
export function AdjustmentList({ items, onChange }: { items: AdjustmentWithContext[]; onChange: () => void }) {
  const { unit } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, fn: (id: string) => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await fn(id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {error && <li className="text-destructive text-sm">{error}</li>}
      {items.map((a) => {
        const meta = ACTIONS[a.action];
        const Icon = meta.icon;
        const re = a.routine_exercises;
        const changesWeight =
          a.suggested_weight_kg != null && a.current_weight_kg != null && Math.abs(a.suggested_weight_kg - a.current_weight_kg) > 0.01;
        return (
          <li key={a.id} className="bg-secondary flex flex-col gap-2 rounded-lg p-3" data-testid="adjustment">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{re?.exercises?.name ?? "Exercise"}</p>
                {re?.routines?.name && <p className="text-muted-foreground truncate text-xs">{re.routines.name}</p>}
              </div>
              <span className={cn("flex shrink-0 items-center gap-1 text-xs font-semibold", meta.tone)}>
                <Icon className="size-3.5" /> {meta.label}
              </span>
            </div>
            {(changesWeight || a.suggested_reps != null) && (
              <p className="num text-sm">
                {changesWeight && (
                  <>
                    {formatWeight(a.current_weight_kg!, unit)} → <span className="font-bold">{formatWeight(a.suggested_weight_kg!, unit)}</span>
                  </>
                )}
                {changesWeight && a.suggested_reps != null && " · "}
                {a.suggested_reps != null && (
                  <>
                    reps <span className="font-bold">{a.suggested_reps}{a.suggested_reps_max ? `-${a.suggested_reps_max}` : ""}</span>
                  </>
                )}
              </p>
            )}
            <p className="text-sm leading-snug">{a.reason}</p>
            <div className="flex items-center gap-2">
              {a.source === "ai" && (
                <span className="text-muted-foreground mr-auto flex items-center gap-1 text-xs">
                  <Sparkles className="size-3" /> Claude
                </span>
              )}
              <Button size="sm" variant="ghost" className={a.source === "ai" ? "" : "ml-auto"} disabled={busy === a.id} onClick={() => act(a.id, dismissAdjustment)}>
                Dismiss
              </Button>
              <Button size="sm" disabled={busy === a.id} onClick={() => act(a.id, applyAdjustment)}>
                Apply
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
