"use client";

// Sign in with Google. In the Android app Google opens in a browser tab, then
// Supabase sends you back to com.ironlog.app://auth-callback with a one-time
// code that's traded for a session here (PKCE, so the code is useless to any
// other app). In a browser tab Supabase sends you back to the site and
// supabase-js picks the code up from the address bar by itself.

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { isNative } from "@/lib/native";
import { getSupabase } from "@/lib/supabase/client";
import { APP_AUTH_CALLBACK, parseAuthCallback } from "@/lib/google-sign-in-logic";

/** The login screen waiting on the result, if it's open. */
let waiting: ((error: string | null) => void) | null = null;
let lastCode = "";
/** True while a code from Google is being traded for a session. */
let exchanging = false;

/**
 * Starts Google sign-in. Resolves with an error message, "" if you closed
 * Google without finishing, or null once you're signed in (in a browser tab:
 * once the page is on its way to Google).
 */
export async function signInWithGoogle(): Promise<string | null> {
  const native = isNative();
  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: native ? APP_AUTH_CALLBACK : window.location.origin,
      skipBrowserRedirect: native,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) return friendly(error.message);
  if (!native) return null;

  return new Promise((resolve) => {
    let finished: { remove: () => Promise<void> } | undefined;
    waiting = (err) => {
      waiting = null;
      finished?.remove().catch(() => {});
      resolve(err);
    };
    // Closing the tab without finishing. The callback link, when it comes,
    // arrives a moment after the tab closes, so give it a beat first.
    Browser.addListener("browserFinished", () => {
      setTimeout(() => exchanging || waiting?.(""), 1500);
    }).then((h) => (finished = h));
    Browser.open({ url: data.url }).catch(() => waiting?.("Couldn't open Google sign-in."));
  });
}

/**
 * Catches the link back from Google, including when Android had to restart
 * Ironlog while you were signing in. Call once when the app starts.
 */
export function listenForGoogleSignIn(): () => void {
  if (!isNative()) return () => {};
  const handle = App.addListener("appUrlOpen", ({ url }) => void finish(url));
  App.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) void finish(launch.url);
    })
    .catch(() => {});
  return () => void handle.then((h) => h.remove()).catch(() => {});
}

async function finish(url: string) {
  const result = parseAuthCallback(url);
  if (!result) return;
  if ("error" in result) {
    Browser.close().catch(() => {});
    return waiting?.(result.error);
  }
  // The same link can arrive twice (launch URL and appUrlOpen); a code works once.
  if (result.code === lastCode) return;
  lastCode = result.code;
  exchanging = true;
  Browser.close().catch(() => {});
  const { error } = await getSupabase().auth.exchangeCodeForSession(result.code);
  exchanging = false;
  waiting?.(error ? friendly(error.message) : null);
}

function friendly(message: string): string {
  if (/provider is not enabled|Unsupported provider/i.test(message)) {
    return "Google sign-in isn't turned on for this app yet. See \"Sign in with Google\" in the README.";
  }
  return message;
}
