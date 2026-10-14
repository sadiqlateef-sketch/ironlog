"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Notes for the whole workout: how you felt, what to change next time. */
export function NotesSheet({
  open,
  onOpenChange,
  notes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string | null;
  onSave: (notes: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workout notes</DialogTitle>
          <DialogDescription>Saved with this workout.</DialogDescription>
        </DialogHeader>
        {/* Mounted fresh each time it opens, so it starts from the saved text. */}
        {open && <NotesForm initial={notes ?? ""} onSave={(t) => (onSave(t), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  );
}

function NotesForm({ initial, onSave }: { initial: string; onSave: (notes: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        autoFocus
        placeholder="e.g. Left shoulder felt tight on bench. Sleep was rough."
        className="border-input bg-secondary placeholder:text-muted-foreground focus-visible:ring-ring/50 rounded-xl border px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
      />
      <Button onClick={() => onSave(text)}>Save notes</Button>
    </>
  );
}
