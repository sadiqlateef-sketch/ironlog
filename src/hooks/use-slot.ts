"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** An element the app shell renders (e.g. the slot above the tab bar), once it's in the page. */
export function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(
    noSubscribe,
    () => document.getElementById(id),
    () => null,
  );
}
