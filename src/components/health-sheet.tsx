"use client";

import { useCallback, useEffect, useState } from "react";
import { HeartPulse, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  connectHealth,
  disconnectHealth,
  healthConnectOn,
  healthStatus,
  lastHealthSync,
  openHealthConnect,
  syncHealthConnect,
  type HealthPermissionName,
  type HealthStatus,
  type SyncResult,
} from "@/lib/health";
import { isNative, onAppActiveChange } from "@/lib/native";

const WHAT: { key: HealthPermissionName; label: string }[] = [
  { key: "writeWorkouts", label: "Send your finished workouts" },
  { key: "writeDistance", label: "Send distance for runs, walks, rides and rows" },
  { key: "readHeartRate", label: "Read heart rate during workouts (from your watch)" },
  { key: "readWeight", label: "Read body weight (from your scale or Samsung Health)" },
];

/** Settings > Health Connect: share workouts with Android's health hub and bring heart rate and weight back. */
export function HealthSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Health Connect</DialogTitle>
          <DialogDescription>
            Your workouts show up in Samsung Health, Google Fit and other apps, and your watch&rsquo;s heart rate and your scale&rsquo;s weigh-ins show up
            in Ironlog.
          </DialogDescription>
        </DialogHeader>
        {open && (isNative() ? <HealthForm /> : <p className="text-muted-foreground text-sm">Health Connect works in the Android app.</p>)}
      </DialogContent>
    </Dialog>
  );
}

function summary(r: SyncResult): string {
  const parts = [
    r.workouts && `sent ${r.workouts} workout${r.workouts === 1 ? "" : "s"}`,
    r.removed && `removed ${r.removed} deleted workout${r.removed === 1 ? "" : "s"}`,
    r.heartRate && `added heart rate to ${r.heartRate} workout${r.heartRate === 1 ? "" : "s"}`,
    r.weights && `added ${r.weights} weigh-in${r.weights === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? `Done: ${parts.join(", ")}.` : "Everything is up to date.";
}

function HealthForm() {
  const { unit } = useAuth();
  const [status, setStatus] = useState<HealthStatus | null | undefined>(undefined);
  const [on, setOn] = useState(healthConnectOn);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    healthStatus().then(setStatus);
  }, []);
  // Coming back from Health Connect or the Play Store: check again.
  useEffect(() => {
    refresh();
    return onAppActiveChange((active) => active && refresh());
  }, [refresh]);

  async function sync() {
    setBusy(true);
    setNote("Syncing…");
    const r = await syncHealthConnect(unit);
    setNote(r ? summary(r) : "Couldn't reach Health Connect. Try again in a moment.");
    setBusy(false);
  }

  async function connect() {
    setBusy(true);
    setNote(null);
    try {
      const s = await connectHealth();
      setStatus(s);
      setOn(healthConnectOn());
      if (!s.granted.length) {
        setNote("Nothing was allowed. Tap Connect again and switch on the items you want.");
        setBusy(false);
        return;
      }
    } catch (e) {
      setNote((e as Error).message);
      setBusy(false);
      return;
    }
    await sync();
  }

  if (status === undefined) return <p className="text-muted-foreground text-sm">Checking Health Connect…</p>;
  if (!status || !status.available) {
    const reason = status?.reason;
    if (reason === "unsupported") return <p className="text-muted-foreground text-sm">Health Connect needs Android 9 or newer.</p>;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {reason === "update_required"
            ? "Health Connect needs an update before Ironlog can use it."
            : "This phone doesn't have Health Connect yet. It's a free app from Google."}
        </p>
        <Button size="lg" onClick={openHealthConnect}>
          {reason === "update_required" ? "Update Health Connect" : "Get Health Connect"}
        </Button>
      </div>
    );
  }

  const granted = new Set(status.granted);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2 text-sm">
        {WHAT.map(({ key, label }) => (
          <li key={key} className="flex items-start gap-2">
            <span className={granted.has(key) && on ? "text-primary" : "text-muted-foreground"} aria-hidden>
              {granted.has(key) && on ? "✓" : "○"}
            </span>
            <span className={granted.has(key) && on ? "" : "text-muted-foreground"}>
              {label}
              <span className="sr-only">{granted.has(key) && on ? " (on)" : " (off)"}</span>
            </span>
          </li>
        ))}
      </ul>

      {on && granted.size ? (
        <>
          <p className="text-muted-foreground text-sm">
            Ironlog syncs when you finish a workout and when you open the app. It sends the last 30 days.
            {lastHealthSync() && ` Last sync: ${new Date(lastHealthSync()!).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`}
          </p>
          <Button size="lg" onClick={sync} disabled={busy}>
            <RefreshCw /> Sync now
          </Button>
          {granted.size < WHAT.length && (
            <Button variant="secondary" onClick={connect} disabled={busy}>
              Allow the rest
            </Button>
          )}
          <Button variant="secondary" onClick={openHealthConnect}>
            Open Health Connect
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              disconnectHealth();
              setOn(false);
              setNote("Stopped. Workouts already sent stay in Health Connect. To remove Ironlog's access completely, tap Open Health Connect.");
            }}
          >
            Stop syncing
          </Button>
        </>
      ) : (
        <Button size="lg" onClick={connect} disabled={busy}>
          <HeartPulse /> Connect Health Connect
        </Button>
      )}
      {note && (
        <p className="text-muted-foreground text-sm" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
