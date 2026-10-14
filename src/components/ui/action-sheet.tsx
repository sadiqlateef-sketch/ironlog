"use client";

import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SheetAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  /** Small dot on the icon, e.g. "you haven't set this up yet". */
  dot?: boolean;
}

/** A bottom sheet of big, thumb-friendly choices (the "⋯" menu). */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actions: SheetAction[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ul className="-mx-2 flex flex-col">
          {actions.map(({ label, icon: Icon, onSelect, destructive, dot }) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onSelect();
                }}
                className={cn(
                  "hover:bg-accent flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3.5 text-left text-base font-medium",
                  destructive && "text-destructive",
                )}
              >
                {label}
                <span className="relative">
                  <Icon className="size-5" />
                  {dot && <span className="bg-destructive absolute -top-1 -right-1 size-2 rounded-full" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
