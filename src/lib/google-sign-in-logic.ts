// The parts of Google sign-in that don't touch the phone, so tests can run them.

/** Where Google (through Supabase) sends you back into the Android app. */
export const APP_AUTH_CALLBACK = "com.ironlog.app://auth-callback";

export type AuthCallback = { code: string } | { error: string } | null;

/**
 * Reads the link Supabase opens after Google sign-in. Returns the one-time
 * code to trade for a session, a readable error, or null when the link isn't
 * a sign-in callback at all.
 */
export function parseAuthCallback(url: string): AuthCallback {
  if (!url.startsWith(APP_AUTH_CALLBACK)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Google sign-in sent back a link Ironlog couldn't read. Try again." };
  }
  // Errors can come in the query (?error=) or, from some providers, the fragment.
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.replace(/^#/, "")).forEach((v, k) => params.has(k) || params.set(k, v));
  const code = params.get("code");
  if (code) return { code };
  const error = params.get("error_description") ?? params.get("error");
  if (error === "access_denied") return { error: "Google sign-in was cancelled." };
  return { error: error ? error.replace(/\+/g, " ") : "Google sign-in didn't finish. Try again." };
}
