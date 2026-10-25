"use client";

import { useSyncExternalStore } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { clearSyncError, flush, getSyncStatus, subscribeSync } from "@/lib/offline/queue";

/** "Saved offline, will sync" while workout changes are waiting for signal. */
export function SyncBanner() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);
  // A change that couldn't be saved is never silent: say so until you tap it away.
  if (s.error)
    return (
      <button
        type="button"
        role="alert"
        onClick={clearSyncError}
        className="glass-strong mx-auto mb-2 flex w-[calc(100%-1.5rem)] max-w-md items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold"
      >
        <CloudOff className="text-destructive size-4 shrink-0" aria-hidden />
        <span className="text-destructive flex-1">{s.error}</span>
        <span className="text-muted-foreground text-xs font-normal">Tap to dismiss</span>
      </button>
    );
  if (s.pending === 0) return null;
  const offline = !s.online;
  return (
    <button
      type="button"
      role="status"
      onClick={() => void flush()}
      className="glass-strong mx-auto mb-2 flex w-[calc(100%-1.5rem)] max-w-md items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold"
    >
      {offline ? <CloudOff className="size-4 shrink-0 text-set-warmup" aria-hidden /> : <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />}
      <span className="flex-1">
        {offline ? "Saved offline, will sync when you have signal" : "Syncing your workout…"}
      </span>
      {offline && <span className="text-muted-foreground text-xs font-normal">Tap to retry</span>}
    </button>
  );
}
