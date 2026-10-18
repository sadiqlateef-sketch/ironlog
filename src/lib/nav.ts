// The app's map: the four bottom tabs, and everything else under More.
// To add a screen to More, add one entry to MORE_SECTIONS.

import {
  Calculator,
  Compass,
  Camera,
  ChartLine,
  Dumbbell,
  House,
  ListChecks,
  Menu,
  MessageSquareText,
  Palette,
  Settings,
  Sparkles,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { WATCH_LINKING } from "@/lib/features";

export interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other screens that light up this tab (they're reached from it). */
  also?: string[];
}

export const TABS: Tab[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/workout/", label: "Workout", icon: Dumbbell, also: ["/log/", "/import/"] },
  { href: "/progress/", label: "Progress", icon: ChartLine },
  { href: "/more/", label: "More", icon: Menu, also: ["/exercises/", "/plans/", "/settings/", "/link-watch/", "/search/"] },
];

const strip = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);

/** The tab a screen belongs to. */
export function tabFor(pathname: string): Tab | undefined {
  const p = strip(pathname || "/");
  if (p === "/") return TABS[0];
  return TABS.find((t) => t.href !== "/" && [t.href, ...(t.also ?? [])].some((h) => p === strip(h) || p.startsWith(strip(h) + "/")));
}

export interface MoreItem {
  label: string;
  detail: string;
  icon: LucideIcon;
  /** A screen to open, or an action the More screen knows ("plates", "tour"). */
  href?: string;
  action?: "plates" | "tour";
  hidden?: boolean;
  /** Extra words search should find it by. */
  keywords?: string;
}

export const MORE_SECTIONS: { title: string; items: MoreItem[] }[] = [
  {
    title: "Training",
    items: [
      { label: "Programs", detail: "Your plans, and building a new one with Claude", icon: Sparkles, href: "/plans/" },
      { label: "Exercise library", detail: "Every exercise, with form demos and your history", icon: ListChecks, href: "/exercises/" },
      { label: "Plate calculator", detail: "Which plates go on each side of the bar", icon: Calculator, action: "plates", keywords: "barbell plates loading" },
    ],
  },
  {
    title: "Log and import",
    items: [
      { label: "Log with AI", detail: "Say or type a workout you already did", icon: MessageSquareText, href: "/log/?tab=voice" },
      { label: "Import from a photo", detail: "A screenshot, notebook page or whiteboard", icon: Camera, href: "/log/?tab=photo", keywords: "import screenshot picture" },
    ],
  },
  {
    title: "Devices",
    items: [{ label: "Watch pairing", detail: "Link your Galaxy Watch to log from your wrist", icon: Watch, href: "/link-watch/", hidden: !WATCH_LINKING }],
  },
  {
    title: "App",
    items: [
      { label: "Settings", detail: "Units, gym, reminders, connections and your data", icon: Settings, href: "/settings/", keywords: "units kg lb pounds kilograms export csv sign out calendar gym reminders" },
      { label: "Appearance", detail: "Light or dark, and text size", icon: Palette, href: "/settings/#appearance", keywords: "light mode dark mode theme font text size bigger" },
      { label: "Take the tour", detail: "A quick look at where everything is", icon: Compass, action: "tour" },
    ],
  },
];
