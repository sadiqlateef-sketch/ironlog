"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Coffee } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { listDay, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { caffeineAlertOn, isNative, scheduleCaffeineCutoff, setCaffeineAlert } from "@/lib/native";
import { shiftDay } from "@/lib/nutrition/day";
import { caffeineAt, cutoffTime, sleepAtFor } from "@/lib/nutrition/caffeine";
import { eatingWindow, hoursSinceEaten } from "@/lib/nutrition/fasting";
import type { NutritionGoals } from "@/lib/nutrition/goals";
import type { DiaryEntry } from "@/lib/nutrition/diary-types";
import { dayKey, normalizeShifts } from "@/lib/shifts";

const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`);

/**
 * Today's caffeine still active, at sleep, and the cutoff (from the user's
 * own half-life and threshold), plus time since last eaten and the eating
 * window. Uses yesterday's entries too, so a night shift reads right.
 */
export function CaffeineFastingCard({ day, entries, goals, now }: { day: string; entries: readonly DiaryEntry[]; goals: NutritionGoals; now: Date }) {
  const { profile } = useAuth();
  const [yesterday, setYesterday] = useState<DiaryEntry[]>([]);
  const [alert, setAlert] = useState(caffeineAlertOn);

  useEffect(() => {
    let live = true;
    const load = () =>
      listDay(shiftDay(day, -1))
        .then((l) => {
          if (live) setYesterday(l);
        })
        .catch(() => {});
    void load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NUTRITION_EVENT, load);
    };
  }, [day]);

  const all = useMemo(() => [...yesterday, ...entries], [yesterday, entries]);
  const shifts = useMemo(() => normalizeShifts(profile?.work_shifts), [profile?.work_shifts]);
  const { halfLifeH, sleepAt: fallback, thresholdMg } = goals.caffeine;

  const sleep = useMemo(() => {
    const cal = dayKey(now);
    const first = sleepAtFor(cal, shifts, fallback);
    return first > now ? first : sleepAtFor(shiftDay(cal, 1), shifts, fallback);
  }, [now, shifts, fallback]);

  const onBoard = caffeineAt(all, now, halfLifeH);
  const atSleep = caffeineAt(all, sleep, halfLifeH);
  const cutoff = thresholdMg === null ? null : cutoffTime(all, sleep, thresholdMg, halfLifeH);
  const cutoffAt = cutoff?.kind === "at" ? cutoff.at.getTime() : null;

  useEffect(() => {
    if (!alert) return;
    void scheduleCaffeineCutoff(cutoffAt === null ? null : new Date(cutoffAt));
  }, [alert, cutoffAt]);

  const since = hoursSinceEaten(now, all);
  const window_ = eatingWindow(entries);
  const hasCaffeine = onBoard >= 1 || atSleep >= 1;

  return (
    <Card className="gap-3 p-4" data-testid="food-caffeine-fasting">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Coffee className="text-primary-text size-4" aria-hidden /> Caffeine
        </h2>
        {hasCaffeine ? (
          <p className="text-sm tabular-nums">
            About {Math.round(onBoard)} mg now · {Math.round(atSleep)} mg at {clock(sleep)}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">None from logged food and drinks.</p>
        )}
        {cutoff?.kind === "at" && (
          <p className="text-sm tabular-nums" data-testid="food-caffeine-cutoff">
            {cutoff.at > now ? `Cutoff ${clock(cutoff.at)}` : "Past your cutoff"} for another {cutoff.doseMg} mg drink
          </p>
        )}
        {cutoff?.kind === "over" && <p className="text-sm">Above your {thresholdMg} mg setting at sleep already.</p>}
        {cutoff?.kind === "free" && <p className="text-muted-foreground text-sm">Another drink like your last stays under {thresholdMg} mg at sleep.</p>}
        {thresholdMg === null && (
          <Link href="/food/goals/#caffeine" className="text-muted-foreground text-xs underline-offset-4 hover:underline">
            Set a level for sleep to see a cutoff
          </Link>
        )}
        <p className="text-muted-foreground text-xs">
          Uses your settings: half-life {halfLifeH} h, sleep {clock(sleep)}
          {shifts.length ? " (after shifts when you have one)" : ""}. A setting, not medical advice.
        </p>
        {isNative() && thresholdMg !== null && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={alert}
              onChange={(e) => void setCaffeineAlert(e.target.checked).then(setAlert)}
              className="size-4"
            />
            Remind me at the cutoff
          </label>
        )}
      </div>
      <div className="flex flex-col gap-1 border-t pt-3">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Clock className="text-primary-text size-4" aria-hidden /> Eating window
        </h2>
        {since === null ? (
          <p className="text-muted-foreground text-sm">Nothing logged yet.</p>
        ) : (
          <p className="text-sm tabular-nums">Last ate {hrs(since)} ago</p>
        )}
        {window_ && (
          <p className="text-muted-foreground text-xs tabular-nums">
            Today: {clock(window_.first)} – {clock(window_.last)} ({hrs(window_.hours)})
          </p>
        )}
      </div>
    </Card>
  );
}
