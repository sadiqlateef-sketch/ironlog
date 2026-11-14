"use client";

// Capture now, log later: a photo or a note of a meal, filed under the food
// day and meal it was eaten in. Photos stay on this phone and are deleted once
// the meal is logged or dismissed.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Inbox, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { useFoodInbox } from "@/hooks/use-food-inbox";
import { useMinuteClock } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { addToInbox, inboxPhotoUrl, removeFromInbox } from "@/lib/nutrition-inbox-store";
import { dayLabel, foodDayFor } from "@/lib/nutrition/day";
import { inboxAddHref, MAX_INBOX, type InboxItem } from "@/lib/nutrition/inbox";
import type { MealSlot } from "@/lib/nutrition/diary-types";

export function InboxScreen() {
  const { items } = useFoodInbox();
  const { prefs } = useNutritionPrefs();
  const shifts = useWorkShifts();
  const now = useMinuteClock();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const today = foodDayFor(now, prefs, shifts);
  const full = (items?.length ?? 0) >= MAX_INBOX;

  const capture = async (photo: File | null) => {
    if (!photo && !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addToInbox({ photo, note: note.trim() || null, prefs, shifts });
      setNote("");
    } catch {
      setError(full ? `The inbox holds ${MAX_INBOX} meals. Log or dismiss some first.` : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href="/food/">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-2xl leading-tight font-bold">Food inbox</h1>
          <p className="text-muted-foreground text-xs">Snap it now, log it later. Photos stay on this phone.</p>
        </div>
      </header>

      <section className="glass flex flex-col gap-2 rounded-2xl p-3">
        <Input aria-label="Note (optional)" placeholder="Note, e.g. chicken wrap from the canteen" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <Button type="button" className="flex-1" disabled={busy || full} onClick={() => fileInput.current?.click()}>
            <Camera /> Snap a meal
          </Button>
          <Button type="button" variant="outline" disabled={busy || full || !note.trim()} onClick={() => void capture(null)}>
            Save note
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => void capture(e.target.files?.[0] ?? null)}
        />
        {error && (
          <p role="status" className="text-muted-foreground text-sm">
            {error}
          </p>
        )}
      </section>

      {items === null ? (
        <SkeletonList rows={2} />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="Inbox is empty">
          Busy shift? Snap your meal and log it properly when you have a minute.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...items].reverse().map((item) => (
            <InboxRow key={item.id} item={item} today={today} meals={prefs.meals} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxRow({ item, today, meals }: { item: InboxItem; today: string; meals: readonly MealSlot[] }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    inboxPhotoUrl(item)
      .then((u) => live && setSrc(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [item]);
  const meal = meals.find((m) => m.id === item.mealId)?.name;
  const time = new Date(item.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <li className="glass flex items-center gap-3 rounded-2xl p-2">
      {src ? (
        // A local data: URL; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Meal photo" className="size-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="bg-secondary flex size-16 shrink-0 items-center justify-center rounded-xl">
          <Inbox className="text-muted-foreground size-6" aria-hidden />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.note ?? "Meal photo"}</span>
        <span className="text-muted-foreground text-xs">
          {dayLabel(item.foodDay, today)} · {meal ? `${meal} · ` : ""}
          {time}
        </span>
      </div>
      <Button asChild size="sm">
        <Link href={inboxAddHref(item)}>Log it</Link>
      </Button>
      <Button type="button" size="icon" variant="ghost" aria-label="Dismiss" onClick={() => void removeFromInbox(item.id)}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
