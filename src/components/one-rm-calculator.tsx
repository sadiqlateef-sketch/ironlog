"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { brzycki, epley, MAX_RELIABLE_REPS, PERCENT_TABLE, repsAtPercent, roundToPlates } from "@/lib/one-rm";
import { parseNumber } from "@/lib/workout-logic";

/** Type a set you did, get your estimated max and a % chart for programming. */
export function OneRmCalculator() {
  const { unit } = useAuth();
  const u = unit === "imperial" ? "lb" : "kg";
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const w = parseNumber(weight);
  const r = parseNumber(reps);
  const valid = w != null && w > 0 && r != null && r >= 1 && r <= 30;
  const max = valid ? epley(w, Math.round(r)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Weight ({u})
          <Input inputMode="decimal" placeholder={unit === "imperial" ? "225" : "100"} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Reps
          <Input inputMode="numeric" placeholder="5" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>

      {valid ? (
        <>
          <div>
            <p className="text-muted-foreground text-xs">Estimated 1RM</p>
            <p className="text-5xl font-bold tracking-tight">
              {Math.round(max)} <span className="text-muted-foreground text-xl font-medium">{u}</span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Epley formula. Brzycki says {Math.round(brzycki(w, Math.round(r))) || "–"} {u}.
              {r > MAX_RELIABLE_REPS && " Above 12 reps these estimates get much less reliable."}
            </p>
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="py-1 text-left font-medium">% of max</th>
                <th className="py-1 text-right font-medium">Weight</th>
                <th className="py-1 text-right font-medium">≈ Reps</th>
              </tr>
            </thead>
            <tbody>
              {PERCENT_TABLE.map((p) => (
                <tr key={p} className="border-t">
                  <td className="py-1.5">{p}%</td>
                  <td className="py-1.5 text-right font-semibold">
                    {roundToPlates((max * p) / 100, unit)} {u}
                  </td>
                  <td className="text-muted-foreground py-1.5 text-right">{repsAtPercent(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Enter a set you&apos;ve done (1-30 reps) to estimate your max.</p>
      )}
    </div>
  );
}
