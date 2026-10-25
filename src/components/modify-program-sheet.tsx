"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generatePlan, startProgram, type PlanInput, type ProgramWithWorkouts } from "@/lib/workout-api";
import { GOALS, planDefaults } from "@/lib/plan-options";
import { cn } from "@/lib/utils";

export function ModifyProgramSheet({
  open,
  onOpenChange,
  activeProgram,
  onModified,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProgram?: ProgramWithWorkouts | null;
  onModified?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Modify my program
          </DialogTitle>
          <DialogDescription>
            {activeProgram
              ? `Redesign "${activeProgram.name}" using Gemini or Claude.`
              : "Build your personalized training program using Gemini or Claude."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ModifyProgramForm
            activeProgram={activeProgram}
            onDone={() => {
              onOpenChange(false);
              onModified?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModifyProgramForm({
  activeProgram,
  onDone,
}: {
  activeProgram?: ProgramWithWorkouts | null;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const router = useRouter();
  const initial = planDefaults(profile);

  const [provider, setProvider] = useState<"gemini" | "claude">("gemini");
  const [goal, setGoal] = useState<PlanInput["goal"]>(activeProgram ? "hypertrophy" : initial.goal);
  const [days, setDays] = useState<number>(activeProgram?.days_per_week ?? initial.days_per_week);
  const [weeks, setWeeks] = useState<number>(activeProgram?.weeks ?? initial.weeks);
  const [minutes, setMinutes] = useState<number>(initial.session_minutes);
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await generatePlan({
        ...initial,
        provider,
        goal,
        days_per_week: days,
        weeks,
        session_minutes: minutes,
        notes,
      });

      // Automatically activate the newly built program
      if (res?.program_id) {
        await startProgram(res.program_id);
      }
      onDone();
      router.push("/plans/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const isClaude = provider === "claude";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">AI Coach</legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={!isClaude}
            onClick={() => setProvider("gemini")}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
              !isClaude ? "border-primary bg-primary/10 text-foreground font-semibold" : "border-input bg-secondary text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> Gemini
            </span>
            <span className="text-xs font-normal opacity-80">Gemini 3.8 Flash · Fast</span>
          </button>
          <button
            type="button"
            aria-pressed={isClaude}
            onClick={() => setProvider("claude")}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
              isClaude ? "border-primary bg-primary/10 text-foreground font-semibold" : "border-input bg-secondary text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              Claude
            </span>
            <span className="text-xs font-normal opacity-80">Claude 5.5 Opus · Deep volume</span>
          </button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Goal</legend>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button
              key={g.v}
              type="button"
              aria-pressed={goal === g.v}
              onClick={() => setGoal(g.v)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                goal === g.v ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-input bg-secondary",
              )}
            >
              {g.l}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Days / week
          <select
            className="border-input bg-secondary h-10 rounded-xl border px-2 text-sm font-normal"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Duration
          <select
            className="border-input bg-secondary h-10 rounded-xl border px-2 text-sm font-normal"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          >
            {[4, 6, 8, 12].map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Minutes / day
          <select
            className="border-input bg-secondary h-10 rounded-xl border px-2 text-sm font-normal"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[45, 60, 75, 90].map((m) => (
              <option key={m} value={m}>
                {m}m
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Special focus or notes <span className="text-muted-foreground font-normal">(optional)</span>
        <textarea
          rows={2}
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. increase bench press, prioritize arms, bad left shoulder"
          className="border-input bg-secondary placeholder:text-muted-foreground rounded-xl border px-3 py-2 text-sm font-normal"
        />
      </label>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? `${isClaude ? "Claude" : "Gemini"} is designing your program…`
            : `Rebuild program with ${isClaude ? "Claude" : "Gemini"}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onDone();
            router.push("/plans/?modify=1");
          }}
        >
          Open full plans page
        </Button>
      </div>
    </form>
  );
}
