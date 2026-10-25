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
  initialWeight?: number | null;
  onEditWeights?: () => void;
  kit?: Kit;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plate calculator</DialogTitle>
          <DialogDescription>Plates per side, heaviest closest to the middle.{kit ? ` Using ${kit.name}.` : ""}</DialogDescription>
        </DialogHeader>
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
  const maxPlate = Math.max(...std.plates, 1);

  return (
    <div className="flex flex-col gap-4">
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
          {/* Authentic Olympic Barbell Sleeve Visualizer */}
          <div className="bg-card-solid/80 border-border relative flex h-32 w-full items-center justify-start overflow-x-auto rounded-2xl border px-3 py-2 shadow-inner" aria-hidden>
            {/* Bar shaft going left */}
            <div className="h-4 w-6 rounded-l bg-neutral-600 shadow-sm" />
            {/* Inner Collar Flange */}
            <div className="h-16 w-3 rounded-sm border-r border-black/40 bg-neutral-400 shadow-md" />
            {/* Sleeve Bed */}
            <div className="relative flex items-center">
              {result.perSide.map((p, i) => {
                const heightPercent = Math.max(38, Math.min(94, (p / maxPlate) * 94));
                return (
                  <div
                    key={i}
                    className={`${plateColor(p, unit)} relative mx-0.5 flex flex-col items-center justify-center rounded-sm border border-black/40 shadow-md transition-all`}
                    style={{
                      width: 18,
                      height: `${heightPercent}%`,
                      minHeight: 36,
                    }}
                    title={`${p} ${u}`}
                  >
                    <span className="text-[9px] font-black tracking-tighter text-black select-none">
                      {Math.round(p)}
                    </span>
                  </div>
                );
              })}
              {/* Outer Quick-Release Collar Clip */}
              {result.perSide.length > 0 && (
                <div className="h-8 w-2.5 rounded-sm border border-neutral-700 bg-neutral-300 shadow-sm" title="Collar Clip" />
              )}
              {/* Bar Sleeve Outer Tip */}
              <div className="h-4 w-12 rounded-r bg-neutral-500 shadow-inner" />
            </div>
          </div>

          {result.perSide.length === 0 ? (
            <p className="text-muted-foreground text-sm font-medium">Just the bar ({b} {u}).</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="num text-xl font-bold tracking-tight">
                {result.perSide.join(" + ")} <span className="text-muted-foreground text-sm font-normal">{u} per side</span>
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {result.perSide.map((p, i) => (
                  <span key={i} className={`${plateColor(p, unit)} rounded-md px-2 py-0.5 text-xs font-bold text-black`}>
                    {p} {u}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.remainder > 0 && (
            <p className="text-set-warmup text-xs font-semibold">
              Closest loadable: {result.achieved} {u} ({result.remainder} {u} short).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
