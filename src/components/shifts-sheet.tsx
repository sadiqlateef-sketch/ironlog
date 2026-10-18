"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays, dayKey, normalizeShifts, SHIFT_PRESETS, tidyShifts, type Shift, type ShiftType } from "@/lib/shifts";
import { cn } from "@/lib/utils";

const CYCLE: (ShiftType | null)[] = [null, "day", "evening", "night"];
const STYLE: Record<ShiftType, string> = {
  day: "bg-amber-400/90 text-black",
  evening: "bg-sky-500/90 text-white",
  night: "bg-indigo-700 text-white",
};
const SHORT: Record<ShiftType, string> = { day: "D", evening: "E", night: "N" };

function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}

/** Settings > Work shifts: tap a day to cycle Off, Day, Evening, Night for the next four weeks. */
export function ShiftsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Work shifts</DialogTitle>
          <DialogDescription>
            Tap a day to mark a shift. Your week plan keeps heavy lifting off shift days and gives you the day after a night shift to sleep.
          </DialogDescription>
        </DialogHeader>
        {open && <ShiftsForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ShiftsForm({ onDone }: { onDone: () => void }) {
  const { profile, updateProfile } = useAuth();
  const today = dayKey(new Date());
  const [shifts, setShifts] = useState<Shift[]>(() => normalizeShifts(profile?.work_shifts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Four weeks starting this Monday.
  const now = new Date();
  const monday = addDays(today, -((now.getDay() + 6) % 7));
  const days = Array.from({ length: 28 }, (_, i) => addDays(monday, i));
  const typeOn = (d: string) => shifts.find((s) => s.date === d)?.type ?? null;

  function cycle(d: string) {
    const next = CYCLE[(CYCLE.indexOf(typeOn(d)) + 1) % CYCLE.length];
    const rest = shifts.filter((s) => s.date !== d);
    setShifts(next ? [...rest, { date: d, type: next, start: SHIFT_PRESETS[next].start, end: SHIFT_PRESETS[next].end }] : rest);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ work_shifts: tidyShifts(shifts, today) as never });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-muted-foreground text-xs font-semibold">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const t = typeOn(d);
          const past = d < today;
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              onClick={() => cycle(d)}
              aria-label={`${d}: ${t ? `${SHIFT_PRESETS[t].label} shift` : "off"}`}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-lg text-sm font-semibold",
                t ? STYLE[t] : "bg-secondary",
                past && "opacity-40",
                d === today && "ring-primary ring-2",
              )}
            >
              <span className="font-mono">{Number(d.slice(8))}</span>
              {t && <span className="text-[10px] leading-none font-bold">{SHORT[t]}</span>}
            </button>
          );
        })}
      </div>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(Object.keys(SHIFT_PRESETS) as ShiftType[]).map((t) => (
          <li key={t} className="flex items-center gap-1">
            <span className={cn("inline-block size-3 rounded", STYLE[t])} /> {SHIFT_PRESETS[t].label} {clock(SHIFT_PRESETS[t].start)}–{clock(SHIFT_PRESETS[t].end)}
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button onClick={save} disabled={busy}>
        Save shifts
      </Button>
    </>
  );
}
