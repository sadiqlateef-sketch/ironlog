"use client";

import { useEffect, useRef } from "react";

const MOVE_PX = 10;

interface PressState {
  timer: ReturnType<typeof setTimeout> | null;
  fired: boolean;
  start: { x: number; y: number } | null;
}

function cancel(s: PressState) {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  s.start = null;
}

/**
 * Press and hold for `ms` to run `onLongPress`; a normal tap still runs
 * `onClick`. Moving the finger (scrolling) cancels the hold. Spread the
 * returned handlers on the element.
 */
export function useLongPress(onLongPress: (() => void) | undefined, onClick: () => void, ms = 500) {
  const ref = useRef<PressState>({ timer: null, fired: false, start: null });

  useEffect(() => {
    const s = ref.current;
    return () => cancel(s);
  }, []);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (!onLongPress || e.button !== 0) return;
      const s = ref.current;
      cancel(s);
      s.fired = false;
      s.start = { x: e.clientX, y: e.clientY };
      s.timer = setTimeout(() => {
        s.timer = null;
        s.fired = true;
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = ref.current;
      if (s.start && Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y) > MOVE_PX) cancel(s);
    },
    onPointerUp: () => cancel(ref.current),
    onPointerLeave: () => cancel(ref.current),
    onPointerCancel: () => cancel(ref.current),
    onContextMenu: (e: React.MouseEvent) => {
      if (onLongPress) e.preventDefault();
    },
    onClick: () => {
      // The click that ends a long press is not a tap.
      const s = ref.current;
      if (s.fired) {
        s.fired = false;
        return;
      }
      onClick();
    },
  };
}
