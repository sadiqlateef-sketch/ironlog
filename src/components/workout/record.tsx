"use client";

import { useEffect } from "react";
import { Trophy } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import type { RecordHit } from "@/hooks/use-workout";
import { cn } from "@/lib/utils";

/** The gold "1 New Record" pill on workout cards and the finish screen. */
export function RecordBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "bg-record/15 text-record inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
        className,
      )}
    >
      <Trophy className="size-3.5" />
      {count} New Record{count === 1 ? "" : "s"}
    </span>
  );
}

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 6) * 60}ms`,
  color: ["var(--record)", "var(--primary-text)", "var(--success)", "var(--set-failure)", "var(--ai)"][i % 5],
  drift: `${((i * 53) % 120) - 60}px`,
}));

/** Pops up in the logger when a set beats your best for that lift, then fades on its own. */
export function RecordCelebration({ hit, onDone }: { hit: RecordHit; onDone: () => void }) {
  const { unit } = useAuth();
  useEffect(() => {
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <button
      type="button"
      onClick={onDone}
      role="status"
      aria-live="assertive"
      className="animate-in fade-in zoom-in-95 fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-40 mx-auto max-w-md overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--record)_45%,transparent)] bg-[#1d1a14]/95 p-4 text-left shadow-[0_0_40px_rgb(255_207_92/0.35)] backdrop-blur-xl"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="record-confetti absolute top-0 h-2.5 w-1.5 rounded-sm"
            style={{ left: c.left, background: c.color, animationDelay: c.delay, ["--drift" as string]: c.drift }}
          />
        ))}
      </span>
      <span className="relative flex items-center gap-3">
        <span className="bg-record grid size-12 shrink-0 place-items-center rounded-full text-[#2a2000]">
          <Trophy className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="text-record block text-lg leading-tight font-extrabold">New record!</span>
          <span className="block truncate font-semibold">{hit.exercise}</span>
          <span className="text-muted-foreground block text-sm">
            <span className="text-foreground num font-bold">
              {hit.weight} {unit === "imperial" ? "lb" : "kg"} × {hit.reps}
            </span>{" "}
            · your strongest set yet
          </span>
        </span>
      </span>
    </button>
  );
}
