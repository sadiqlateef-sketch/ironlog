"use client";

import { useState } from "react";
import {
  ACCENT_THEMES,
  getAccentTheme,
  getTextSize,
  getTheme,
  setAccentTheme,
  setTextSize,
  setTheme,
  TEXT_SIZES,
  THEMES,
  type AccentTheme,
  type TextSize,
  type Theme,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

/** Settings > Appearance: light or dark, accent vibe palette, and text size. Saved on this phone. */
export function AppearanceSettings() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [size, setSizeState] = useState<TextSize>(getTextSize);
  const [accent, setAccentState] = useState<AccentTheme>(getAccentTheme);

  return (
    <>
      {/* Theme Mode */}
      <div className="flex flex-col gap-1 text-sm">
        Theme
        <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={theme === t.value}
              onClick={() => {
                setTheme(t.value);
                setThemeState(t.value);
              }}
              className={cn(
                "h-10 rounded-lg font-semibold transition-colors",
                theme === t.value ? "bg-foreground text-background shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent Theme Vibe */}
      <div className="flex flex-col gap-1 text-sm">
        <span className="flex items-center justify-between">
          <span>Accent Vibe</span>
          <span className="text-muted-foreground text-xs font-normal">
            {ACCENT_THEMES.find((a) => a.value === accent)?.description}
          </span>
        </span>
        <div className="grid grid-cols-5 gap-1.5 rounded-xl bg-secondary p-1" role="group" aria-label="Accent vibe">
          {ACCENT_THEMES.map((a) => {
            const isSelected = accent === a.value;
            return (
              <button
                key={a.value}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${a.label} accent: ${a.description}`}
                onClick={() => {
                  setAccentTheme(a.value);
                  setAccentState(a.value);
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg py-2 px-1 transition-all",
                  isSelected
                    ? "bg-foreground/15 ring-2 ring-primary text-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                )}
              >
                <span
                  className="size-5 rounded-full shadow-inner ring-1 ring-white/20 transition-transform"
                  style={{
                    backgroundColor: a.primary,
                    boxShadow: isSelected ? `0 0 12px ${a.glow}` : undefined,
                    transform: isSelected ? "scale(1.15)" : undefined,
                  }}
                />
                <span className="text-[11px] leading-tight">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Text Size */}
      <div className="flex flex-col gap-1 text-sm">
        Text size
        <div className="bg-secondary grid grid-cols-4 gap-1 rounded-xl p-1" role="group" aria-label="Text size">
          {TEXT_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={size === s.value}
              aria-label={s.label}
              onClick={() => {
                setTextSize(s.value);
                setSizeState(s.value);
              }}
              className={cn(
                "grid h-12 place-items-center rounded-lg font-bold transition-colors",
                size === s.value ? "bg-foreground text-background shadow" : "text-muted-foreground hover:text-foreground",
              )}
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
