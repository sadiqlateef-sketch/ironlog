// The logger's number pad: what each key does to the field you're editing.
// Pure functions, no React, so they're easy to test.

import { formatDuration, parseDuration } from "./cardio.ts";
import { parseNumber } from "./workout-logic.ts";

export type KeypadKind = "weight" | "reps" | "time" | "distance";
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | ":" | "back";

const MAX_LENGTH = 7;

/**
 * Apply one key. `fresh` is true right after the pad opens: the first digit
 * replaces what's there (like selecting the field), so "225" -> tap 2,3,0 -> "230".
 */
export function pressKey(value: string, key: KeypadKey, kind: KeypadKind, fresh: boolean): string {
  const v = fresh ? "" : value;
  if (key === "back") return fresh ? "" : value.slice(0, -1);
  if (key === ".") {
    if (kind !== "weight" && kind !== "distance") return value;
    if (v.includes(".")) return v;
    return (v || "0") + ".";
  }
  if (key === ":") {
    if (kind !== "time" || !v || v.split(":").length > 2 || v.endsWith(":")) return value;
    return v + ":";
  }
  if (kind === "reps" && v === "0") return key;
  const next = v + key;
  if (next.length > MAX_LENGTH) return v;
  // Two decimals is plenty (1.25 kg plates).
  const dot = next.indexOf(".");
  if (dot >= 0 && next.length - dot - 1 > 2) return v;
  if (kind === "time" && next.includes(":") && next.split(":").at(-1)!.length > 2) return v;
  return next;
}

/** The - / + keys. Starts from the grey "last time" number when the field is empty. */
export function stepValue(value: string, placeholder: string, delta: number, kind: KeypadKind): string {
  if (kind === "time") {
    const base = parseDuration(value) ?? parseDuration(placeholder) ?? 0;
    return formatDuration(Math.max(0, base + delta));
  }
  const base = parseNumber(value) ?? parseNumber(placeholder) ?? 0;
  const next = Math.max(0, base + delta);
  if (kind === "reps") return String(Math.round(next));
  // Drop float noise (0.1 + 0.2) but keep 1.25 kg steps.
  return String(Math.round(next * 100) / 100);
}

/** How much one - / + press changes each kind of field. */
export function stepFor(kind: KeypadKind, weightStep: number): number {
  switch (kind) {
    case "weight":
      return weightStep;
    case "reps":
      return 1;
    case "time":
      return 5;
    case "distance":
      return 0.1;
  }
}

/** A drop set's starting weight: about 20% lighter, on the keypad's step. */
export function dropWeight(weight: number, step: number): number {
  if (weight <= 0) return 0;
  const target = weight * 0.8;
  return Math.max(step, Math.round(target / step) * step);
}
