"use client";

import { useSyncExternalStore } from "react";
import { CloudAlert, CloudOff, RefreshCw } from "lucide-react";
import { clearSyncError, discardRefused, flush, getSyncStatus, subscribeSync } from "@/lib/offline/queue";

/** "Saved offline, will sync" while workout changes are waiting for signal. */
export function SyncBanner() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);
  // The server said no to a change. It's kept, and syncing waits on it, until you choose.
  if (s.refused)
    return (
      <div
        role="alert"
        className="glass-strong mx-auto mb-2 w-[calc(100%-1.5rem)] max-w-md rounded-2xl px-4 py-2.5 text-sm"
      >
        <p className="flex items-start gap-2 font-semibold">
          <CloudAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {s.pending === 1 ? "1 workout change" : `${s.pending} workout changes`} not saved yet. {s.refused}
          </span>
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm("Throw away the change the server refused? This can't be undone.")) void discardRefused();
            }}
            className="text-muted-foreground min-h-11 rounded-xl px-3 text-xs font-semibold"
          >
            Discard it
          </button>
          <button
            type="button"
            onClick={() => {
              clearSyncError();
              void flush();
            }}
            className="bg-primary text-primary-foreground min-h-11 rounded-xl px-4 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
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
