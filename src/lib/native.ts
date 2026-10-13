"use client";

// Phone-only extras (Android app via Capacitor). Every function is safe to
// call on the web: it either does nothing or uses the browser fallback.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { KeepAwake } from "@capacitor-community/keep-awake";

export const isNative = () => Capacitor.isNativePlatform();

const REST_NOTIFICATION_ID = 1001;
const REST_CHANNEL = "rest-timer";

/** Light tap when a set is ticked off. */
export function tap(): void {
  if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Strong buzz for "rest is over". Returns false on the web so the caller can use its own fallback. */
export function buzz(): boolean {
  if (!isNative()) return false;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  return true;
}

/** Keep the screen on during a workout so you don't unlock between sets. */
export function keepScreenOn(on: boolean): void {
  if (!isNative()) return;
  (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
}

/** Runs once at app start: hide the splash screen and set up the notification channel. */
export async function initNative(): Promise<void> {
  if (!isNative()) return;
  await SplashScreen.hide().catch(() => {});
  await LocalNotifications.createChannel({
    id: REST_CHANNEL,
    name: "Rest timer",
    description: "Tells you when your rest is over",
    importance: 5,
    vibration: true,
    visibility: 1,
  }).catch(() => {});
}

/**
 * Schedule the "rest over" alert for when the app is in the background
 * (JavaScript timers pause then). Asks for notification permission the first time.
 */
export async function scheduleRestAlert(endsAt: number, label: string): Promise<void> {
  if (!isNative() || endsAt <= Date.now() + 1000) return;
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === "prompt" || display === "prompt-with-rationale") ({ display } = await LocalNotifications.requestPermissions());
    if (display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: "Rest over",
          body: label ? `Next set: ${label}` : "Time for your next set",
          channelId: REST_CHANNEL,
          schedule: { at: new Date(endsAt), allowWhileIdle: true },
          autoCancel: true,
        },
      ],
    });
  } catch {
    // Notifications are a bonus; the in-app timer still works.
  }
}

export async function cancelRestAlert(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] }).catch(() => {});
}

/** Calls back with true when the app comes to the front and false when it goes to the background. */
export function onAppActiveChange(cb: (active: boolean) => void): () => void {
  if (!isNative()) return () => {};
  const handle = App.addListener("appStateChange", ({ isActive }) => cb(isActive));
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}

/**
 * Android 14+ turns off exact alarms by default, which can make the rest alert
 * fire late. "denied" means it's worth asking the lifter to allow them.
 */
export async function exactAlarmStatus(): Promise<"granted" | "denied" | "n/a"> {
  if (!isNative()) return "n/a";
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    return exact_alarm === "granted" ? "granted" : "denied";
  } catch {
    return "n/a";
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.changeExactNotificationSetting().catch(() => {});
}
