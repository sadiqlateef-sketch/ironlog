"use client";

// How the workout logger looks and feels on this phone. Saved on the device
// (not your account), like the One/All view choice.

import { useSyncExternalStore } from "react";

export interface LoggerPrefs {
  /** Ironlog's own number pad instead of the phone keyboard for weights and reps. */
  keypad: boolean;
  /** How much the keypad's - / + change the weight: 5 or 2.5 (lb), 2.5 or 1.25 (kg). */
  smallStep: boolean;
  /** Main controls at the bottom of the screen, in reach of your thumb. */
  oneHanded: boolean;
  /** Only the set you're on and the rest timer. */
  focus: boolean;
  /** Short sound when a set is saved and beeps when rest ends. */
  sounds: boolean;
  /** Vibration on the same moments. */
  haptics: boolean;
}

const KEY = "ironlog.logger.prefs";
const DEFAULTS: LoggerPrefs = { keypad: true, smallStep: false, oneHanded: false, focus: false, sounds: true, haptics: true };

let cache: LoggerPrefs | null = null;
const listeners = new Set<() => void>();

export function loggerPrefs(): LoggerPrefs {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULTS;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<LoggerPrefs>) };
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function setLoggerPref<K extends keyof LoggerPrefs>(key: K, value: LoggerPrefs[K]): void {
  cache = { ...loggerPrefs(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLoggerPrefs(): LoggerPrefs {
  return useSyncExternalStore(subscribe, loggerPrefs, () => DEFAULTS);
}

/** The keypad's - / + step in the user's unit. */
export function weightStep(prefs: Pick<LoggerPrefs, "smallStep">, unit: "metric" | "imperial"): number {
  if (unit === "imperial") return prefs.smallStep ? 2.5 : 5;
  return prefs.smallStep ? 1.25 : 2.5;
}
