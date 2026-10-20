"use client";

import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SortableList } from "@/components/ui/sortable-list";
import type { Block } from "@/hooks/use-workout";
import { exerciseUnits } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

/** The whole workout as a list: drag the handle to change the order. Supersets move together. */
export function ReorderSheet({
  open,
  onOpenChange,
  blocks,
  current,
  onReorder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: Block[];
  /** The exercise you're on, marked "Now". */
  current: number | null;
  onReorder: (next: Block[]) => void;
}) {
  const units = exerciseUnits(blocks);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reorder exercises</DialogTitle>
          <DialogDescription>Drag the handle to move an exercise. Supersets move together.</DialogDescription>
        </DialogHeader>
        <SortableList
          items={units}
          keyOf={(u) => String(u[0].order)}
          labelOf={(u) => u.map((b) => b.exercise.name).join(" and ")}
          onReorder={(next) => onReorder(next.flat())}
          renderItem={(u, handle) => {
            const done = u.every((b) => b.sets.length > 0 && b.sets.every((s) => s.done));
            const now = u.some((b) => b.order === current);
            return (
              <div
                className={cn(
                  "bg-secondary flex items-center gap-2 rounded-xl py-1 pr-3 pl-1",
                  u.length > 1 && "border-l-set-drop border-l-4",
                  now && "ring-primary-text/60 ring-1",
                )}
                data-testid="reorder-row"
              >
                {handle}
                <div className="min-w-0 flex-1 py-1.5">
                  {u.length > 1 && <p className="text-set-drop text-[11px] font-bold tracking-wide">SUPERSET</p>}
                  {u.map((b) => (
                    <p key={b.order} className={cn("truncate font-semibold", done && "text-muted-foreground")}>
                      {b.exercise.name}
                    </p>
                  ))}
                </div>
                {done ? (
                  <Check className="text-success size-5 shrink-0" aria-label="Done" />
                ) : now ? (
                  <span className="text-primary-text shrink-0 text-xs font-bold tracking-wide">NOW</span>
                ) : null}
              </div>
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
