"use client";

// Scan a food barcode with the phone's camera. In the Android app this opens
// Google's system barcode scanner (ML Kit, on-device, works offline once its
// module is installed). That scanner runs in its own screen and needs no camera
// permission. On the web there is no scanner: callers fall back to typing.
// The plugin is loaded lazily so the web build never runs it.

import { isNative } from "@/lib/native";

export type ScanOutcome =
  | { kind: "code"; raw: string; format: string | null }
  | { kind: "cancelled" }
  | { kind: "unavailable"; reason: string };

export interface ScanOptions {
  /** Called when the scanner module has to be downloaded first (one time, needs network). */
  onPreparing?: () => void;
}

const MODULE_WAIT_MS = 60_000;
const GENERIC = "The scanner couldn't start. Type the barcode instead.";

const loadPlugin = () => import("@capacitor-mlkit/barcode-scanning");

/** Whether this device can scan with the camera (Android app with a camera). */
export async function scannerAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { BarcodeScanner } = await loadPlugin();
    return (await BarcodeScanner.isSupported()).supported;
  } catch {
    return false;
  }
}

async function ensureModule(onPreparing?: () => void): Promise<boolean> {
  const { BarcodeScanner, GoogleBarcodeScannerModuleInstallState: State } = await loadPlugin();
  if ((await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()).available) return true;
  onPreparing?.();
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let remove: (() => void) | null = null;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      remove?.();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), MODULE_WAIT_MS);
    BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (e) => {
      if (e.state === State.COMPLETED) finish(true);
      else if (e.state === State.FAILED || e.state === State.CANCELED) finish(false);
    })
      .then((handle) => {
        remove = () => void handle.remove().catch(() => undefined);
        if (settled) remove();
        return BarcodeScanner.installGoogleBarcodeScannerModule();
      })
      .catch(() => finish(false));
  });
}

/** Open the scanner. Backing out is "cancelled", never an error. */
export async function scanBarcode(opts: ScanOptions = {}): Promise<ScanOutcome> {
  if (!isNative()) return { kind: "unavailable", reason: "web" };
  try {
    if (!(await scannerAvailable())) return { kind: "unavailable", reason: "This phone has no camera the scanner can use." };
    if (!(await ensureModule(opts.onPreparing))) {
      return { kind: "unavailable", reason: "The scanner isn't ready yet. Connect to the internet once, or type the barcode instead." };
    }
    const { BarcodeScanner, BarcodeFormat } = await loadPlugin();
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
      autoZoom: true,
    });
    const first = barcodes[0];
    if (!first?.rawValue) return { kind: "cancelled" };
    return { kind: "code", raw: first.rawValue, format: first.format ?? null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(message)) return { kind: "cancelled" };
    return { kind: "unavailable", reason: GENERIC };
  }
}

/**
 * Android can stop IronLog while the system scanner is open. The scan then
 * comes back when the app restarts instead of to `scanBarcode`. This passes
 * that late result on (a failed one counts as cancelled). Returns an unsubscribe.
 */
export function onRestoredScan(cb: (outcome: ScanOutcome) => void): () => void {
  if (!isNative()) return () => {};
  let remove: (() => void) | null = null;
  let stopped = false;
  import("@capacitor/app")
    .then(({ App }) =>
      App.addListener("appRestoredResult", (e) => {
        if (e.pluginId !== "BarcodeScanner" || e.methodName !== "scan") return;
        const first = e.success ? (e.data as { barcodes?: { rawValue?: string; format?: string }[] } | undefined)?.barcodes?.[0] : undefined;
        cb(first?.rawValue ? { kind: "code", raw: first.rawValue, format: first.format ?? null } : { kind: "cancelled" });
      }),
    )
    .then((handle) => {
      remove = () => void handle.remove().catch(() => undefined);
      if (stopped) remove();
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    remove?.();
  };
}
