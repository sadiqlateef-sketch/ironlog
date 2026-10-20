"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cancelRestAlert, hideRestCountdown, onAppActiveChange, scheduleRestAlert, showRestCountdown } from "@/lib/native";
import { cueRestOver, cueRestTick } from "@/lib/cues";

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
  /** A screen is showing its own big timer (focus mode), so the bar steps aside. */
  inline: boolean;
  setInline: (on: boolean) => void;
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

export function RestTimerProvider({ children }: { children: ReactNode }) {
  // Safe to read storage during the first render: the timer bar only appears
  // after sign-in is known, which never happens in the prerendered HTML.
  const [timer, setTimer] = useState<TimerState | null>(() => (typeof window === "undefined" ? null : load()));
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);
  const [inline, setInline] = useState(false);

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

  // Lock screen / notification shade countdown, kept in step with +15 / -15.
  const endsAt = timer?.endsAt;
  const label = timer?.label ?? "";
  useEffect(() => {
    if (endsAt == null) return hideRestCountdown();
    showRestCountdown(endsAt, label);
  }, [endsAt, label]);

  // 3, 2, 1: a soft tick each second before the end.
  const whole = Math.ceil(remaining);
  const tickedAt = useRef<string | null>(null);
  useEffect(() => {
    if (!timer || whole < 1 || whole > 3 || timer.duration < 10) return;
    const key = `${timer.endsAt}:${whole}`;
    if (tickedAt.current === key) return;
    tickedAt.current = key;
    cueRestTick();
  }, [timer, whole]);

  useEffect(() => {
    if (timer && remaining <= 0 && firedFor.current !== timer.endsAt) {
      firedFor.current = timer.endsAt;
      cueRestOver();
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

  return <RestTimerContext value={{ timer, remaining, start, adjust, stop, inline, setInline }}>{children}</RestTimerContext>;
}

export function useRestTimer(): RestTimerApi {
  const ctx = use(RestTimerContext);
  if (!ctx) throw new Error("useRestTimer must be used inside <RestTimerProvider>");
  return ctx;
}
