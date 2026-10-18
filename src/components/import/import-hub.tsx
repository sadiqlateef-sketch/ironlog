"use client";

// Import & backup: bring workouts in (a JEFIT/Strong/Hevy export file, or a
// photo/screenshot of one workout) and take everything out as a spreadsheet.

import { useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, FileUp } from "lucide-react";
import { BackupButton } from "@/components/import/backup-button";
import { HistoryImport } from "@/components/import/history-import";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function fileTabFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("tab") === "file";
}

export function ImportHub() {
  const [file, setFile] = useState(fileTabFromUrl);

  function choose(on: boolean) {
    setFile(on);
    window.history.replaceState(null, "", on ? "?tab=file" : window.location.pathname);
  }

  if (file) return <HistoryImport onBack={() => choose(false)} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import &amp; backup</h1>

      <Card>
        <CardHeader>
          <CardTitle>Bring workouts in</CardTitle>
          <CardDescription>Your old history counts toward records, charts and recovery once it&apos;s here.</CardDescription>
        </CardHeader>
        <div className="flex flex-col">
          <button type="button" onClick={() => choose(true)} className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
            <FileUp className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">From JEFIT or another app</span>
              <span className="text-muted-foreground block text-sm">Your whole history from an export file (JEFIT, Strong, Hevy, a spreadsheet)</span>
            </span>
            <ChevronRight className="text-muted-foreground size-5" aria-hidden />
          </button>
          <Link href="/log/?tab=photo" className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
            <Camera className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">From a photo or screenshot</span>
              <span className="text-muted-foreground block text-sm">One workout from your notebook or another app&apos;s screen</span>
            </span>
            <ChevronRight className="text-muted-foreground size-5" aria-hidden />
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Take everything out</CardTitle>
          <CardDescription>A copy of all your data you can open in Google Sheets or Excel, or keep in Drive.</CardDescription>
        </CardHeader>
        <BackupButton />
      </Card>
    </div>
  );
}
