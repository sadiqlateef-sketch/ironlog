"use client";

// Gym check-in: where your gym is, whether you're there right now, and the
// Google Calendar link that gets long gym workouts added as events.

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Geolocation } from "@capacitor/geolocation";
import { isNative } from "@/lib/native";
import { getSupabase } from "@/lib/supabase/client";
import { isAtGym, type GymPlace, type LatLng } from "@/lib/gym-logic";

export * from "@/lib/gym-logic";

export type Fix = LatLng & { accuracy: number };

/**
 * Where you are now. Asks for location permission the first time; throws a
 * readable message if it can't. `maxAgeMs` allows a recent cached fix.
 */
export async function currentPosition(maxAgeMs = 0): Promise<Fix> {
  if (isNative()) {
    let perm = await Geolocation.checkPermissions().catch(() => null);
    if (perm && (perm.location === "prompt" || perm.location === "prompt-with-rationale")) perm = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
    if (perm && perm.location === "denied" && perm.coarseLocation !== "granted") {
      throw new Error("Ironlog needs location access. Turn it on in Android Settings > Apps > Ironlog > Permissions.");
    }
  }
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000, maximumAge: maxAgeMs });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/denied|permission/i.test(msg)) throw new Error("Location is blocked. Allow it for Ironlog, then try again.");
    throw new Error("Couldn't find your location. Check that location is on, then try again.");
  }
}

/** True/false if we could tell, null if there's no gym set or no location. */
export async function checkAtGym(gym: GymPlace | null): Promise<boolean | null> {
  if (!gym) return null;
  try {
    return isAtGym(await currentPosition(60_000), gym);
  } catch {
    return null;
  }
}

export async function markSessionAtGym(sessionId: string, atGym: boolean): Promise<void> {
  const { error } = await getSupabase().from("workout_sessions").update({ at_gym: atGym }).eq("id", sessionId).is("at_gym", null);
  if (error) throw new Error(error.message);
}

// ---------- Google Calendar (through the gym-calendar Edge Function) ----------

export type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
};
export type CalendarChoice = { id: string; name: string; primary: boolean };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("gym-calendar", { body });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const b = await ctx.json().catch(() => null);
      if (b?.error) throw new Error(b.error);
    }
    throw new Error(error.message ?? "Request failed");
  }
  return data as T;
}

export const calendarStatus = () => call<CalendarStatus>({ action: "status" });
export const listCalendars = () => call<{ calendars: CalendarChoice[] }>({ action: "calendars" }).then((r) => r.calendars);
export const chooseCalendar = (id: string) => call<{ calendar_id: string; calendar_name: string }>({ action: "choose", calendar_id: id });
export const disconnectCalendar = () => call<{ connected: false }>({ action: "disconnect" });

/** Adds any finished gym workouts that aren't on the calendar yet. Never throws. */
export async function syncGymCalendar(): Promise<number> {
  try {
    return (await call<{ added: number }>({ action: "sync" })).added;
  } catch {
    return 0;
  }
}

/**
 * Opens Google's sign-in. In the Android app that's a browser tab, which sends
 * you back into Ironlog when you're done; `onDone` runs then (or when you
 * come back to the app any other way).
 */
export async function connectCalendar(onDone: () => void): Promise<void> {
  const native = isNative();
  const { url } = await call<{ url: string }>({ action: "connect", return_to: native ? "app" : "web" });
  if (!native) {
    window.open(url, "_blank", "noopener");
    const back = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", back);
        onDone();
      }
    };
    document.addEventListener("visibilitychange", back);
    return;
  }
  const handles = await Promise.all([
    App.addListener("appUrlOpen", ({ url: u }) => {
      if (!u.startsWith("com.ironlog.app://gym-calendar")) return;
      Browser.close().catch(() => {});
      finish();
    }),
    Browser.addListener("browserFinished", () => finish()),
  ]);
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    handles.forEach((h) => h.remove().catch(() => {}));
    onDone();
  }
  await Browser.open({ url });
}
