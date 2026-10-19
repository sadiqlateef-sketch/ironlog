"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { PlateCalculator } from "@/components/plate-calculator";
import { replayTour } from "@/components/tour";
import { MORE_SECTIONS, type MoreItem } from "@/lib/nav";

/** One row on More (and in search results for the app's own screens). */
export function MoreRow({ item, onAction }: { item: MoreItem; onAction: (a: NonNullable<MoreItem["action"]>) => void }) {
  const { icon: Icon, label, detail } = item;
  const body = (
    <>
      <span className="bg-primary/15 text-primary-text grid size-10 shrink-0 place-items-center rounded-xl">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="text-muted-foreground block truncate text-sm">{detail}</span>
      </span>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </>
  );
  const cls = "hover:bg-accent active:bg-accent flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors";
  return item.href ? (
    <Link href={item.href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={() => item.action && onAction(item.action)}>
      {body}
    </button>
  );
}

/** Opens what a More action needs (the plate calculator sheet, the tour). */
export function useMoreActions() {
  const [plates, setPlates] = useState(false);
  return {
    run: (a: NonNullable<MoreItem["action"]>) => (a === "plates" ? setPlates(true) : replayTour()),
    sheets: <PlateCalculator open={plates} onOpenChange={setPlates} />,
  };
}

/** The More tab: everything that isn't Home, Workout or Progress. */
export function MoreScreen() {
  const actions = useMoreActions();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">More</h1>
      <Link
        href="/search/"
        className="glass text-muted-foreground flex h-12 items-center gap-2 rounded-2xl px-4 text-base"
        data-testid="more-search"
      >
        <Search className="size-5" aria-hidden />
        Search exercises, workouts, programs…
      </Link>
      {MORE_SECTIONS.map((section) => {
        const items = section.items.filter((i) => !i.hidden);
        if (!items.length) return null;
        return (
          <section key={section.title} className="flex flex-col gap-1">
            <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">{section.title}</h2>
            <div className="glass flex flex-col rounded-2xl p-1.5">
              {items.map((item) => (
                <MoreRow key={item.label} item={item} onAction={actions.run} />
              ))}
            </div>
          </section>
        );
      })}
      {actions.sheets}
    </div>
  );
}
