// Look and feel on this phone: dark (default) or light, and how big text is.
// Saved in localStorage and applied to <html> before the first paint by the
// inline script in app/layout.tsx, so there's no flash of the wrong theme.

export type Theme = "dark" | "light" | "system";
export type TextSize = "small" | "default" | "large" | "xlarge";

export const THEME_KEY = "ironlog.theme";
export const TEXT_SIZE_KEY = "ironlog.textSize";

/** Root font size for each step. Everything is sized in rem, so the whole app scales. */
export const TEXT_SIZES: { value: TextSize; label: string; percent: number }[] = [
  { value: "small", label: "Small", percent: 93.75 },
  { value: "default", label: "Default", percent: 100 },
  { value: "large", label: "Large", percent: 112.5 },
  { value: "xlarge", label: "Extra large", percent: 125 },
];

export const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match phone" },
];

/** Browser bar / status bar colour for each look. */
const THEME_COLOR = { dark: "#07080f", light: "#f3f5fb" };

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function getTheme(): Theme {
  return read<Theme>(THEME_KEY, ["dark", "light", "system"], "dark");
}

export function getTextSize(): TextSize {
  return read<TextSize>(TEXT_SIZE_KEY, ["small", "default", "large", "xlarge"], "default");
}

function resolve(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Put the saved look on the page. */
export function applyAppearance(theme = getTheme(), size = getTextSize()): void {
  const root = document.documentElement;
  const look = resolve(theme);
  root.classList.toggle("light", look === "light");
  root.style.fontSize = size === "default" ? "" : `${TEXT_SIZES.find((s) => s.value === size)!.percent}%`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[look]);
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  applyAppearance(theme);
}

export function setTextSize(size: TextSize): void {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {}
  applyAppearance(undefined, size);
}

/** "Match phone": follow the phone when it switches between light and dark. */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-color-scheme: light)");
  const onChange = () => getTheme() === "system" && applyAppearance();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Same as applyAppearance, as a string for the inline <head> script (runs
 * before React, so it can't import anything).
 */
export const APPEARANCE_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_KEY)}),s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)});if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";if(t==="light"){d.classList.add("light");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLOR.light)})}var p=${JSON.stringify(Object.fromEntries(TEXT_SIZES.map((x) => [x.value, x.percent])))}[s];if(p&&p!==100)d.style.fontSize=p+"%"}catch(e){}})()`;
