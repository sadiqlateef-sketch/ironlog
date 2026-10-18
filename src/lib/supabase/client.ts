import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | undefined;

/**
 * One shared Supabase client for the whole app. The session is kept in local
 * storage, which works the same in a browser tab and inside the Capacitor
 * Android shell.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.",
    );
  }

  client = createClient<Database>(url, key, {
    // PKCE: Google sign-in comes back with a one-time code that only this
    // install can trade for a session (see src/lib/google-sign-in.ts).
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    // With bad signal, fail fast and let the offline queue retry (see src/lib/offline).
    db: { retry: false },
    global: { fetch: fetchWithTimeout },
  });
  return client;
}

/** Database calls give up after 12 seconds, so a dead connection doesn't freeze logging. */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!href.includes("/rest/v1/") || init?.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(12_000) });
};
