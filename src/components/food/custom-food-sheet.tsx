"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cleanBarcode } from "@/lib/nutrition/barcode";
import { nutrientsFromPartial } from "@/lib/nutrition/entry-math";
import type { Food } from "@/lib/nutrition/diary-types";
import type { NutrientKey } from "@/lib/nutrition/nutrients";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new food; the sheet closes when it resolves. */
  onCreate: (food: Food) => Promise<void>;
  initialName?: string;
  /** Pre-fills the Barcode field (a scan that found nothing). */
  initialBarcode?: string;
}

type Field = { key: NutrientKey; label: string; unit: string; perGram: number };

// Label, the unit typed in, and how many of those make one stored gram.
const REQUIRED: Field[] = [
  { key: "energy", label: "Calories", unit: "kcal", perGram: 1 },
  { key: "protein", label: "Protein", unit: "g", perGram: 1 },
  { key: "carbohydrates", label: "Carbs", unit: "g", perGram: 1 },
  { key: "fat", label: "Fat", unit: "g", perGram: 1 },
];
const OPTIONAL: Field[] = [
  { key: "fiber", label: "Fiber", unit: "g", perGram: 1 },
  { key: "sugars", label: "Sugars", unit: "g", perGram: 1 },
  { key: "sodium", label: "Sodium", unit: "mg", perGram: 1000 },
  { key: "caffeine", label: "Caffeine", unit: "mg", perGram: 1000 },
];

export function CustomFoodSheet(props: Props) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Form {...props} />}</DialogContent>
    </Dialog>
  );
}

/** null = blank, NaN = not a valid amount, otherwise the number. */
function num(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const isNum = (n: number | null): n is number => n !== null && !Number.isNaN(n);

function Form({ onCreate, onOpenChange, initialName, initialBarcode }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [brand, setBrand] = useState("");
  const [liquid, setLiquid] = useState(false);
  const [vals, setVals] = useState<Partial<Record<NutrientKey, string>>>({});
  const [serving, setServing] = useState("");
  const [pack, setPack] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = liquid ? "ml" : "g";
  const requiredOk = REQUIRED.every((r) => isNum(num(vals[r.key] ?? "")));
  const optionalBad = OPTIONAL.some((o) => Number.isNaN(num(vals[o.key] ?? "")));
  const badSize = (t: string) => {
    const n = num(t);
    return n !== null && (Number.isNaN(n) || n <= 0);
  };
  const valid = name.trim().length > 0 && requiredOk && !optionalBad && !badSize(serving) && !badSize(pack);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const values: Partial<Record<NutrientKey, number>> = {};
      for (const o of [...REQUIRED, ...OPTIONAL]) {
        const n = num(vals[o.key] ?? "");
        if (isNum(n)) values[o.key] = n / o.perGram;
      }
      const s = num(serving);
      const p = num(pack);
      await onCreate({
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 200),
        brand: brand.trim() === "" ? null : brand.trim().slice(0, 200),
        barcode: cleanBarcode(barcode) || null,
        liquid,
        servingAmount: isNum(s) ? s : null,
        packageAmount: isNum(p) ? p : null,
        nutrients: nutrientsFromPartial(values),
        source: "user",
        sourceId: null,
        sourceUrl: null,
        note: null,
        archived: false,
      });
      onOpenChange(false);
    } catch {
      setError("Couldn't save this food. Try again.");
      setBusy(false);
    }
  };

  const field = (o: Field, required: boolean) => (
    <label key={o.key} className="flex flex-col gap-1.5 text-sm font-medium">
      {o.label} ({o.unit})
      <Input
        inputMode="decimal"
        value={vals[o.key] ?? ""}
        placeholder={required ? "0" : "Unknown"}
        aria-invalid={Number.isNaN(num(vals[o.key] ?? "")) || undefined}
        onChange={(e) => setVals((s) => ({ ...s, [o.key]: e.target.value }))}
      />
    </label>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>New food</DialogTitle>
        <DialogDescription>Values are per 100 {base}, as printed on the label.</DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input value={name} maxLength={200} placeholder="What is it?" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Brand (optional)
        <Input value={brand} maxLength={200} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Barcode (optional)
        <Input value={barcode} inputMode="numeric" maxLength={20} autoComplete="off" onChange={(e) => setBarcode(e.target.value)} />
      </label>

      <div className="flex gap-2" role="radiogroup" aria-label="Kind of food">
        {[
          { label: "Solid (g)", value: false },
          { label: "Liquid (ml)", value: true },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={liquid === o.value}
            onClick={() => setLiquid(o.value)}
            className={cn(
              "h-10 flex-1 rounded-full border px-4 text-sm font-semibold",
              liquid === o.value ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Per 100 {base}</legend>
        <div className="grid grid-cols-2 gap-3">{REQUIRED.map((o) => field(o, true))}</div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Optional</legend>
        <div className="grid grid-cols-2 gap-3">{OPTIONAL.map((o) => field(o, false))}</div>
        <p className="text-muted-foreground text-xs">Anything left blank counts as unknown, so totals show &quot;≥&quot;.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Sizes (optional)</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            One serving ({base})
            <Input inputMode="decimal" value={serving} aria-invalid={badSize(serving) || undefined} onChange={(e) => setServing(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Whole package ({base})
            <Input inputMode="decimal" value={pack} aria-invalid={badSize(pack) || undefined} onChange={(e) => setPack(e.target.value)} />
          </label>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={save} disabled={!valid || busy}>
        Save and choose amount
      </Button>
    </>
  );
}
