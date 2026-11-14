"use client";

// Phone-only extras (Android app via Capacitor). Every function is safe to
// call on the web: it either does nothing or uses the browser fallback.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications, Weekday } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { deepLinkPath } from "@/services/ironlogEcosystemSync";

export const isNative = () => Capacitor.isNativePlatform();

const REST_NOTIFICATION_ID = 1001;
const REST_CHANNEL = "rest-timer";
const RECOVERY_NOTIFICATION_ID = 1002;
const REMINDER_CHANNEL = "reminders";
const RECOVERY_PREF = "ironlog:recovery-reminder";
const HOME_NOTIFICATION_ID = 1003;
const HOME_PREF = "ironlog:home-reminder";
const RECAP_NOTIFICATION_ID = 1004;
const CAFFEINE_NOTIFICATION_ID = 1006;
const CAFFEINE_PREF = "ironlog:caffeine-cutoff-alert";
const FOOD_NUDGE_NOTIFICATION_ID = 1005;
const FOOD_NUDGE_PREF = "ironlog:food-nudge-time";

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
    description: "Recovery-day tips and your nightly home workout",
    importance: 3,
    visibility: 1,
  }).catch(() => {});
  // ironlog://food (the home-screen widget) opens Add food, at launch or while running.
  const openLink = (url: string | undefined) => {
    const path = deepLinkPath(url);
    if (path && window.location.pathname !== path) window.location.assign(path);
  };
  App.getLaunchUrl()
    .then((r) => openLink(r?.url))
    .catch(() => {});
  App.addListener("appUrlOpen", ({ url }) => openLink(url)).catch(() => {});
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

/** The nightly "Use What You Got" reminder: off, or the time it goes off ("19:30"). */
export function homeReminderTime(): string | null {
  try {
    const v = localStorage.getItem(HOME_PREF);
    return v && /^\d{2}:\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Turn the nightly home-workout reminder on at `time` ("19:30"), or off with null. Returns the time it's set for. */
export async function setHomeReminder(time: string | null): Promise<string | null> {
  if (!isNative()) return null;
  await LocalNotifications.cancel({ notifications: [{ id: HOME_NOTIFICATION_ID }] }).catch(() => {});
  if (time && !(await requestNotifications())) time = null;
  if (time) {
    const [hour, minute] = time.split(":").map(Number);
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: HOME_NOTIFICATION_ID,
            title: "Use What You Got",
            body: "Tonight's 15–25 minute home workout is ready. Built from your home kit.",
            channelId: REMINDER_CHANNEL,
            schedule: { on: { hour, minute }, allowWhileIdle: true },
            autoCancel: true,
          },
        ],
      });
    } catch {
      time = null;
    }
  }
  try {
    if (time) localStorage.setItem(HOME_PREF, time);
    else localStorage.removeItem(HOME_PREF);
  } catch {}
  return time;
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

/** Caffeine cutoff alert on this phone (off until turned on on the food diary). */
export function caffeineAlertOn(): boolean {
  try {
    return localStorage.getItem(CAFFEINE_PREF) === "1";
  } catch {
    return false;
  }
}

/** Turn the caffeine cutoff alert on (asks Android for notifications) or off. Returns whether it's on. */
export async function setCaffeineAlert(on: boolean): Promise<boolean> {
  if (on && !(await requestNotifications())) on = false;
  try {
    localStorage.setItem(CAFFEINE_PREF, on ? "1" : "0");
  } catch {}
  if (!on) await scheduleCaffeineCutoff(null);
  return on;
}

/**
 * "Last caffeine for today" at the cutoff the app worked out from the user's
 * own half-life and threshold settings. Null (or a time already past) clears it.
 * Opt-in; never asks for permission itself.
 */
export async function scheduleCaffeineCutoff(at: Date | null): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: CAFFEINE_NOTIFICATION_ID }] }).catch(() => {});
  if (!at || at.getTime() <= Date.now() + 60_000 || !caffeineAlertOn()) return;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: CAFFEINE_NOTIFICATION_ID,
          title: "Caffeine cutoff",
          body: "From your caffeine settings, this is the last time for a drink like your last one.",
          channelId: REMINDER_CHANNEL,
          schedule: { at, allowWhileIdle: true },
          autoCancel: true,
        },
      ],
    });
  } catch {
    // The cutoff still shows on the food diary.
  }
}

/** The evening food nudge time ("HH:MM") on this phone, or null when off (the default). */
export function foodNudgeTime(): string | null {
  try {
    const v = localStorage.getItem(FOOD_NUDGE_PREF);
    return v && /^([01]\d|2[0-3]):([0-5]\d)$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Turn the food nudge on at `time` (asks Android for notifications) or off (null). Returns the time kept. */
export async function setFoodNudgeTime(time: string | null): Promise<string | null> {
  if (time !== null && isNative() && !(await requestNotifications())) time = null;
  try {
    if (time === null) localStorage.removeItem(FOOD_NUDGE_PREF);
    else localStorage.setItem(FOOD_NUDGE_PREF, time);
  } catch {}
  if (time === null) await cancelFoodNudge();
  return time;
}

export async function cancelFoodNudge(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: FOOD_NUDGE_NOTIFICATION_ID }] }).catch(() => {});
}

/** "Log today's food" at `at` (from nudge.ts). Replaces any earlier one; null clears. Never asks for permission itself. */
export async function scheduleFoodNudge(at: Date | null): Promise<void> {
  if (!isNative()) return;
  await cancelFoodNudge();
  if (!at || at.getTime() <= Date.now() + 60_000 || foodNudgeTime() === null) return;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: FOOD_NUDGE_NOTIFICATION_ID,
          title: "Food log",
          body: "Nothing logged for today yet. Open IronLog to add what you ate.",
          channelId: REMINDER_CHANNEL,
          schedule: { at, allowWhileIdle: true },
          autoCancel: true,
        },
      ],
    });
  } catch {
    // The diary still works without it.
  }
}

const LEFTOVER_PREF = "ironlog-leftover-reminders";
const LEFTOVER_FIRST_ID = 1100;
const LEFTOVER_IDS = 20;

/** Whether "use your leftovers" reminders are on (off until turned on). */
export function leftoverRemindersOn(): boolean {
  try {
    return localStorage.getItem(LEFTOVER_PREF) === "1";
  } catch {
    return false;
  }
}

/** Turn leftover reminders on (asks Android for notifications) or off. Returns the state kept. */
export async function setLeftoverReminders(on: boolean): Promise<boolean> {
  if (on && isNative() && !(await requestNotifications())) on = false;
  try {
    if (on) localStorage.setItem(LEFTOVER_PREF, "1");
    else localStorage.removeItem(LEFTOVER_PREF);
  } catch {}
  if (!on) await scheduleLeftoverReminders([]);
  return on;
}

/** Replace all leftover reminders (ids 1100-1119) with `list` (from leftovers.ts reminderTimes). Never asks for permission itself. */
export async function scheduleLeftoverReminders(list: readonly { at: Date; labels: string[] }[]): Promise<void> {
  if (!isNative()) return;
  const ids = Array.from({ length: LEFTOVER_IDS }, (_, i) => ({ id: LEFTOVER_FIRST_ID + i }));
  await LocalNotifications.cancel({ notifications: ids }).catch(() => {});
  if (list.length === 0 || !leftoverRemindersOn()) return;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: list.slice(0, LEFTOVER_IDS).map((r, i) => ({
        id: LEFTOVER_FIRST_ID + i,
        title: "Use soon",
        body: `${r.labels.slice(0, 3).join(", ")}${r.labels.length > 3 ? ` and ${r.labels.length - 3} more` : ""} reaches its use-by date soon.`,
        channelId: REMINDER_CHANNEL,
        schedule: { at: r.at, allowWhileIdle: true },
        autoCancel: true,
      })),
    });
  } catch {
    // The use-soon list still shows on the recipes and pantry screens.
  }
}

/** Our own Android plugin (android/.../RestCountdownPlugin.java). */
const RestCountdown = registerPlugin<{
  show(o: { endsAt: number; label: string }): Promise<void>;
  hide(): Promise<void>;
}>("RestCountdown");

/**
 * Rest time counting down on the lock screen and in the notification shade.
 * Android runs the clock itself, so it keeps going while the app sleeps.
 * Silent; the "Rest over" alert is still scheduleRestAlert's job.
 */
export function showRestCountdown(endsAt: number, label: string): void {
  if (!isNative()) return;
  RestCountdown.show({ endsAt, label }).catch(() => {});
}

export function hideRestCountdown(): void {
  if (!isNative()) return;
  RestCountdown.hide().catch(() => {});
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
