// Links a Wear OS watch to an account (see migration 20261013030000_watch_pairing.sql).
//
//   { action: "start" }                        watch, no account yet -> { pairing_id, secret, code, expires_at }
//   { action: "claim", code }                  signed-in phone/web    -> { ok: true }
//   { action: "poll", pairing_id, secret }     watch                  -> { status: "pending" | "expired" }
//                                                                       or { status: "ready", email, token_hash }
//
// The watch turns token_hash into a normal session with supabase.auth.verifyOtp.

import { adminClient, handle, HttpError, json, userClient } from "../_shared/http.ts";

const MAX_FAILED_CLAIMS = 10; // per user per 10 minutes

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Same result whatever the inputs, so timing doesn't leak how much of the hash matched. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function start(): Promise<Response> {
  const admin = adminClient();
  // Housekeeping: forget pairings that expired more than a day ago.
  await admin.from("watch_pairings").delete().lt("expires_at", new Date(Date.now() - 86_400_000).toISOString());

  const secret = randomSecret();
  const secret_hash = await sha256(secret);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from("watch_pairings")
      .insert({ code: randomCode(), secret_hash })
      .select("id, code, expires_at")
      .single();
    if (!error) return json({ pairing_id: data.id, secret, code: data.code, expires_at: data.expires_at });
    if (error.code !== "23505") throw error; // 23505 = that code is live already; pick another
  }
  throw new HttpError(503, "Couldn't make a pairing code. Try again.");
}

async function claim(req: Request, code: unknown): Promise<Response> {
  const { userId } = await userClient(req);
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the 6-digit code from your watch.");
  const admin = adminClient();

  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin
    .from("watch_pair_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_FAILED_CLAIMS) throw new HttpError(429, "Too many tries. Wait a few minutes and try again.");

  const { data: claimed, error } = await admin
    .from("watch_pairings")
    .update({ user_id: userId, claimed_at: new Date().toISOString() })
    .eq("code", code)
    .is("consumed_at", null)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw error;
  if (!claimed?.length) {
    await admin.from("watch_pair_attempts").insert({ user_id: userId });
    throw new HttpError(404, "That code didn't match. Check the watch and try again.");
  }
  return json({ ok: true });
}

async function poll(pairingId: unknown, secret: unknown): Promise<Response> {
  if (typeof pairingId !== "string" || typeof secret !== "string") throw new HttpError(400, "Missing pairing");
  const admin = adminClient();
  const { data: p } = await admin
    .from("watch_pairings")
    .select("id, secret_hash, user_id, expires_at, claimed_at, consumed_at")
    .eq("id", pairingId)
    .maybeSingle();
  if (!p || !sameHash(p.secret_hash, await sha256(secret))) throw new HttpError(404, "Unknown pairing");
  if (p.consumed_at || new Date(p.expires_at).getTime() < Date.now()) return json({ status: "expired" });
  if (!p.claimed_at || !p.user_id) return json({ status: "pending", expires_at: p.expires_at });

  // Use the pairing exactly once, even if two polls race.
  const { data: used } = await admin
    .from("watch_pairings")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", p.id)
    .is("consumed_at", null)
    .select("id");
  if (!used?.length) return json({ status: "expired" });

  const { data: u, error: userErr } = await admin.auth.admin.getUserById(p.user_id);
  if (userErr || !u.user?.email) throw new HttpError(500, "Couldn't find that account.");
  // A one-time sign-in token. Nothing is emailed: we hand the token to the watch directly.
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (error || !link.properties?.hashed_token) throw new HttpError(500, "Couldn't sign the watch in.");
  return json({ status: "ready", email: u.user.email, token_hash: link.properties.hashed_token });
}

Deno.serve(
  handle(async (req) => {
    const body = await req.json().catch(() => ({}));
    switch (body?.action) {
      case "start":
        return start();
      case "claim":
        return claim(req, body.code);
      case "poll":
        return poll(body.pairing_id, body.secret);
      default:
        throw new HttpError(400, "Unknown action");
    }
  }),
);
