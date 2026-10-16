"use client";

// One place to log a workout you already did: say it, snap it, or type it.
// Voice and Type share one chat with Claude; Photo reads screenshots and
// notebook photos. Everything is checked on the same review screen before saving.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Keyboard, Mic } from "lucide-react";
import { LogChat } from "@/components/chat/log-chat";
import { ImportScreen } from "@/components/import/import-screen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "voice" | "photo" | "type";
const TABS: { key: Tab; label: string; icon: typeof Mic }[] = [
  { key: "voice", label: "Voice", icon: Mic },
  { key: "photo", label: "Photo", icon: Camera },
  { key: "type", label: "Type", icon: Keyboard },
];

function tabFromUrl(): Tab | null {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "voice" || t === "photo" || t === "type" ? t : null;
}

export function LogScreen() {
  // Rendered only after sign-in is known (AppShell), so reading the URL here is safe.
  const [tab, setTab] = useState<Tab>(() => tabFromUrl() ?? "voice");

  function choose(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", `?tab=${t}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/workout/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Log a workout</h1>
          <p className="text-muted-foreground text-xs">One you already finished. You check it before it&apos;s saved.</p>
        </div>
      </header>

      <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="tablist" aria-label="How to log">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => choose(key)}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold",
              tab === key ? "bg-foreground text-background" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* Both stay mounted so switching tabs doesn't lose what you've entered. */}
      <div hidden={tab === "photo"}>
        <LogChat mode={tab === "voice" ? "voice" : "type"} active={tab !== "photo"} />
      </div>
      <div hidden={tab !== "photo"}>
        <ImportScreen />
      </div>
    </div>
  );
}
