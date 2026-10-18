"use client";

// Little sounds and buzzes so you know a set saved or rest is over without
// looking at the phone. Both can be turned off in the logger's display options.

import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "@/lib/native";
import { loggerPrefs } from "@/lib/logger-prefs";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** One short tone with a soft fade so it clicks rather than pops. */
function tone(freq: number, at: number, length: number, volume = 0.18) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.frequency.value = freq;
  const t = a.currentTime + at;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function vibrate(native: () => Promise<void>, web: number | number[]) {
  try {
    if (isNative()) native().catch(() => {});
    else navigator.vibrate?.(web);
  } catch {}
}

/** A set was ticked off: a firm tap and a quick two-note "got it". */
export function cueSetSaved(): void {
  const p = loggerPrefs();
  if (p.haptics) vibrate(() => Haptics.impact({ style: ImpactStyle.Medium }), 25);
  if (p.sounds) {
    tone(880, 0, 0.07, 0.12);
    tone(1320, 0.07, 0.09, 0.12);
  }
}

/** The last three seconds of rest: a soft tick each second. */
export function cueRestTick(): void {
  const p = loggerPrefs();
  if (p.sounds) tone(660, 0, 0.08, 0.1);
  if (p.haptics) vibrate(() => Haptics.impact({ style: ImpactStyle.Light }), 15);
}

/** Rest is over: three beeps and a strong buzz so you notice from across the rack. */
export function cueRestOver(): void {
  const p = loggerPrefs();
  if (p.haptics) vibrate(() => Haptics.notification({ type: NotificationType.Success }), [300, 150, 300]);
  if (p.sounds) [0, 0.25, 0.5].forEach((at) => tone(880, at, 0.15, 0.2));
}
