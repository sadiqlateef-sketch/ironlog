"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const auth = getSupabase().auth;
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

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input
          type="email"
          autoComplete="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password (6+ characters)"
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {message && (
          <p className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {message.text}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-sm"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
