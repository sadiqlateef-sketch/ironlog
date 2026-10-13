// Watch side of linking (server: supabase/functions/watch-pair).
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "./supabase";

export interface Pairing {
  pairing_id: string;
  secret: string;
  code: string;
  expires_at: string;
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

export const startPairing = () => call<Pairing>({ action: "start" });

/** Checks once. Resolves "linked" after signing the watch in, or "pending" / "expired". */
export async function checkPairing(p: Pairing): Promise<"linked" | "pending" | "expired"> {
  const r = await call<{ status: "pending" | "expired" | "ready"; token_hash?: string }>({
    action: "poll",
    pairing_id: p.pairing_id,
    secret: p.secret,
  });
  if (r.status !== "ready" || !r.token_hash) return r.status === "ready" ? "expired" : r.status;
  const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
  if (error) throw error;
  return "linked";
}
