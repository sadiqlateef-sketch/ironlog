"use client";

import { RadialDialKeypad } from "@/components/workout/radial-dial-keypad";

import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Delete, Minus, Plus } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { pressKey, stepFor, stepValue, type KeypadKey, type KeypadKind } from "@/lib/keypad";
import { setLoggerPref, useLoggerPrefs, weightStep } from "@/lib/logger-prefs";
import { cn } from "@/lib/utils";

/** The field the pad is typing into. Values are read fresh on every key. */
export interface KeypadField {
  /** Unique per set and field, e.g. "<set id>:weight". */
  key: string;
  kind: KeypadKind;
  /** "Weight · lb" */
  label: string;
  get: () => string;
  /** The grey "last time" number, where - / + start from when the field is empty. */
  placeholder: () => string;
  set: (value: string) => void;
  /** The big key at the bottom right: "Reps" (move on) or "Log set". */
  next?: { label: string; run: () => void };
}

interface KeypadApi {
  /** Whether the Ironlog pad replaces the phone keyboard. */
  enabled: boolean;
  active: string | null;
  open: (field: KeypadField) => void;
  close: (key: string) => void;
}

const KeypadContext = createContext<KeypadApi>({ enabled: false, active: null, open: () => {}, close: () => {} });

export const useKeypad = () => use(KeypadContext);

/** Keys keep the field focused: pressing them must not blur the input. */
const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

export function KeypadProvider({ children }: { children: ReactNode }) {
  const prefs = useLoggerPrefs();
  const { unit } = useAuth();
  const [field, setField] = useState<KeypadField | null>(null);
  const [dialMode, setDialMode] = useState(false);
  const fresh = useRef(true);

  const open = useCallback((f: KeypadField) => {
    fresh.current = true;
    setField(f);
  }, []);
  const close = useCallback((key: string) => setField((f) => (f?.key === key ? null : f)), []);
  const api = useMemo(() => ({ enabled: prefs.keypad, active: prefs.keypad ? (field?.key ?? null) : null, open, close }), [prefs.keypad, field, open, close]);

  const step = field ? stepFor(field.kind, weightStep(prefs, unit)) : 1;
  const press = (k: KeypadKey) => {
    if (!field) return;
    field.set(pressKey(field.get(), k, field.kind, fresh.current));
    fresh.current = false;
  };
  const bump = (sign: 1 | -1) => {
    if (!field) return;
    field.set(stepValue(field.get(), field.placeholder(), sign * step, field.kind));
    fresh.current = false;
  };
  const done = () => (document.activeElement as HTMLElement | null)?.blur();

  const showPad = prefs.keypad && field;
  const extra: KeypadKey | null = field?.kind === "time" ? ":" : field?.kind === "reps" ? null : ".";
  const stepText = field?.kind === "time" ? `${step}s` : String(step);

  return (
    <KeypadContext value={api}>
      {children}
      {showPad && (
        <>
          {/* Room to scroll the row you're editing above the pad. */}
          <div className="h-80" aria-hidden />
          <div
            className="glass-strong fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            role="group"
            aria-label={`Number pad: ${field.label}`}
            data-testid="keypad"
            onPointerDown={keep}
            onMouseDown={keep}
          >
            <div className="flex h-11 items-center gap-2">
              <p className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
                <span className="text-muted-foreground text-sm font-semibold">{field.label}</span>
                <span className={cn("num text-2xl font-bold", !field.get() && "text-muted-foreground")} aria-live="polite">
                  {field.get() || field.placeholder()}
                </span>
              </p>
              {field.kind === "weight" && (
                <div className="bg-secondary flex rounded-lg p-0.5 text-sm font-semibold" role="group" aria-label="Plus and minus step">
                  {[false, true].map((small) => (
                    <button
                      key={String(small)}
                      type="button"
                      aria-pressed={prefs.smallStep === small}
                      onClick={() => setLoggerPref("smallStep", small)}
                      className={cn("num h-9 min-w-12 rounded-md px-2", prefs.smallStep === small ? "bg-foreground text-background" : "text-muted-foreground")}
                    >
                      {weightStep({ smallStep: small }, unit)}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setDialMode((d) => !d)}
                className="text-xs font-mono font-medium px-2 py-1 rounded bg-secondary text-foreground hover:bg-accent"
              >
                {dialMode ? "Pad" : "Dial"}
              </button>
              <button type="button" onClick={done} className="text-primary-text flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold">
                <ChevronDown className="size-5" aria-hidden /> Done
              </button>
            </div>
            {dialMode && field.kind === "weight" ? (
              <RadialDialKeypad
                currentValue={parseFloat(field.get() || field.placeholder() || "0")}
                unit={unit === "imperial" ? "lb" : "kg"}
                onChange={(v) => {
                  field.set(String(v));
                }}
                onClose={done}
              />
            ) : (
              <div className="grid grid-cols-4 gap-2">
              {(["1", "2", "3"] as const).map((k) => (
                <Key key={k} onPress={() => press(k)}>{k}</Key>
              ))}
              <Key onPress={() => bump(-1)} tone="step" label={`Minus ${stepText}`}>
                <Minus className="size-5" aria-hidden />
                <span className="text-lg">{stepText}</span>
              </Key>
              {(["4", "5", "6"] as const).map((k) => (
                <Key key={k} onPress={() => press(k)}>{k}</Key>
              ))}
              <Key onPress={() => bump(1)} tone="step" label={`Plus ${stepText}`}>
                <Plus className="size-5" aria-hidden />
                <span className="text-lg">{stepText}</span>
              </Key>
              {(["7", "8", "9"] as const).map((k) => (
                <Key key={k} onPress={() => press(k)}>{k}</Key>
              ))}
              <Key onPress={() => press("back")} tone="muted" label="Delete digit">
                <Delete className="size-6" aria-hidden />
              </Key>
              {extra ? <Key onPress={() => press(extra)}>{extra}</Key> : <span />}
              <Key onPress={() => press("0")}>0</Key>
              {field.next ? (
                <Key onPress={field.next.run} tone="primary" className="col-span-2 text-lg">
                  {field.next.label}
                </Key>
              ) : (
                <Key onPress={done} tone="primary" className="col-span-2 text-lg">
                  Done
                </Key>
              )}
            </div>
            )}
          </div>
        </>
      )}
    </KeypadContext>
  );
}

function Key({
  children,
  onPress,
  tone,
  label,
  className,
}: {
  children: ReactNode;
  onPress: () => void;
  tone?: "step" | "muted" | "primary";
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className={cn(
        "num flex h-14 items-center justify-center gap-1 rounded-2xl text-2xl font-bold transition-transform active:scale-95",
        tone === "primary" ? "bg-primary text-primary-foreground" : tone === "step" ? "bg-primary/20 text-primary-text" : "bg-secondary",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
