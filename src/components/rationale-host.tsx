"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { currentRationale, RATIONALES, subscribeRationale } from "@/lib/rationale";

/** Shows the "why we're asking" card before a permission prompt (see src/lib/rationale.ts). */
export function RationaleHost() {
  const p = useSyncExternalStore(subscribeRationale, currentRationale, () => null);
  const r = p ? RATIONALES[p.kind] : null;
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && p?.resolve(false)}>
      <DialogContent>
        {r && (
          <>
            <DialogHeader>
              <DialogTitle>{r.title}</DialogTitle>
              <DialogDescription>{r.body}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => p?.resolve(false)}>
                Not now
              </Button>
              <Button onClick={() => p?.resolve(true)}>{r.action}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
