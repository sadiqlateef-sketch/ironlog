"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Crosshair, MapPin, Trash2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  calendarStatus,
  chooseCalendar,
  connectCalendar,
  currentPosition,
  disconnectCalendar,
  distanceMeters,
  gymOf,
  isAtGym,
  listCalendars,
  MIN_GYM_MINUTES,
  type CalendarChoice,
  type CalendarStatus,
} from "@/lib/gym";
import { cn } from "@/lib/utils";

const selectClass = "border-input bg-secondary h-11 w-full rounded-xl border px-3 text-base";
const RADII = [100, 200, 400] as const;

/** Settings > Gym & calendar: where your gym is, and which Google Calendar gets your gym workouts. */
export function GymSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gym &amp; calendar</DialogTitle>
          <DialogDescription>
            When you start a workout at your gym and it runs longer than {MIN_GYM_MINUTES} minutes, Ironlog adds it to your Google Calendar.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <>
            <GymSection />
            <CalendarSection />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function feet(m: number, imperial: boolean): string {
  return imperial ? `${Math.round((m * 3.28084) / 10) * 10} ft` : `${Math.round(m)} m`;
}

function GymSection() {
  const { profile, unit, updateProfile } = useAuth();
  const gym = gymOf(profile);
  const imperial = unit === "imperial";
  const [name, setName] = useState(profile?.gym_name ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const useHere = () =>
    run(async () => {
      const here = await currentPosition();
      await updateProfile({ gym_lat: here.lat, gym_lng: here.lng, gym_name: name.trim() || profile?.gym_name || "My gym" });
      if (!name.trim()) setName(profile?.gym_name || "My gym");
      setNote(here.accuracy > 100 ? `Saved. Your location was only accurate to about ${feet(here.accuracy, imperial)}, so try again near a window for a better fix.` : "Saved. This spot is your gym now.");
    });

  const testHere = () =>
    run(async () => {
      if (!gym) return;
      const here = await currentPosition();
      const d = distanceMeters(here, gym);
      setNote(isAtGym(here, gym) ? `You're at ${gym.name ?? "your gym"} (${feet(d, imperial)} from the spot you saved).` : `You're ${d >= 1609 ? `${(d / (imperial ? 1609.34 : 1000)).toFixed(1)} ${imperial ? "mi" : "km"}` : feet(d, imperial)} away, so this wouldn't count as the gym.`);
    });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="gym-heading">
      <h3 id="gym-heading" className="flex items-center gap-2 font-semibold">
        <MapPin className="size-4" aria-hidden /> Your gym
      </h3>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => gym && name.trim() && name.trim() !== gym.name && run(() => updateProfile({ gym_name: name.trim() }))}
          placeholder="e.g. Planet Fitness on Main St"
        />
      </label>
      {gym ? (
        <>
          <div className="flex flex-col gap-1 text-sm">
            Counts as the gym within
            <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Gym size">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={gym.radius === r}
                  disabled={busy}
                  onClick={() => run(() => updateProfile({ gym_radius_m: r }))}
                  className={cn("h-10 rounded-lg font-semibold", gym.radius === r ? "bg-foreground text-background" : "text-muted-foreground")}
                >
                  {feet(r, imperial)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={testHere}>
              <Crosshair /> Am I there?
            </Button>
            <Button variant="secondary" disabled={busy} onClick={useHere}>
              <MapPin /> Move here
            </Button>
          </div>
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => run(() => updateProfile({ gym_lat: null, gym_lng: null }))}
          >
            <Trash2 /> Remove gym
          </Button>
        </>
      ) : (
        <Button disabled={busy} onClick={useHere}>
          <MapPin /> I&apos;m at my gym: save this spot
        </Button>
      )}
      {note && (
        <p className="text-muted-foreground text-xs" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

function CalendarSection() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [calendars, setCalendars] = useState<CalendarChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await calendarStatus();
      setStatus(s);
      setError(null);
      setCalendars(s.connected ? await listCalendars().catch(() => null) : null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server once when the sheet opens
    refresh();
  }, [refresh]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="cal-heading">
      <h3 id="cal-heading" className="flex items-center gap-2 font-semibold">
        <CalendarCheck className="size-4" aria-hidden /> Google Calendar
      </h3>
      {!status && !error && <p className="text-muted-foreground text-sm">Checking…</p>}
      {status && !status.configured && (
        <p className="text-muted-foreground text-sm">Google Calendar isn&apos;t set up on your server yet. Follow the Google Calendar steps in the setup guide, then come back here.</p>
      )}
      {status?.configured && !status.connected && (
        <Button disabled={busy} onClick={() => run(() => connectCalendar(refresh))}>
          <CalendarCheck /> Connect Google Calendar
        </Button>
      )}
      {status?.connected && (
        <>
          {status.email && <p className="text-muted-foreground text-sm">Signed in as {status.email}</p>}
          <label className="flex flex-col gap-1 text-sm">
            Add gym workouts to
            <select
              className={selectClass}
              disabled={busy || !calendars}
              value={status.calendar_id ?? ""}
              onChange={(e) =>
                run(async () => {
                  const c = await chooseCalendar(e.target.value);
                  setStatus((s) => (s ? { ...s, ...c } : s));
                })
              }
            >
              {!status.calendar_id && <option value="">Pick a calendar</option>}
              {(calendars ?? (status.calendar_id ? [{ id: status.calendar_id, name: status.calendar_name ?? status.calendar_id, primary: false }] : [])).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => run(async () => setStatus(await disconnectCalendar().then(() => calendarStatus())))}>
            Disconnect
          </Button>
        </>
      )}
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
