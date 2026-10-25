import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";
import { handleMockRequest } from "./mock-backend.ts";

let client: SupabaseClient<Database> | undefined;

/**
 * True when the app has no Supabase project to talk to (local testing and
 * the smoke test). Then the local test backend in mock-backend.ts answers
 * everything. Real builds always have both settings.
 */
export function isLocalBackend(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

/**
 * One shared Supabase client for the whole app. The session is kept in local
 * storage, which works the same in a browser tab and inside the Capacitor
 * Android shell.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ironlog.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";

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

/** Database calls give up after 12 seconds, so a dead connection doesn't freeze logging. (Without Supabase settings, the local test backend answers instead.) */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  if (isLocalBackend()) {
    try {
      const mockRes = await handleMockRequest(input, init);
      if (mockRes) return mockRes;
    } catch (err) {
      console.warn("Local test backend:", err);
    }
  }

  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!href.includes("/rest/v1/") || init?.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(12_000) });
};
