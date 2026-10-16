"use client";

// First run, right after signing up: a few quick questions, saved to your
// profile, then straight into building a program with those answers.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_EQUIPMENT, EQUIPMENT, EQUIPMENT_LABEL, GOALS } from "@/lib/plan-options";
import { cn } from "@/lib/utils";
import type { TrainingGoal, UnitSystem } from "@/types/database";

const STEPS = ["name", "unit", "goal", "equipment", "days"] as const;
type Step = (typeof STEPS)[number];

function Option({ on, onClick, title, detail }: { on: boolean; onClick: () => void; title: string; detail?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "glass flex w-full flex-col items-start rounded-2xl border px-4 py-3 text-left",
        on ? "border-primary bg-primary/15" : "border-transparent",
      )}
    >
      <span className="font-semibold">{title}</span>
      {detail && <span className="text-muted-foreground text-sm">{detail}</span>}
    </button>
  );
}

export function Welcome() {
  const { profile, updateProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState(profile?.display_name ?? "");
  const [unit, setUnit] = useState<UnitSystem>(profile?.unit_system ?? "imperial");
  const [goal, setGoal] = useState<TrainingGoal>(profile?.training_goal ?? "strength");
  const [equipment, setEquipment] = useState<string[]>(profile?.training_equipment?.length ? profile.training_equipment : DEFAULT_EQUIPMENT);
  const [days, setDays] = useState(profile?.training_days_per_week ?? 4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = STEPS.indexOf(step);
  const last = index === STEPS.length - 1;

  async function save(next: string) {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        display_name: name.trim() || null,
        unit_system: unit,
        training_goal: goal,
        training_equipment: equipment,
        training_days_per_week: days,
        onboarded_at: new Date().toISOString(),
      });
      router.replace(next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await updateProfile({ onboarded_at: new Date().toISOString() });
    } catch {}
    router.replace("/");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        {index > 0 ? (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={() => setStep(STEPS[index - 1])}>
            <ArrowLeft />
          </Button>
        ) : (
          <span className="size-9" aria-hidden />
        )}
        <ol className="flex flex-1 gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-primary-text" : "bg-foreground/20")} />
          ))}
        </ol>
        <button type="button" className="text-muted-foreground px-2 text-sm" onClick={skip} disabled={busy}>
          Skip
        </button>
      </header>

      {step === "name" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Welcome to Ironlog</h1>
          <p className="text-muted-foreground">A few quick questions and Claude will build your first program.</p>
          <label className="flex flex-col gap-2 text-sm font-medium">
            What should we call you?
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" maxLength={60} />
          </label>
        </section>
      )}

      {step === "unit" && (
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Pounds or kilograms?</h1>
          <Option on={unit === "imperial"} onClick={() => setUnit("imperial")} title="Pounds (lb)" />
          <Option on={unit === "metric"} onClick={() => setUnit("metric")} title="Kilograms (kg)" />
        </section>
      )}

      {step === "goal" && (
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">What&apos;s your main goal?</h1>
          {GOALS.map((g) => (
            <Option key={g.v} on={goal === g.v} onClick={() => setGoal(g.v)} title={g.l} detail={g.d} />
          ))}
        </section>
      )}

      {step === "equipment" && (
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">What can you train with?</h1>
          <p className="text-muted-foreground text-sm">Pick everything at your gym. Bodyweight moves are always included.</p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((x) => {
              const on = equipment.includes(x);
              return (
                <button
                  key={x}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setEquipment(on ? equipment.filter((e) => e !== x) : [...equipment, x])}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm",
                    on ? "bg-primary text-primary-foreground border-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  {EQUIPMENT_LABEL[x]}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "days" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">How many days a week?</h1>
          <div className="grid grid-cols-5 gap-2" role="group" aria-label="Days per week">
            {[2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={cn(
                  "h-14 rounded-2xl font-mono text-xl font-bold",
                  days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {last ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled={busy} onClick={() => save("/plans/?build=1")} data-testid="build-program">
            <Sparkles /> Build my program
          </Button>
          <Button size="lg" variant="secondary" disabled={busy} onClick={() => save("/")}>
            I&apos;ll pick one later
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={() => setStep(STEPS[index + 1])} disabled={step === "equipment" && equipment.length === 0}>
          Next
        </Button>
      )}
    </div>
  );
}
