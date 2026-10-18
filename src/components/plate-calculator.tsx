"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kitFor, type Kit } from "@/lib/kit";
import { calculatePlates, kitPlates, plateColor } from "@/lib/plates";
import { parseNumber } from "@/lib/workout-logic";

/** Bottom sheet that shows exactly which plates to load on each side. */
export function PlateCalculator({
  open,
  onOpenChange,
  initialWeight,
  onEditWeights,
  kit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target in the user's unit, e.g. the weight typed in the current set. */
  initialWeight?: number | null;
  /** Opens the "your bar and plates" sheet. */
  onEditWeights?: () => void;
  /** Whose plates to use (the workout's kit); defaults to the kit in use. */
  kit?: Kit;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plate calculator</DialogTitle>
          <DialogDescription>Plates per side, heaviest closest to the middle.{kit ? ` Using ${kit.name}.` : ""}</DialogDescription>
        </DialogHeader>
        {/* Mounted fresh on every open, so it starts from the current set's weight. */}
        <PlateForm initialWeight={initialWeight} kit={kit} />
        {onEditWeights && (
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onEditWeights();
            }}
          >
            <Dumbbell /> Edit available weights
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlateForm({ initialWeight, kit }: { initialWeight?: number | null; kit?: Kit }) {
  const { profile, unit } = useAuth();
  const std = kitPlates(kit ?? kitFor(null, profile), unit);
  const u = unit === "imperial" ? "lb" : "kg";
  const [target, setTarget] = useState(initialWeight ? String(initialWeight) : "");
  const [bar, setBar] = useState(String(std.bar));

  const t = parseNumber(target);
  const b = parseNumber(bar) ?? std.bar;
  const result = t != null ? calculatePlates(t, b, std.plates, std.pairs) : null;

  return (
    <>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Target ({u})
            <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Bar ({u})
            <Input inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value)} />
          </label>
        </div>

        {result && (
          <div className="flex flex-col gap-4">
            {/* Barbell drawing: sleeve on the left, plates stacked outward */}
            <div className="flex h-28 items-center" aria-hidden>
              <div className="bg-muted-foreground h-3 w-10 rounded-l" />
              <div className="bg-muted-foreground h-6 w-2" />
              {result.perSide.map((p, i) => (
                <div
                  key={i}
                  className={`${plateColor(p, unit)} mx-px rounded-sm border border-black/30`}
                  style={{ width: 14, height: `${Math.max(30, Math.min(100, (p / Math.max(...std.plates)) * 100))}%` }}
                />
              ))}
              <div className="bg-muted-foreground h-3 flex-1 rounded-r" />
            </div>
            {result.perSide.length === 0 ? (
              <p className="text-muted-foreground text-sm">Just the bar.</p>
            ) : (
              <p className="font-mono text-xl font-bold">
                {result.perSide.join(" + ")} <span className="text-muted-foreground text-sm font-normal">{u} per side</span>
              </p>
            )}
            {result.remainder > 0 && (
              <p className="text-set-warmup text-sm">
                Closest you can load is {result.achieved} {u} ({result.remainder} {u} short).
              </p>
            )}
          </div>
        )}
    </>
  );
}
