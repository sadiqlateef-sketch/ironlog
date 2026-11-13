"use client";

import { useEffect } from "react";
import { Undo2 } from "lucide-react";

export interface FoodToastState {
  /** Changes every time, so the same text shown twice restarts the timer. */
  id: number;
  text: string;
  onUndo?: () => void;
}

const SHOWN_MS = 5000;

/** A short message above the tab bar, with Undo when the action can be taken back. */
export function FoodToast({ toast, onDone }: { toast: FoodToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, SHOWN_MS);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <div
        role="status"
        className="glass-strong pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-1 pr-1 pl-4 text-sm font-semibold"
        data-testid="food-toast"
      >
        <span className={toast.onUndo ? "min-w-0 truncate" : "min-w-0 truncate py-2 pr-3"}>{toast.text}</span>
        {toast.onUndo && (
          <button
            type="button"
            onClick={() => {
              toast.onUndo?.();
              onDone();
            }}
            className="bg-primary text-primary-foreground flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3"
          >
            <Undo2 className="size-4" aria-hidden /> Undo
          </button>
        )}
      </div>
    </div>
  );
}
