"use client";

// One student-lens note in a sheet: what the nutrient does, from a cited
// NIH or MedlinePlus page. Educational, not medical advice.

import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LENS_DISCLAIMER, type LensCard } from "@/lib/nutrition/lens-content";

export function LensCardBody({ card }: { card: LensCard }) {
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid={`lens-${card.key}`}>
      {card.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Source</p>
        {card.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-primary-text flex items-center gap-1 text-xs underline-offset-2 hover:underline">
            {s.title} <ExternalLink className="size-3" aria-hidden />
            <span className="text-muted-foreground">(read {s.accessed})</span>
          </a>
        ))}
      </div>
      <p className="text-muted-foreground text-xs italic">{LENS_DISCLAIMER}</p>
    </div>
  );
}

export function LensSheet({ card, onOpenChange }: { card: LensCard | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {card && (
          <>
            <DialogHeader>
              <DialogTitle>{card.title}</DialogTitle>
              <DialogDescription>Student lens</DialogDescription>
            </DialogHeader>
            <LensCardBody card={card} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
