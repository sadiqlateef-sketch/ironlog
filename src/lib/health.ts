"use client";

// Android Health Connect: send finished workouts there, and bring back heart
// rate (for each workout's average and peak) and body weight (Body tab).
// The native side is android/app/src/main/java/com/ironlog/app/HealthConnectPlugin.kt.
// Everything here is a no-op on the web.

import { registerPlugin } from "@capacitor/core";
import { localDay } from "@/lib/body";
import { listMeasurements, saveMeasurement } from "@/lib/body-api";
import { fingerprint, thinHeartRate, toHealthWorkout, weightsToImport, type FinishedSet, type HealthWorkout } from "@/lib/health-logic";
import { isNative } from "@/lib/native";
import { getSupabase } from "@/lib/supabase/client";
import type { UnitSystem } from "@/lib/units";

export type HealthPermissionName = "writeWorkouts" | "writeDistance" | "readHeartRate" | "readWeight";
export type HealthStatus = {
  available: boolean;
  /** Why it isn't available: Health Connect isn't installed, needs an update, or the phone is too old. */
  reason?: "not_installed" | "update_required" | "unsupported";
  granted: HealthPermissionName[];
};

interface HealthConnectPlugin {
  status(): Promise<HealthStatus>;
  askPermissions(): Promise<HealthStatus>;
  openHealthConnect(): Promise<void>;
  writeWorkouts(o: { workouts: (HealthWorkout & { version: number })[] }): Promise<{ written: number }>;
  deleteWorkouts(o: { ids: string[] }): Promise<void>;
  readHeartRate(o: { start: string; end: string }): Promise<{ samples: { time: string; bpm: number }[] }>;
  readWeight(o: { start: string; end: string }): Promise<{ records: { time: string; kg: number }[] }>;
}

const HealthConnect = registerPlugin<HealthConnectPlugin>("HealthConnect");

const PREF = "ironlog:health-connect";
/** How far back workouts are sent and weights are read. */
const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

type Prefs = {
  on: boolean;
  /** Workouts already in Health Connect: id -> fingerprint and end time. */
  sent: Record<string, { f: string; end: string }>;
  /** Workouts whose heart rate was already looked up. */
  hrDone: string[];
  /** Weights were read up to this time. */
  weightsUntil?: string;
  lastSync?: string;
};

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) ?? "null");
    if (p && typeof p === "object") return { on: !!p.on, sent: p.sent ?? {}, hrDone: p.hrDone ?? [], weightsUntil: p.weightsUntil, lastSync: p.lastSync };
  } catch {}
  return { on: false, sent: {}, hrDone: [] };
}

function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREF, JSON.stringify(p));
  } catch {}
}

export const healthConnectOn = () => isNative() && readPrefs().on;
export const lastHealthSync = () => readPrefs().lastSync ?? null;

export async function healthStatus(): Promise<HealthStatus | null> {
  if (!isNative()) return null;
  try {
    return await HealthConnect.status();
  } catch {
    return null;
  }
}

/** Shows Health Connect's permission screen, and turns syncing on if anything was allowed. */
export async function connectHealth(): Promise<HealthStatus> {
  const status = await HealthConnect.askPermissions();
  if (status.granted.length) writePrefs({ ...readPrefs(), on: true });
  return status;
}

/** Stops sending and reading. What's already in Health Connect stays there. */
export function disconnectHealth(): void {
  writePrefs({ ...readPrefs(), on: false });
}

export const openHealthConnect = () => HealthConnect.openHealthConnect().catch(() => {});

export type SyncResult = { workouts: number; removed: number; heartRate: number; weights: number };

let running: Promise<SyncResult | null> | null = null;

/**
 * Sends new or changed workouts from the last 30 days, removes ones you
 * deleted, fills in heart rate for workouts without it, and imports weigh-ins.
 * Safe to call often; never throws (returns null when it couldn't run).
 */
export function syncHealthConnect(unit: UnitSystem): Promise<SyncResult | null> {
  if (!healthConnectOn()) return Promise.resolve(null);
  running ??= sync(unit)
    .catch((e) => {
      console.warn("Health Connect sync failed", e);
      return null;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

type SessionRow = {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string;
  avg_hr: number | null;
  workout_sets: (Omit<FinishedSet, "exercise"> & { is_completed: boolean; exercises: FinishedSet["exercise"] | null })[];
};

async function sync(unit: UnitSystem): Promise<SyncResult> {
  const status = await HealthConnect.status();
  const result: SyncResult = { workouts: 0, removed: 0, heartRate: 0, weights: 0 };
  if (!status.available) return result;
  const can = new Set(status.granted);
  const prefs = readPrefs();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const { data, error } = await getSupabase()
    .from("workout_sessions")
    .select("id, name, start_time, end_time, avg_hr, workout_sets(set_type, weight, reps, duration_seconds, distance_m, is_completed, exercises(name, slug, tracking))")
    .not("end_time", "is", null)
    .gte("end_time", since.toISOString())
    .order("end_time");
  if (error) throw new Error(error.message);
  const sessions = (data ?? []) as unknown as SessionRow[];

  // 1. Workouts
  if (can.has("writeWorkouts")) {
    const sent: Prefs["sent"] = {};
    const toSend: (HealthWorkout & { version: number })[] = [];
    for (const s of sessions) {
      const sets = s.workout_sets
        .filter((x) => x.is_completed && x.exercises)
        .map((x) => ({ ...x, weight: Number(x.weight), distance_m: x.distance_m == null ? null : Number(x.distance_m), exercise: x.exercises! }));
      const w = toHealthWorkout({ ...s, sets }, unit);
      if (!w) continue;
      const f = fingerprint(w);
      sent[s.id] = { f, end: s.end_time };
      if (prefs.sent[s.id]?.f !== f) toSend.push({ ...w, version: now.getTime() });
    }
    // Sent before, still inside the window, but gone from Ironlog: it was deleted.
    const gone = Object.entries(prefs.sent)
      .filter(([id, v]) => !sent[id] && Date.parse(v.end) >= since.getTime())
      .map(([id]) => id);
    if (toSend.length) result.workouts = (await HealthConnect.writeWorkouts({ workouts: toSend })).written;
    if (gone.length) {
      await HealthConnect.deleteWorkouts({ ids: gone });
      result.removed = gone.length;
    }
    prefs.sent = sent;
  }

  // 2. Heart rate for workouts that don't have any (no watch linked, say).
  if (can.has("readHeartRate")) {
    const done = new Set(prefs.hrDone);
    for (const s of sessions) {
      if (s.avg_hr != null || done.has(s.id)) continue;
      const { samples } = await HealthConnect.readHeartRate({ start: s.start_time, end: s.end_time });
      const rows = thinHeartRate(samples).map((r) => ({ ...r, session_id: s.id, source: "phone" as const }));
      if (rows.length) {
        const { error: hrError } = await getSupabase()
          .from("heart_rate_samples")
          .upsert(rows, { onConflict: "session_id,recorded_at", ignoreDuplicates: true });
        if (!hrError) result.heartRate++;
      }
      // Watches can take a while to sync, so keep looking for a day before giving up.
      if (rows.length || now.getTime() - Date.parse(s.end_time) > DAY_MS) done.add(s.id);
    }
    const inWindow = new Set(sessions.map((s) => s.id));
    prefs.hrDone = [...done].filter((id) => inWindow.has(id));
  }

  // 3. Weigh-ins from scales and other apps, for days without one in Ironlog.
  if (can.has("readWeight")) {
    const from = prefs.weightsUntil && Date.parse(prefs.weightsUntil) > since.getTime() ? new Date(prefs.weightsUntil) : since;
    const { records } = await HealthConnect.readWeight({ start: new Date(from.getTime() - DAY_MS).toISOString(), end: now.toISOString() });
    if (records.length) {
      const have = new Set((await listMeasurements()).filter((m) => m.weight_kg != null).map((m) => m.measured_on));
      for (const { day, kg } of weightsToImport(records, have, localDay)) {
        await saveMeasurement(day, { weight_kg: kg });
        result.weights++;
      }
    }
    prefs.weightsUntil = now.toISOString();
  }

  prefs.lastSync = now.toISOString();
  // Someone may have turned it off while this ran.
  writePrefs({ ...prefs, on: readPrefs().on });
  return result;
}
