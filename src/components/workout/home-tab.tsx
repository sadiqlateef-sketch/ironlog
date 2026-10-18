"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Bell, Dumbbell, Home, Link2, Play, Settings2, Shuffle, Sparkles } from "lucide-react";
import { EquipmentSheet } from "@/components/equipment-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useKits } from "@/hooks/use-kits";
import { MUSCLE_LABELS } from "@/lib/labels";
import { buildHomeWorkout, HOME_FOCUS, HOME_MINUTES, nightSeed, surprise, swapHomeItem, type HomeFocus, type HomeItem } from "@/lib/home-workout";
import { homeCalendarDefault, savedHomeOpts, saveHomeOpts, saveShuffles, shufflesFor, type HomeOpts } from "@/lib/home-prefs";
import { dayKey } from "@/lib/shifts";
import { formatWeight } from "@/lib/units";
import { homeReminderTime, isNative, setHomeReminder } from "@/lib/native";
import { listExercises, startPlannedSession, type Exercise } from "@/lib/workout-api";
import type { MuscleGroup } from "@/types/database";
import { cn } from "@/lib/utils";

type Item = HomeItem<Exercise>;

/**
 * "Use What You Got": tonight's 15-25 minute workout from your home kit. The
 * same one all evening, a fresh one tomorrow; shuffle for another take.
 * It logs like any workout, and asks "Add to calendar?" at the end.
 */
export function HomeTab({ busy, onStart }: { busy: boolean; onStart: (create: () => Promise<unknown>) => void }) {
  const { unit } = useAuth();
  const { home, ensureHome } = useKits();
  const [library, setLibrary] = useState<Exercise[] | null>(null);
  const [opts, setOpts] = useState<HomeOpts>(savedHomeOpts);
  const [today] = useState(() => dayKey(new Date()));
  const [shuffles, setShuffles] = useState(() => shufflesFor(dayKey(new Date())));
  const [swapped, setSwapped] = useState<{ for: string; items: Item[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listExercises()
      .then(setLibrary)
      .catch((e: Error) => setError(e.message));
  }, []);

  const seed = nightSeed(today, shuffles);
  const picked = opts.minutes === "surprise" ? surprise(seed) : { minutes: opts.minutes, focus: opts.focus };
  const signature = `${seed}|${picked.minutes}|${picked.focus}|${home ? JSON.stringify(home) : ""}`;
  const built = useMemo(() => (library && home ? buildHomeWorkout(library, home, picked, seed) : null), [library, home, picked.minutes, picked.focus, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = swapped?.for === signature ? swapped.items : (built?.items ?? []);

  function change(next: HomeOpts) {
    setOpts(next);
    saveHomeOpts(next);
  }
  function shuffle() {
    const n = shuffles + 1;
    setShuffles(n);
    saveShuffles(today, n);
  }
  function swap(i: number) {
    if (!library || !home) return;
    const taken = new Set(items.map((x) => x.exercise.slug));
    const next = swapHomeItem(items[i], library, home, taken);
    if (next) setSwapped({ for: signature, items: items.map((x, j) => (j === i ? next : x)) });
  }

  const start = () =>
    built &&
    home &&
    onStart(() =>
      startPlannedSession(
        { name: built.title, kitId: home.id, addToCalendar: homeCalendarDefault() },
        items.map((x) => ({ exercise_id: x.exercise.id, sets: x.sets, superset_group: x.group, weight_kg: x.dumbbell_kg })),
      ),
    );

  if (!home) {
    return (
      <section className="glass flex flex-col gap-3 rounded-3xl p-5">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Home className="size-5" /> Use What You Got
        </p>
        <p className="text-muted-foreground text-sm">
          A quick 15–25 minute workout every night, built only from what you have at home. Start with one 20 lb and one 40 lb dumbbell, a standard
          bar and 100 lb of plates, then change it to match.
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button
          onClick={() =>
            ensureHome()
              .then(() => setEditing(true))
              .catch((e: Error) => setError(e.message))
          }
        >
          Set up my home kit
        </Button>
      </section>
    );
  }

  const groups = groupItems(items);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Length">
          {HOME_MINUTES.map((m) => (
            <Choice key={m} on={opts.minutes === m} onClick={() => change({ ...opts, minutes: m })}>
              {m} min
            </Choice>
          ))}
          <Choice on={opts.minutes === "surprise"} onClick={() => change({ ...opts, minutes: "surprise" })} label="Surprise me">
            <Sparkles className="size-4" /> Surprise
          </Choice>
        </div>
        {opts.minutes !== "surprise" && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Focus">
            {(Object.keys(HOME_FOCUS) as HomeFocus[]).map((f) => (
              <Choice key={f} on={opts.focus === f} onClick={() => change({ ...opts, focus: f })} className="shrink-0 px-4">
                {HOME_FOCUS[f].label}
              </Choice>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!built ? (
        !error && <p className="text-muted-foreground text-sm">Building tonight&apos;s workout…</p>
      ) : (
        <section className="glass flex flex-col gap-3 rounded-3xl p-4">
          <header className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Tonight · {home.name}</p>
              <h2 className="text-xl leading-tight font-extrabold" data-testid="home-title">
                {picked.minutes} min {HOME_FOCUS[picked.focus].label}
              </h2>
              <p className="text-muted-foreground text-sm">
                ~{built.minutes} min · {items.length} exercises{groups.some((g) => g.length > 1) ? " in supersets" : ""}
              </p>
            </div>
            <Button variant="secondary" size="icon" aria-label="Shuffle tonight's workout" onClick={shuffle}>
              <Shuffle />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Edit your home kit" onClick={() => setEditing(true)}>
              <Settings2 />
            </Button>
          </header>

          {items.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Nothing in your kit fits this focus. Try another, or add to your kit.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {groups.map((g, gi) => (
                <li key={gi} className={cn("flex flex-col", g.length > 1 && "border-primary/40 rounded-2xl border-l-4 pl-2")}>
                  {g.length > 1 && (
                    <span className="text-primary-text flex items-center gap-1 text-xs font-semibold">
                      <Link2 className="size-3" /> Superset: one set of each, then rest
                    </span>
                  )}
                  {g.map(({ item: x, index }) => (
                    <div key={`${x.exercise.id}-${index}`} className="flex items-center gap-2 py-1.5">
                      {x.exercise.image_urls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={x.exercise.image_urls[0]} alt="" className="size-12 shrink-0 rounded-full bg-white object-cover" />
                      ) : (
                        <span className="bg-secondary grid size-12 shrink-0 place-items-center rounded-full">
                          <Dumbbell className="text-muted-foreground size-5" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{x.exercise.name}</p>
                        <p className="text-muted-foreground text-sm">
                          <span className="num">
                            {x.sets} × {x.repMin}–{x.repMax}
                            {x.exercise.tracking === "time" ? " s" : ""}
                          </span>
                          {x.dumbbell_kg != null && ` · ${formatWeight(x.dumbbell_kg, unit)}`}
                          {x.cue && ` · ${x.cue}`}
                          {!x.dumbbell_kg && !x.cue && ` · ${MUSCLE_LABELS[x.exercise.primary_muscle as MuscleGroup]}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Swap ${x.exercise.name}`} onClick={() => swap(index)}>
                        <ArrowLeftRight />
                      </Button>
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          )}
          <Button size="lg" disabled={busy || !items.length} onClick={start} data-testid="home-start">
            <Play className="fill-current" /> Start Workout
          </Button>
        </section>
      )}

      <ReminderRow />
      <EquipmentSheet open={editing} onOpenChange={setEditing} kitId={home.id} />
    </div>
  );
}

function groupItems(items: Item[]): { item: Item; index: number }[][] {
  const out: { item: Item; index: number }[][] = [];
  items.forEach((item, index) => {
    const last = out.at(-1);
    if (item.group != null && last && last[0].item.group === item.group) last.push({ item, index });
    else out.push([{ item, index }]);
  });
  return out;
}

const TIMES = ["18:00", "19:00", "19:30", "20:00", "21:00"];

/** "Remind me every evening" with a time. Android app only. */
export function ReminderRow() {
  const [time, setTime] = useState<string | null>(homeReminderTime);
  const [note, setNote] = useState<string | null>(null);
  if (!isNative()) return <p className="text-muted-foreground text-xs">An evening reminder is available in the Android app.</p>;
  async function set(t: string | null) {
    const now = await setHomeReminder(t);
    setTime(now);
    setNote(t && !now ? "Notifications are off for Ironlog. Turn them on in Android Settings > Apps > Ironlog > Notifications." : null);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="text-muted-foreground size-4" /> Evening reminder
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Evening reminder">
        <Choice on={time == null} onClick={() => set(null)} className="px-3">
          Off
        </Choice>
        {TIMES.map((t) => (
          <Choice key={t} on={time === t} onClick={() => set(t)} className="px-3">
            {label(t)}
          </Choice>
        ))}
      </div>
      {note && <p className="text-destructive text-sm">{note}</p>}
    </div>
  );
}

function label(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

function Choice({
  on,
  onClick,
  children,
  className,
  label: aria,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={aria}
      onClick={onClick}
      className={cn("flex h-11 items-center justify-center gap-1 rounded-xl text-sm font-semibold", on ? "bg-primary text-primary-foreground" : "glass", className)}
    >
      {children}
    </button>
  );
}
