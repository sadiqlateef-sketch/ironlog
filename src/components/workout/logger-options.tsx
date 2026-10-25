"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setLoggerPref, useLoggerPrefs, type LoggerPrefs } from "@/lib/logger-prefs";
import { cn } from "@/lib/utils";

const OPTIONS: { key: keyof LoggerPrefs; label: string; detail: string }[] = [
  { key: "focus", label: "Focus mode", detail: "Only the set you're on and the rest timer, in big numbers." },
  { key: "oneHanded", label: "One-handed mode", detail: "Weight and reps with - / + buttons at the bottom, next to Log Set." },
  { key: "keypad", label: "Ironlog number pad", detail: "Big keys with - / + instead of the phone keyboard." },
  { key: "sounds", label: "Sounds", detail: "A short sound when a set saves, beeps when rest ends." },
  { key: "haptics", label: "Vibration", detail: "A buzz on the same moments." },
];

/** Logger display choices, saved on this phone. */
export function LoggerOptions({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const prefs = useLoggerPrefs();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Logger display</DialogTitle>
          <DialogDescription>Saved on this phone.</DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 flex flex-col">
          {OPTIONS.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[o.key]}
                onClick={() => setLoggerPref(o.key, !prefs[o.key])}
                className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{o.label}</span>
                  <span className="text-muted-foreground block text-sm">{o.detail}</span>
                </span>
                <span
                  aria-hidden
                  className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", prefs[o.key] ? "bg-primary" : "bg-foreground/20")}
                >
                  <span className={cn("absolute top-1 size-5 rounded-full bg-white transition-[left]", prefs[o.key] ? "left-6" : "left-1")} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

const HINT_KEY = "ironlog.hint.set-gestures";

/** One-time tip about swiping and holding sets. */
export function GestureHint() {
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== "1";
    } catch {
      return false;
    }
  });
  if (!shown) return null;
  const hide = () => {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
    setShown(false);
  };
  return (
    <div className="bg-secondary flex items-center gap-2 rounded-xl py-1 pr-1 pl-3 text-sm" role="note">
      <p className="flex-1">Swipe a set right to finish it, left to delete. Hold a set to duplicate it or add a drop set.</p>
      <button type="button" onClick={hide} aria-label="Got it" className="text-muted-foreground grid size-11 shrink-0 place-items-center rounded-lg">
        <X className="size-5" />
      </button>
    </div>
  );
}
