"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { legacyWorkoutCount, skipLegacyUpload, uploadLegacyWorkouts, type UploadResult } from "@/lib/legacy-upload";

/** Offers to send the workouts saved on this phone during the local test builds. */
export function LegacyUploadBanner() {
  const [count] = useState(() => legacyWorkoutCount());
  const [open, setOpen] = useState(() => count > 0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  if (!open) return null;

  const upload = async () => {
    setBusy(true);
    try {
      setResult(await uploadLegacyWorkouts());
    } catch (err) {
      setResult({ workouts: 0, sets: 0, unmatched: [], failed: [err instanceof Error ? err.message : "Upload failed."] });
    }
    setBusy(false);
  };

  const done = result !== null && result.failed.length === 0;

  return (
    <div role="status" className="glass-strong mx-auto mb-2 flex w-[calc(100%-1.5rem)] max-w-md flex-col gap-2 rounded-2xl px-4 py-3 text-sm">
      {!result && <p className="font-semibold">{`${count} ${count === 1 ? "workout" : "workouts"} from this phone aren't in your account yet.`}</p>}
      {done && <p className="font-semibold">{`Uploaded ${result.workouts} workouts (${result.sets} sets).`}</p>}
      {result && result.unmatched.length > 0 && (
        <p className="text-muted-foreground text-xs">{`Couldn't match: ${result.unmatched.join(", ")}. Those sets stay on this phone.`}</p>
      )}
      {result && result.failed.length > 0 && (
        <p className="text-xs">{`Some didn't upload: ${result.failed.join("; ")}. Tap Upload to try again.`}</p>
      )}
      <div className="flex justify-end gap-2">
        {done ? (
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 font-semibold">
            Close
          </button>
        ) : (
          <>
            <button type="button" onClick={() => { skipLegacyUpload(); setOpen(false); }} className="rounded-xl px-4 py-2 font-semibold">
              Not now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void upload()}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Upload
            </button>
          </>
        )}
      </div>
    </div>
  );
}
