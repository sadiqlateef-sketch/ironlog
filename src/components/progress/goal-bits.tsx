"use client";

// Shared pieces for lift goals and bodyweight, used by the Lifts tab and the
// exercise detail sheet.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { GoalStatus } from "@/lib/insights";
import { latestBodyweightKg } from "@/lib/insights-api";
import type { PhysicalStats } from "@/types/database";
import { cn } from "@/lib/utils";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

const STATE_TEXT: Record<GoalStatus["state"], string> = {
  reached: "Reached",
  on_track: "On track",
  behind: "Behind pace",
  overdue: "Date passed",
  no_date: "No date",
  no_pace: "Need more data",
};

export function goalLine(g: GoalStatus, u: string): string {
  const pace = g.pacePerWeek;
  switch (g.state) {
    case "reached":
      return "You hit it. Set a new goal to keep going.";
    case "on_track":
      return `You're adding about ${pace!.toFixed(1)} ${u} a week. You need ${g.neededPerWeek!.toFixed(1)}.`;
    case "behind":
      return pace != null && pace > 0
        ? `You need about ${g.neededPerWeek!.toFixed(1)} ${u} a week. You're adding ${pace.toFixed(1)}.`
        : `You need about ${g.neededPerWeek!.toFixed(1)} ${u} a week, and this lift hasn't gone up lately.`;
    case "overdue":
      return `The date passed ${Math.abs(g.daysLeft!)} ${Math.abs(g.daysLeft!) === 1 ? "day" : "days"} ago. Pick a new date or keep going.`;
    case "no_pace":
      return "Log this lift a few more times to see your pace.";
    case "no_date":
      return g.eta
        ? `At your pace you'd get there around ${new Date(g.eta).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Add a date for a countdown.`
        : "Add a date to get a countdown.";
  }
}

export function countdown(days: number | null): string | null {
  if (days == null) return null;
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"} left`;
  return `${Math.round(days / 7)} weeks left`;
}

/** Progress bar from where you started to the goal, with the numbers under it. */
export function GoalBar({ status, goal, u }: { status: GoalStatus; goal: number; u: string }) {
  const tone = status.state === "reached" || status.state === "on_track" ? "bg-success" : status.state === "behind" || status.state === "overdue" ? "bg-set-warmup" : "bg-primary";
  return (
    <span className="flex flex-col gap-1">
      <span
        className="bg-background/40 block h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.pct}
        aria-label={`${status.pct}% of the way to ${num(goal)} ${u}`}
      >
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(3, status.pct)}%` }} />
      </span>
      <span className="flex items-baseline justify-between text-sm tabular-nums">
        <span>
          <span className="font-bold">{num(status.current)}</span>
          <span className="text-muted-foreground"> / {num(goal)} {u}</span>
        </span>
        <span className="text-muted-foreground text-xs font-semibold">
          {STATE_TEXT[status.state]}
          {status.state !== "reached" && status.remaining > 0 && ` · ${num(status.remaining)} ${u} to go`}
        </span>
      </span>
    </span>
  );
}

/** Your bodyweight in kg (newest log, else your profile) and its source date. */
export function useBodyweight() {
  const { profile } = useAuth();
  const fallback = ((profile?.physical_stats ?? {}) as PhysicalStats).bodyweight_kg;
  const [bw, setBw] = useState<{ kg: number; on: string | null } | null | undefined>(undefined);
  useEffect(() => {
    latestBodyweightKg(fallback).then(setBw).catch(() => setBw(fallback ? { kg: fallback, on: null } : null));
  }, [fallback]);
  return bw;
}

