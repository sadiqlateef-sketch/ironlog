"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { buzz, cancelRestAlert, onAppActiveChange, scheduleRestAlert } from "@/lib/native";

// The timer stores the moment it ENDS, not a countdown. That way it stays
// correct if the phone locks, the tab sleeps, or the page reloads.

const STORAGE_KEY = "ironlog.restTimer";

interface TimerState {
  endsAt: number; // epoch ms
  duration: number; // seconds, for the progress bar
  label: string;
}

interface RestTimerApi {
  timer: TimerState | null;
  /** Seconds left, updated 4x a second. */
  remaining: number;
  start: (seconds: number, label: string) => void;
  adjust: (deltaSeconds: number) => void;
  stop: () => void;
}

const RestTimerContext = createContext<RestTimerApi | null>(null);

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TimerState;
    return t.endsAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}

function save(t: TimerState | null) {
  try {
    if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode etc. The timer still works for this page view.
  }
}

/** Three short beeps plus a vibration so you notice from across the rack. */
function alertDone() {
  try {
    if (!buzz()) navigator.vibrate?.([300, 150, 300]);
  } catch {}
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.15);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  // Safe to read storage during the first render: the timer bar only appears
  // after sign-in is known, which never happens in the prerendered HTML.
  const [timer, setTimer] = useState<TimerState | null>(() => (typeof window === "undefined" ? null : load()));
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);

  const remaining = timer ? Math.max(0, (timer.endsAt - now) / 1000) : 0;

  // Android app: timers pause in the background, so hand the alert to the
  // phone's notification system while the app is hidden, and take it back
  // when the app returns (the in-app beep covers the foreground).
  const timerRef = useRef(timer);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);
  useEffect(
    () =>
      onAppActiveChange((active) => {
        const t = timerRef.current;
        if (active) cancelRestAlert();
        else if (t) scheduleRestAlert(t.endsAt, t.label);
      }),
    [],
  );

  useEffect(() => {
    if (timer && remaining <= 0 && firedFor.current !== timer.endsAt) {
      firedFor.current = timer.endsAt;
      alertDone();
      // Keep "0:00" on screen briefly, then clear.
      const id = setTimeout(() => {
        setTimer(null);
        save(null);
      }, 3000);
      return () => clearTimeout(id);
    }
  }, [timer, remaining]);

  const start = useCallback((seconds: number, label: string) => {
    if (seconds <= 0) return;
    const t = { endsAt: Date.now() + seconds * 1000, duration: seconds, label };
    setNow(Date.now());
    setTimer(t);
    save(t);
  }, []);

  const adjust = useCallback((delta: number) => {
    setTimer((t) => {
      if (!t) return t;
      const endsAt = Math.max(Date.now(), t.endsAt + delta * 1000);
      const next = { ...t, endsAt, duration: Math.max(1, t.duration + delta) };
      save(next);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setTimer(null);
    save(null);
  }, []);

  return <RestTimerContext value={{ timer, remaining, start, adjust, stop }}>{children}</RestTimerContext>;
}

export function useRestTimer(): RestTimerApi {
  const ctx = use(RestTimerContext);
  if (!ctx) throw new Error("useRestTimer must be used inside <RestTimerProvider>");
  return ctx;
}
