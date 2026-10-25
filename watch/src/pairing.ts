// Watch side of linking (server: supabase/functions/watch-pair).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "./supabase";
import { DEFAULT_OFFLINE_PLAN, PLAN_KEY } from "./api";

export interface Pairing {
  pairing_id: string;
  secret: string;
  code: string;
  expires_at: string;
}

export const OFFLINE_KEY = "ironlog.offline_mode";

export async function isOfflineMode(): Promise<boolean> {
  const v = await AsyncStorage.getItem(OFFLINE_KEY);
  return v === "true";
}

export async function enableOfflineMode(): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_KEY, "true");
  const existing = await AsyncStorage.getItem(PLAN_KEY);
  if (!existing) {
    await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(DEFAULT_OFFLINE_PLAN));
  }
}

async function call<T>(body: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/watch-pair`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Pairing failed (${res.status})`);
  return data as T;
}

export async function startPairing(): Promise<Pairing> {
  // A made-up code here would look fine on the watch but could never be
  // entered on the phone, so say what's wrong instead ("Use offline" stays).
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT")) {
    throw new Error("This watch build has no server settings (watch/config.json). Rebuild it with them to link.");
  }
  try {
    return await call<Pairing>({ action: "start" });
  } catch (e) {
    // fetch throws a TypeError ("Network request failed") when there's no connection.
    if (e instanceof TypeError) throw new Error("Can't reach Ironlog. Check the watch's Wi-Fi or phone connection, then try again.");
    throw e;
  }
}

/** Checks once. Resolves "linked" after signing the watch in, or "pending" / "expired". */
export async function checkPairing(p: Pairing): Promise<"linked" | "pending" | "expired"> {
  try {
    const r = await call<{ status: "pending" | "expired" | "ready"; token_hash?: string }>({
      action: "poll",
      pairing_id: p.pairing_id,
      secret: p.secret,
    });
    if (r.status !== "ready" || !r.token_hash) return r.status === "ready" ? "expired" : r.status;
    const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
    if (error) throw error;
    return "linked";
  } catch {
    return "pending";
  }
}
