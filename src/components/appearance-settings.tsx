"use client";

import { useState } from "react";
import { getTextSize, getTheme, setTextSize, setTheme, TEXT_SIZES, THEMES, type TextSize, type Theme } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/** Settings > Appearance: light or dark, and text size. Saved on this phone. */
export function AppearanceSettings() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [size, setSizeState] = useState<TextSize>(getTextSize);
  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        Theme
        <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={theme === t.value}
              onClick={() => (setTheme(t.value), setThemeState(t.value))}
              className={cn("h-10 rounded-lg font-semibold", theme === t.value ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        Text size
        <div className="bg-secondary grid grid-cols-4 gap-1 rounded-xl p-1" role="group" aria-label="Text size">
          {TEXT_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={size === s.value}
              aria-label={s.label}
              onClick={() => (setTextSize(s.value), setSizeState(s.value))}
              className={cn("grid h-12 place-items-center rounded-lg font-bold", size === s.value ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {/* Fixed px so each button previews its own size, whatever is chosen. */}
              <span aria-hidden style={{ fontSize: `${(16 * s.percent) / 100}px` }}>
                Aa
              </span>
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          {TEXT_SIZES.find((s) => s.value === size)!.label}. Changes every screen, including the workout logger.
        </p>
      </div>
    </>
  );
}
