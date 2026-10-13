"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Watch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { claimWatchCode } from "@/lib/workout-api";

export default function LinkWatchPage() {
  return (
    <AppShell>
      <LinkWatch />
    </AppShell>
  );
}

function LinkWatch() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await claimWatchCode(code);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Link your watch</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Watch className="text-primary size-4" /> Ironlog for Wear OS
          </CardTitle>
          <CardDescription>
            Open Ironlog on your watch. It shows a 6-digit code. Type it here and the watch signs in to your account.
          </CardDescription>
        </CardHeader>
        {done ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 font-medium">
              <Check className="text-primary size-5" /> Linked. Your watch will sign in within a few seconds.
            </p>
            <Button asChild variant="secondary">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              aria-label="Code from your watch"
              className="h-14 text-center font-mono text-3xl tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
              {busy ? "Linking…" : "Link watch"}
            </Button>
          </form>
        )}
      </Card>
      <p className="text-muted-foreground text-sm">
        Codes last 10 minutes and work once. Heart rate from the watch shows up on workouts you log with it.
      </p>
    </div>
  );
}
