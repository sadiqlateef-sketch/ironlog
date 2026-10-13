// JavaScript side of HeartRateModule.kt. On anything without the native module
// (the browser preview, tests) every call is a harmless no-op.
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform, type Permission } from "react-native";

interface HeartRateNative {
  isAvailable(): Promise<boolean>;
  start(): void;
  stop(): void;
  setKeepScreenOn(on: boolean): void;
}

const native: HeartRateNative | undefined = NativeModules.IronlogHeartRate;
const emitter = native ? new NativeEventEmitter(NativeModules.IronlogHeartRate) : null;

/** Android 16+ uses the new health permission; older versions use BODY_SENSORS. */
const PERMISSION = (
  Platform.OS === "android" && Number(Platform.Version) >= 36 ? "android.permission.health.READ_HEART_RATE" : "android.permission.BODY_SENSORS"
) as Permission;

export async function requestHeartRate(): Promise<boolean> {
  if (!native || !(await native.isAvailable().catch(() => false))) return false;
  if (await PermissionsAndroid.check(PERMISSION)) return true;
  return (await PermissionsAndroid.request(PERMISSION)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** Starts the sensor and calls back with each reading. Returns a stop function. */
export function watchHeartRate(onReading: (r: { bpm: number; at: number }) => void): () => void {
  if (!native || !emitter) return () => {};
  const sub = emitter.addListener("IronlogHeartRate", (e) => onReading(e as { bpm: number; at: number }));
  native.start();
  return () => {
    sub.remove();
    native.stop();
  };
}

export function keepScreenOn(on: boolean): void {
  native?.setKeepScreenOn(on);
}
