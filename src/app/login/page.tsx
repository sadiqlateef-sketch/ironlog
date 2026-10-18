"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/google-sign-in";

export default function LoginPage() {
  const { session } = useAuth();
  const router = useRouter();
  // forgot: ask for the email; reset: enter the emailed code and a new password.
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signin");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    // While resetting, the code signs you in before the new password is saved.
    if (session && mode !== "reset") router.replace("/");
  }, [session, mode, router]);

  async function onGoogle() {
    setBusy(true);
    setMessage(null);
    const error = await signInWithGoogle();
    // null: signed in (the effect above moves on) or, on the web, off to Google.
    if (error !== null) setBusy(false);
    if (error) setMessage({ kind: "error", text: error });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const auth = getSupabase().auth;
    if (mode === "forgot") {
      const { error } = await auth.resetPasswordForEmail(email.trim());
      setBusy(false);
      if (error) return setMessage({ kind: "error", text: error.message });
      setMode("reset");
      setMessage({ kind: "info", text: `If ${email.trim()} has an Ironlog account, a reset code is on its way. Check your email (and spam).` });
      return;
    }
    if (mode === "reset") {
      const { error: codeError } = await auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
      if (codeError) {
        setBusy(false);
        return setMessage({ kind: "error", text: "That code didn't work. Check the newest email, or send a new code." });
      }
      const { error } = await auth.updateUser({ password });
      setBusy(false);
      if (error) return setMessage({ kind: "error", text: error.message });
      router.replace("/");
      return;
    }
    const { data, error } =
      mode === "signin"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
    } else if (mode === "signup" && !data.session) {
      setMessage({ kind: "info", text: "Check your email to confirm your account, then sign in." });
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

      {(mode === "signin" || mode === "signup") && (
        <div className="flex flex-col gap-4">
          <Button type="button" size="lg" variant="outline" disabled={busy} onClick={onGoogle}>
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            or use email
            <span className="bg-border h-px flex-1" />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className={`flex flex-col gap-3 ${mode === "signin" || mode === "signup" ? "-mt-4" : ""}`}>
        <Input
          type="email"
          autoComplete="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode === "reset" && (
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code from the email"
            aria-label="Code from the email"
            pattern="[0-9]{6,10}"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
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
        {message && (
          <p className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {message.text}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? "…"
            : { signin: "Sign in", signup: "Create account", forgot: "Email me a reset code", reset: "Save new password" }[mode]}
        </Button>
      </form>

      {mode === "signin" && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground -mt-4 text-sm"
          onClick={() => (setMode("forgot"), setMessage(null))}
        >
          Forgot password?
        </button>
      )}
      {mode === "reset" && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground -mt-4 text-sm"
          onClick={() => (setMode("forgot"), setCode(""), setMessage(null))}
        >
          Send a new code
        </button>
      )}

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-sm"
        onClick={() => (setMode(mode === "signin" ? "signup" : "signin"), setMessage(null))}
      >
        {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Have an account? Sign in" : "Back to sign in"}
      </button>
    </main>
  );
}

/** Google's "G", in its own colors as Google's sign-in guidelines ask. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
