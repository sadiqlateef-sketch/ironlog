"use client";

// Android back button and back swipe, in this order:
//  1. anything that asked to handle back (useBackHandler) gets it, newest first;
//  2. an open sheet or dialog closes;
//  3. otherwise go back a screen (or to Home if there's no history);
//  4. on Home, leave the app, except mid-workout, when it only goes to the
//     background so the workout and rest timer keep running.

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { isNative } from "@/lib/native";

type Handler = () => boolean;
const handlers: Handler[] = [];

/**
 * While `active`, the back button calls `onBack` instead of leaving the
 * screen. For overlays that aren't a Dialog (those close on their own).
 */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    const h: Handler = () => (ref.current(), true);
    handlers.push(h);
    return () => {
      const i = handlers.lastIndexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}

/** An open sheet or dialog (Radix marks them data-state="open"). */
function openDialog(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/** Close the top sheet the same way the Escape key does. */
function closeTopDialog(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
}

export interface BackContext {
  pathname: string;
  canGoBack: boolean;
  goHome: () => void;
  workoutInProgress: () => Promise<boolean>;
}

/** What one press of back does. Exported for tests; returns what it did. */
export async function handleBack(ctx: BackContext): Promise<"handler" | "dialog" | "back" | "home" | "background" | "exit"> {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i]()) return "handler";
  if (openDialog()) {
    closeTopDialog();
    return "dialog";
  }
  const atHome = ctx.pathname === "/" || ctx.pathname === "";
  if (!atHome) {
    if (ctx.canGoBack) {
      window.history.back();
      return "back";
    }
    ctx.goHome();
    return "home";
  }
  if (await ctx.workoutInProgress()) {
    await App.minimizeApp().catch(() => {});
    return "background";
  }
  await App.exitApp().catch(() => {});
  return "exit";
}

/** Take over the Android back button. Returns a function that gives it back. */
export function listenForBack(get: () => Omit<BackContext, "canGoBack">): () => void {
  if (!isNative()) return () => {};
  const handle = App.addListener("backButton", ({ canGoBack }) => {
    handleBack({ ...get(), canGoBack });
  });
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
