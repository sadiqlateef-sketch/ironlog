"use client";

// Forgot password: Supabase emails a link. Tapping it on the phone opens
// Ironlog (com.ironlog.app://reset-password) already signed in, and the
// sign-in screen asks for a new password. In a browser the link comes back to
// /login/?reset=1 and supabase-js reads the sign-in from the address itself.

import { App } from "@capacitor/app";
import { isNative } from "@/lib/native";
import { getSupabase } from "@/lib/supabase/client";
import { parseResetLink } from "@/lib/reset-link";

export const NATIVE_RESET_URL = "com.ironlog.app://reset-password";

export function resetRedirectUrl(): string {
  return isNative() ? NATIVE_RESET_URL : `${window.location.origin}/login/?reset=1`;
}

// ---- "Choose a new password" is showing (read by the sign-in screen) ----
let choosing = false;
let linkError: string | null = null;
const listeners = new Set<() => void>();
function set(next: boolean, error: string | null = null) {
  choosing = next;
  linkError = error;
  listeners.forEach((l) => l());
}
export const subscribeReset = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
export const isChoosingPassword = () => choosing;
export const resetLinkError = () => linkError;
export const doneChoosingPassword = () => set(false);

/** Watch for reset links for the life of the app. Calls onOpen when the new-password screen should show. */
export function listenForResetLinks(onOpen: () => void): () => void {
  if (!isNative()) {
    // detectSessionInUrl signs in from the link; just flag the screen.
    const q = new URLSearchParams(window.location.search);
    if (q.get("reset") === "1") {
      const err = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
      set(!err, err ? err.replace(/\+/g, " ") : null);
    }
    return () => {};
  }
  const handle = async (url: string | undefined) => {
    if (!url?.startsWith(NATIVE_RESET_URL)) return;
    const link = parseResetLink(url);
    if (!link) return;
    if ("error" in link) {
      set(false, `That reset link didn't work (${link.error}). Send a new one.`);
      onOpen();
      return;
    }
    set(true);
    const { error } = await getSupabase().auth.setSession(link);
    if (error) set(false, `That reset link didn't work (${error.message}). Send a new one.`);
    onOpen();
  };
  App.getLaunchUrl()
    .then((r) => handle(r?.url))
    .catch(() => {});
  const sub = App.addListener("appUrlOpen", ({ url }) => handle(url));
  return () => {
    sub.then((h) => h.remove()).catch(() => {});
  };
}
