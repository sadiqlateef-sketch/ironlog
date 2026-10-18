"use client";

import { useState } from "react";
import { Loader2, Sheet } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { buildBackup } from "@/lib/backup";
import { shareImage } from "@/lib/native";

/** "Back up everything": the whole account as one spreadsheet, shared (Android) or downloaded. */
export function BackupButton() {
  const { session, unit } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    if (!session) return;
    setBusy(true);
    setNote(null);
    try {
      const blob = await buildBackup(session.user.id, unit);
      const day = new Date().toISOString().slice(0, 10);
      const how = await shareImage(blob, `ironlog-backup-${day}.xlsx`, "Ironlog backup");
      setNote(
        how === "downloaded"
          ? "Backup downloaded."
          : how === "shared"
            ? "Backup ready. Pick Drive or Files to keep a copy."
            : null,
      );
    } catch (e) {
      setNote(`Couldn't make the backup: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={run} disabled={busy} className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left disabled:opacity-60">
        {busy ? <Loader2 className="text-muted-foreground size-5 shrink-0 animate-spin" aria-hidden /> : <Sheet className="text-muted-foreground size-5 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{busy ? "Making your backup…" : "Back up everything"}</span>
          <span className="text-muted-foreground block text-sm">Workouts, sets, routines, programs, body and heart rate, as one spreadsheet (.xlsx)</span>
        </span>
      </button>
      {note && (
        <p className="text-muted-foreground px-1 text-sm" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
