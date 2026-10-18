"use client";

// Phone-only extras (Android app via Capacitor). Every function is safe to
// call on the web: it either does nothing or uses the browser fallback.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications, Weekday } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { KeepAwake } from "@capacitor-community/keep-awake";

export const isNative = () => Capacitor.isNativePlatform();

const REST_NOTIFICATION_ID = 1001;
const REST_CHANNEL = "rest-timer";
const RECOVERY_NOTIFICATION_ID = 1002;
const REMINDER_CHANNEL = "reminders";
const RECOVERY_PREF = "ironlog:recovery-reminder";
const RECAP_NOTIFICATION_ID = 1004;

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
  await LocalNotifications.createChannel({
    id: REMINDER_CHANNEL,
    name: "Reminders",
    description: "Recovery-day tips the morning after a workout",
    importance: 3,
    visibility: 1,
  }).catch(() => {});
}

/**
 * Schedule the "rest over" alert for when the app is in the background
 * (JavaScript timers pause then). Only when notifications are already allowed:
 * the app is going to the background here, so Android couldn't show its prompt.
 * The workout screen asks first, with an explanation (see restAlertStatus).
 */
export async function scheduleRestAlert(endsAt: number, label: string): Promise<void> {
  if (!isNative() || endsAt <= Date.now() + 1000) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
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

/**
 * Whether rest alerts can reach a locked phone:
 * "ask" (notifications not decided yet), "blocked" (turned off), "late"
 * (allowed, but Android 14+ exact alarms are off), "ok", or "n/a" in a browser.
 */
export async function restAlertStatus(): Promise<"ask" | "blocked" | "late" | "ok" | "n/a"> {
  if (!isNative()) return "n/a";
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === "prompt" || display === "prompt-with-rationale") return "ask";
    if (display !== "granted") return "blocked";
    return (await exactAlarmStatus()) === "denied" ? "late" : "ok";
  } catch {
    return "n/a";
  }
}

/** Ask Android to allow notifications (call only after explaining why). */
export async function requestNotifications(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await LocalNotifications.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

/** Recovery-day reminder on this phone (off until turned on in Settings). */
export function recoveryReminderOn(): boolean {
  try {
    return localStorage.getItem(RECOVERY_PREF) === "1";
  } catch {
    return false;
  }
}

/** Turn the reminder on (asks Android for notifications) or off. Returns whether it's on. */
export async function setRecoveryReminder(on: boolean): Promise<boolean> {
  if (on && !(await requestNotifications())) on = false;
  try {
    localStorage.setItem(RECOVERY_PREF, on ? "1" : "0");
  } catch {}
  if (!on) await cancelRecoveryReminder();
  return on;
}

/** After a workout: remind tomorrow morning that it's a recovery day. */
export async function scheduleRecoveryReminder(at: Date, title: string, body: string): Promise<void> {
  if (!isNative() || !recoveryReminderOn()) return;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [{ id: RECOVERY_NOTIFICATION_ID, title, body, channelId: REMINDER_CHANNEL, schedule: { at, allowWhileIdle: true }, autoCancel: true }],
    });
  } catch {
    // A missed tip is fine.
  }
}

/** Starting another workout makes tomorrow's "recovery day" wrong, so drop it. */
export async function cancelRecoveryReminder(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: RECOVERY_NOTIFICATION_ID }] }).catch(() => {});
}

/**
 * "Your weekly recap is ready" every Sunday at 6 PM. Only when notifications
 * are already allowed (the app never asks just for this). Safe to call often:
 * it replaces the same notification.
 */
export async function scheduleRecapReminder(): Promise<void> {
  if (!isNative()) return;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: RECAP_NOTIFICATION_ID,
          title: "Your weekly recap is ready",
          body: "See your wins and what to focus on next week.",
          channelId: REMINDER_CHANNEL,
          schedule: { on: { weekday: Weekday.Sunday, hour: 18, minute: 0 }, allowWhileIdle: true },
          autoCancel: true,
        },
      ],
    });
  } catch {
    // The recap is still on the Progress tab.
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

/**
 * Share a file (an image, a CSV...): the Android share sheet in the app, the browser's share
 * sheet where it has one, otherwise a download. Returns which one happened.
 */
export async function shareImage(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  try {
    if (isNative()) {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      // Only cache/share/ is exposed to other apps (android/app/src/main/res/xml/file_paths.xml).
      const { uri } = await Filesystem.writeFile({ path: `share/${fileName}`, data, directory: Directory.Cache, recursive: true });
      await Share.share({ title, files: [uri], dialogTitle: title });
      return "shared";
    }
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
  } catch (e) {
    // Closing the share sheet isn't an error worth showing.
    if (/cancel|abort/i.test(String((e as Error)?.message ?? e)) || (e as Error)?.name === "AbortError") return "cancelled";
    throw e;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
