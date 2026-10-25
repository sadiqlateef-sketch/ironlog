"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "ironlog.progress.sections";

function readOpen(id: string): boolean {
  try {
    return !!JSON.parse(localStorage.getItem(KEY) ?? "{}")[id];
  } catch {
    return false;
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    localStorage.setItem(KEY, JSON.stringify({ ...all, [id]: open }));
  } catch {}
}

/**
 * A collapsible group of cards that looks like a card. It remembers whether you
 * left it open, and doesn't build its contents until it's first opened.
 */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (readOpen(id)) {
        setOpen(true);
        setSeen(true);
      }
    });
  }, [id]);

  return (
    <details open={open} className="glass rounded-2xl" data-testid={`section-${id}`}>
      <summary
        className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-bold [&::-webkit-details-marker]:hidden"
        onClick={(e) => {
          e.preventDefault();
          const next = !open;
          setOpen(next);
          if (next) setSeen(true);
          writeOpen(id, next);
        }}
      >
        {title}
        <ChevronDown className={cn("text-muted-foreground size-5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </summary>
      {seen && <div className="flex flex-col gap-4 px-3 pb-3">{children}</div>}
    </details>
  );
}
