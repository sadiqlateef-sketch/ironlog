"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Notes for the whole workout (how you felt, what to change), or for one exercise. */
export function NotesSheet({
  open,
  onOpenChange,
  notes,
  onSave,
  title = "Workout notes",
  description = "Saved with this workout.",
  placeholder = "e.g. Left shoulder felt tight on bench. Sleep was rough.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string | null;
  onSave: (notes: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* Mounted fresh each time it opens, so it starts from the saved text. */}
        {open && <NotesForm initial={notes ?? ""} placeholder={placeholder} onSave={(t) => (onSave(t), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  );
}

function NotesForm({ initial, placeholder, onSave }: { initial: string; placeholder: string; onSave: (notes: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        autoFocus
        placeholder={placeholder}
        className="border-input bg-secondary placeholder:text-muted-foreground focus-visible:ring-ring/50 rounded-xl border px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
      />
      <Button onClick={() => onSave(text)}>Save notes</Button>
    </>
  );
}
