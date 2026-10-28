"use client";

import { useEffect, useState } from "react";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { cn } from "@/lib/utils";

/**
 * Reactive Ambient Aura:
 * Floats behind the application interface and dynamically reacts to:
 * 1. Rest Timer: breathes with calming warmth during rest periods, subtly pulsing when ready.
 * 2. PR Records: triggers a brief energetic gold flare when a new record is achieved.
 */
export function ReactiveAmbient() {
  const { timer, remaining } = useRestTimer();
  const [prFlare, setPrFlare] = useState(false);

  // Listen for PR events dispatched during logging
  useEffect(() => {
    function onPrAchieved() {
      setPrFlare(true);
      const id = setTimeout(() => setPrFlare(false), 2000);
      return () => clearTimeout(id);
    }

    window.addEventListener("ironlog:pr", onPrAchieved);
    return () => window.removeEventListener("ironlog:pr", onPrAchieved);
  }, []);

  const resting = !!timer && remaining > 0;
  const almostReady = resting && remaining <= 5;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-0 transition-opacity duration-1000",
        resting ? "opacity-100 ambient-rest-active" : "opacity-60",
        almostReady && "animate-pulse",
        prFlare && "ambient-flare",
      )}
      style={{
        background: resting
          ? `radial-gradient(circle at 50% 20%, var(--glow-2) 0%, transparent 60%), radial-gradient(circle at 50% 80%, var(--glow-3) 0%, transparent 70%)`
          : undefined,
      }}
    />
  );
}
