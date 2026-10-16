"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";
import { doneChoosingPassword, isChoosingPassword, resetLinkError, resetRedirectUrl, subscribeReset } from "@/lib/password-reset";

export default function LoginPage() {
  const { session } = useAuth();
  const router = useRouter();
  // forgot: ask for the email and send the reset link. Tapping the link comes
  // back here signed in, and the screen asks for a new password instead.
  const [picked, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const choosing = useSyncExternalStore(subscribeReset, isChoosingPassword, () => false);
  const linkError = useSyncExternalStore(subscribeReset, resetLinkError, () => null);
  const mode = choosing ? "reset" : picked;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "info";
    text: string;
  } | null>(null);
  const shown = message ?? (linkError ? { kind: "error" as const, text: linkError } : null);

  useEffect(() => {
    // The reset link signs you in before the new password is saved.
    if (session && mode !== "reset") router.replace("/");
  }, [session, mode, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const auth = getSupabase().auth;
    if (mode === "forgot") {
      const { error } = await auth.resetPasswordForEmail(email.trim(), {
        redirectTo: resetRedirectUrl(),
      });
      setBusy(false);
      if (error) return setMessage({ kind: "error", text: error.message });
      setSent(true);
      setMessage({
        kind: "info",
        text: `If ${email.trim()} has an Ironlog account, a reset link is on its way. Open the email on this phone and tap "Reset password". Ironlog will open so you can choose a new password. (Check spam too.)`,
      });
      return;
    }
    if (mode === "reset") {
      if (!(await auth.getSession()).data.session) {
        setBusy(false);
        return setMessage({
          kind: "error",
          text: "Still opening your reset link. Try again in a moment, or send a new link.",
        });
      }
      const { error } = await auth.updateUser({ password });
      setBusy(false);
      if (error) return setMessage({ kind: "error", text: error.message });
      doneChoosingPassword();
      router.replace("/");
      return;
    }
    const { data, error } = mode === "signin" ? await auth.signInWithPassword({ email, password }) : await auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
    } else if (mode === "signup" && !data.session) {
      setMessage({
        kind: "info",
        text: "Check your email to confirm your account, then sign in.",
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-xl">
          <Dumbbell className="size-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Ironlog</h1>
        <p className="text-muted-foreground text-sm">Lift heavy. Log fast.</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {mode === "reset" ? (
          <p className="text-sm font-semibold">Choose a new password</p>
        ) : (
          <Input type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        {mode !== "forgot" && (
          <Input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "reset" ? "New password (6+ characters)" : "Password (6+ characters)"}
            aria-label={mode === "reset" ? "New password" : "Password"}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {shown && <p className={`text-sm ${shown.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>{shown.text}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? "…"
            : {
                signin: "Sign in",
                signup: "Create account",
                forgot: sent ? "Send the link again" : "Email me a reset link",
                reset: "Save new password",
              }[mode]}
        </Button>
      </form>

      {mode === "signin" && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground -mt-4 text-sm"
          onClick={() => (setMode("forgot"), setSent(false), setMessage(null))}
        >
          Forgot password?
        </button>
      )}

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-sm"
        onClick={() => (doneChoosingPassword(), setMode(mode === "signin" ? "signup" : "signin"), setMessage(null))}
      >
        {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Have an account? Sign in" : "Back to sign in"}
      </button>
    </main>
  );
}
