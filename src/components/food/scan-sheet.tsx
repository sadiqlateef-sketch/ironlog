"use client";

// Find a food by its barcode: scan it with the camera (Android app) or type
// the numbers. Looks on the phone first, then Open Food Facts.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, ScanBarcode, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { scanBarcode, scannerAvailable } from "@/lib/barcode-scanner";
import { hintFromFormat, lookupBarcode } from "@/lib/nutrition/barcode-lookup";
import type { Food } from "@/lib/nutrition/diary-types";
import type { RemoteFood } from "@/lib/nutrition/search";
import { createOffClient } from "@/lib/nutrition/sources/off";

export type ScannedCode = { raw: string; format: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: readonly Food[];
  onLocal: (food: Food) => void;
  onRemote: (food: RemoteFood) => void;
  onCreate: (code: string) => void;
  /** Save a placeholder food for this code; `logNow` also opens the amount sheet. */
  onOffline: (code: string, logNow: boolean) => Promise<void>;
  /** A scan that arrived some other way (Android restarted the app mid-scan); looked up on open. */
  initialScan?: ScannedCode | null;
}

let off: ReturnType<typeof createOffClient> | null = null;

export function ScanSheet(props: Props) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Body {...props} />}</DialogContent>
    </Dialog>
  );
}

type View =
  | { kind: "idle"; error?: string }
  | { kind: "preparing" }
  | { kind: "scanning" }
  | { kind: "looking"; code: string }
  | { kind: "not-found"; code: string }
  | { kind: "offline"; code: string }
  | { kind: "failed"; code: string; message: string };

function Body({ foods, onLocal, onRemote, onCreate, onOffline, onOpenChange, initialScan }: Props) {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [warning, setWarning] = useState(false);
  const [typed, setTyped] = useState("");
  const [canScan, setCanScan] = useState<boolean | null>(null);
  const alive = useRef(true);
  const foodsRef = useRef(foods);
  useEffect(() => {
    foodsRef.current = foods;
  });

  useEffect(() => {
    alive.current = true;
    scannerAvailable()
      .then((ok) => {
        if (alive.current) setCanScan(ok);
      })
      .catch(() => {
        if (alive.current) setCanScan(false);
      });
    return () => {
      alive.current = false;
    };
  }, []);

  const lookup = useCallback(
    async (raw: string, format: string | null = null) => {
      setWarning(false);
      setView({ kind: "looking", code: raw.replace(/\D/g, "") });
      off ??= createOffClient();
      const client = off;
      const res = await lookupBarcode(
        raw,
        { foods: foodsRef.current, getProduct: (c) => client.getProduct(c), isOnline: () => navigator.onLine },
        hintFromFormat(format),
      );
      if (!alive.current) return;
      if (res.kind === "invalid") {
        setView({ kind: "idle", error: "That doesn't look like a barcode. Type the 8 to 14 numbers under the bars." });
        return;
      }
      setWarning(res.warning);
      if (res.kind === "local") onLocal(res.food);
      else if (res.kind === "remote") onRemote(res.food);
      else if (res.kind === "failed") setView({ kind: "failed", code: res.code, message: res.message });
      else setView({ kind: res.kind, code: res.code });
    },
    [onLocal, onRemote],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initialScan) return;
    started.current = true;
    void lookup(initialScan.raw, initialScan.format);
  }, [initialScan, lookup]);

  const scan = async () => {
    setView({ kind: "scanning" });
    const out = await scanBarcode({
      onPreparing: () => {
        if (alive.current) setView({ kind: "preparing" });
      },
    });
    if (!alive.current) return;
    if (out.kind === "code") void lookup(out.raw, out.format);
    else if (out.kind === "cancelled") setView({ kind: "idle" });
    else setView({ kind: "idle", error: out.reason === "web" ? undefined : out.reason });
  };

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (typed.trim() === "") return;
    void lookup(typed);
  };

  const [saving, setSaving] = useState(false);
  const saveOffline = async (code: string, logNow: boolean) => {
    setSaving(true);
    try {
      await onOffline(code, logNow);
    } catch {
      if (alive.current) setView({ kind: "failed", code, message: "Couldn't save it on this phone. Try again" });
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const reset = () => {
    setWarning(false);
    setView({ kind: "idle" });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Find by barcode</DialogTitle>
        <DialogDescription>Looks on this phone first, then Open Food Facts.</DialogDescription>
      </DialogHeader>

      {warning && view.kind !== "idle" && (
        <p role="status" className="flex items-start gap-2 text-sm text-amber-500">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          That barcode may have a typo. Looking it up anyway.
        </p>
      )}

      {view.kind === "idle" && (
        <div className="flex flex-col gap-4">
          {canScan && (
            <Button type="button" size="lg" onClick={() => void scan()}>
              <ScanBarcode /> Scan with camera
            </Button>
          )}
          <form onSubmit={submitTyped} className="flex flex-col gap-2">
            <label htmlFor="scan-sheet-code" className="text-sm font-medium">
              Barcode numbers
            </label>
            <div className="flex gap-2">
              <Input
                id="scan-sheet-code"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 5000000000000"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-invalid={view.error ? true : undefined}
                aria-describedby={view.error ? "scan-sheet-error" : undefined}
              />
              <Button type="submit" variant="outline" disabled={typed.trim() === ""}>
                Look up
              </Button>
            </div>
            {view.error && (
              <p id="scan-sheet-error" role="alert" className="text-destructive text-sm">
                {view.error}
              </p>
            )}
          </form>
          {canScan === false && <p className="text-muted-foreground text-sm">Camera scanning works in the Android app.</p>}
        </div>
      )}

      {(view.kind === "preparing" || view.kind === "scanning" || view.kind === "looking") && (
        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {view.kind === "preparing"
            ? "Getting the scanner ready. This happens once and needs the internet."
            : view.kind === "scanning"
              ? "Scanner open"
              : `Looking up ${view.code}`}
        </p>
      )}

      {view.kind === "not-found" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">No product found for {view.code}.</p>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={() => onCreate(view.code)}>
              Create food
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={reset}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {view.kind === "offline" && (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm">
            <WifiOff className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            You&apos;re offline. Save this barcode now and fill in the details later?
          </p>
          <p className="text-muted-foreground text-xs">
            It&apos;s saved as &quot;Unknown product ({view.code})&quot; with no nutrition yet. When you&apos;re back online the name and
            nutrition fill in. Earlier log entries keep the amounts they had.
          </p>
          <Button type="button" disabled={saving} onClick={() => void saveOffline(view.code, true)}>
            Save and log it
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={() => void saveOffline(view.code, false)}>
              Save only
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {view.kind === "failed" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{view.message}.</p>
          <Button type="button" variant="outline" onClick={() => void lookup(view.code)}>
            Try again
          </Button>
        </div>
      )}
    </>
  );
}
