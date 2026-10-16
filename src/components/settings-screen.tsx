"use client";

// Every setting in one place: you, units, body details, training answers,
// equipment, gym and calendar, the Claude connector, alerts, and sign out.

import { useState, type ReactNode } from "react";
import { Bell, ChevronRight, Dumbbell, FileDown, HeartPulse, LogOut, MapPin, MessageCircle } from "lucide-react";
import { ClaudeConnectSheet } from "@/components/claude-connect-sheet";
import { EquipmentSheet } from "@/components/equipment-sheet";
import { GymSheet } from "@/components/gym-sheet";
import { HealthSheet } from "@/components/health-sheet";
import { AboutYouForm } from "@/components/progress/body";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toCsv } from "@/lib/export-csv";
import { isNative, recoveryReminderOn, setRecoveryReminder, shareImage } from "@/lib/native";
import { listSetsForExport } from "@/lib/workout-api";
import { EQUIPMENT, EQUIPMENT_LABEL, GOALS } from "@/lib/plan-options";
import { cn } from "@/lib/utils";

function Row({ icon: Icon, label, detail, onClick }: { icon: typeof Dumbbell; label: string; detail?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
      <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {detail && <span className="text-muted-foreground block truncate text-sm">{detail}</span>}
      </span>
      <ChevronRight className="text-muted-foreground size-5" aria-hidden />
    </button>
  );
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children}
    </Card>
  );
}

export function SettingsScreen() {
  const { profile, unit, setUnit, updateProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"weights" | "gym" | "claude" | "health" | null>(null);

  async function save(patch: Parameters<typeof updateProfile>[0], message = "Saved.") {
    try {
      await updateProfile(patch);
      setNote(message);
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  const goal = profile?.training_goal ?? null;
  const equipment = profile?.training_equipment ?? [];
  const days = profile?.training_days_per_week ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      {note && (
        <p className="text-muted-foreground text-sm" role="status">
          {note}
        </p>
      )}

      <Section title="You">
        <label className="flex flex-col gap-1 text-sm">
          Your name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== (profile?.display_name ?? "") && save({ display_name: name.trim() || null })}
            placeholder="What should we call you?"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          Weight unit
          <div className="bg-secondary grid grid-cols-2 gap-1 rounded-xl p-1" role="group" aria-label="Weight unit">
            {(["imperial", "metric"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => setUnit(u)}
                className={cn("h-10 rounded-lg font-semibold", unit === u ? "bg-foreground text-background" : "text-muted-foreground")}
              >
                {u === "imperial" ? "Pounds (lb)" : "Kilograms (kg)"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{profile?.email}</p>
      </Section>

      <Section id="about" title="About you" description="Used for BMI and the body fat estimate. Only you can see it.">
        {profile && <AboutYouForm key={profile.updated_at} onDone={() => setNote("Saved.")} />}
      </Section>

      <Section title="Training" description="The program builder starts from these.">
        <div className="flex flex-col gap-2 text-sm">
          Goal
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <Chip key={g.v} on={goal === g.v} onClick={() => save({ training_goal: g.v })}>
                {g.l}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          Equipment
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((x) => {
              const on = equipment.includes(x);
              return (
                <Chip key={x} on={on} onClick={() => save({ training_equipment: on ? equipment.filter((e) => e !== x) : [...equipment, x] })}>
                  {EQUIPMENT_LABEL[x]}
                </Chip>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          Days a week
          <div className="grid grid-cols-5 gap-2" role="group" aria-label="Days a week">
            {[2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => save({ training_days_per_week: d })}
                className={cn("h-10 rounded-lg font-mono font-bold", days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Reminders">
        <RecoveryToggle />
      </Section>

      <Section title="Gym and connections">
        <div className="flex flex-col">
          <Row icon={Dumbbell} label="Bar, plates and rest time" detail="What the plate calculator and rest timer use" onClick={() => setSheet("weights")} />
          <Row icon={MapPin} label="Gym & calendar" detail={profile?.gym_name ?? "Check in at your gym, add workouts to Google Calendar"} onClick={() => setSheet("gym")} />
          <Row icon={HeartPulse} label="Health Connect" detail="Share workouts with Samsung Health; bring in heart rate and weight" onClick={() => setSheet("health")} />
          <Row icon={MessageCircle} label="Connect to Claude" detail="Log workouts from a Claude chat" onClick={() => setSheet("claude")} />
        </div>
      </Section>

      <Section title="Your data">
        <Row
          icon={FileDown}
          label="Export workouts (CSV)"
          detail="Every set you've logged, for a spreadsheet"
          onClick={async () => {
            setNote("Preparing your export…");
            try {
              const csv = toCsv(await listSetsForExport(), unit);
              const day = new Date().toISOString().slice(0, 10);
              const how = await shareImage(new Blob([csv], { type: "text/csv" }), `ironlog-workouts-${day}.csv`, "Ironlog workouts");
              setNote(how === "downloaded" ? "Export downloaded." : how === "shared" ? "Export ready." : null);
            } catch (e) {
              setNote(`Couldn't export: ${(e as Error).message}`);
            }
          }}
        />
      </Section>

      <Button variant="secondary" size="lg" className="text-destructive" onClick={signOut}>
        <LogOut /> Sign out
      </Button>

      <EquipmentSheet open={sheet === "weights"} onOpenChange={(o) => !o && setSheet(null)} />
      <GymSheet open={sheet === "gym"} onOpenChange={(o) => !o && setSheet(null)} />
      <ClaudeConnectSheet open={sheet === "claude"} onOpenChange={(o) => !o && setSheet(null)} />
      <HealthSheet open={sheet === "health"} onOpenChange={(o) => !o && setSheet(null)} />
    </div>
  );
}

function RecoveryToggle() {
  const [on, setOn] = useState(recoveryReminderOn);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!isNative()) return <p className="text-muted-foreground text-sm">Recovery-day reminders are available in the Android app.</p>;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const want = !on;
          const now = await setRecoveryReminder(want);
          setOn(now);
          setNote(want && !now ? "Notifications are off for Ironlog. Turn them on in Android Settings > Apps > Ironlog > Notifications." : null);
          setBusy(false);
        }}
        className="flex w-full items-center gap-3 text-left"
      >
        <Bell className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Recovery-day reminder</span>
          <span className="text-muted-foreground block text-sm">
            The morning after a workout, a notification says which muscles are still recovering and what helps. Turning this on asks Android to
            allow notifications.
          </span>
        </span>
        <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-foreground/20")}>
          <span className={cn("bg-background absolute top-0.5 size-5 rounded-full transition-all", on ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>
      {note && <p className="text-destructive text-sm">{note}</p>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "bg-primary text-primary-foreground border-primary font-semibold" : "text-muted-foreground")}
    >
      {children}
    </button>
  );
}
