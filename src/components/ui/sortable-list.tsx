"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { moveItem } from "@/lib/workout-plan";
import { cn } from "@/lib/utils";

/**
 * A list you reorder by dragging the six-dot handle (or focusing it and using
 * the arrow keys). Calls onReorder once, when you let go.
 */
export function SortableList<T>({
  items,
  keyOf,
  labelOf,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  keyOf: (item: T) => string;
  /** Spoken name for the handle, e.g. "Bench Press". */
  labelOf: (item: T) => string;
  onReorder: (next: T[]) => void;
  /** Render one row; put `handle` where the grip should go. */
  renderItem: (item: T, handle: ReactNode, index: number) => ReactNode;
  className?: string;
}) {
  const refs = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<{ key: string; y0: number; dy: number; order: T[] } | null>(null);
  const shown = drag?.order ?? items;

  function down(e: PointerEvent<HTMLButtonElement>, key: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key, y0: e.clientY, dy: 0, order: items });
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    let { y0, order } = drag;
    const i = order.findIndex((x) => keyOf(x) === drag.key);
    const cur = refs.current.get(drag.key);
    const dy = e.clientY - y0;
    if (cur) {
      const next = order[i + 1] && refs.current.get(keyOf(order[i + 1]));
      const prev = order[i - 1] && refs.current.get(keyOf(order[i - 1]));
      if (next && dy > 0) {
        const shift = next.offsetTop + next.offsetHeight - (cur.offsetTop + cur.offsetHeight);
        if (dy > shift / 2) {
          order = moveItem(order, i, i + 1);
          y0 += shift;
        }
      } else if (prev && dy < 0) {
        const shift = cur.offsetTop - prev.offsetTop;
        if (-dy > shift / 2) {
          order = moveItem(order, i, i - 1);
          y0 -= shift;
        }
      }
    }
    setDrag({ ...drag, y0, order, dy: e.clientY - y0 });
  }

  function up() {
    if (!drag) return;
    const changed = drag.order.some((x, i) => x !== items[i]);
    setDrag(null);
    if (changed) onReorder(drag.order);
  }

  function key(e: KeyboardEvent, index: number) {
    const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : null;
    if (to == null || to < 0 || to >= items.length) return;
    e.preventDefault();
    onReorder(moveItem(items, index, to));
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {shown.map((item, i) => {
        const k = keyOf(item);
        const dragging = drag?.key === k;
        const handle = (
          <button
            type="button"
            aria-label={`Reorder ${labelOf(item)}. Use the up and down arrow keys.`}
            className="text-muted-foreground hover:text-foreground grid size-10 shrink-0 cursor-grab touch-none place-items-center rounded-lg active:cursor-grabbing"
            onPointerDown={(e) => down(e, k)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={(e) => key(e, i)}
          >
            <GripVertical className="size-5" />
          </button>
        );
        return (
          <li
            key={k}
            ref={(el) => {
              if (el) refs.current.set(k, el);
              else refs.current.delete(k);
            }}
            className={cn("relative", dragging && "z-10 shadow-2xl")}
            style={dragging ? { transform: `translateY(${drag.dy}px) scale(1.02)` } : undefined}
          >
            {renderItem(item, handle, i)}
          </li>
        );
      })}
    </ul>
  );
}
