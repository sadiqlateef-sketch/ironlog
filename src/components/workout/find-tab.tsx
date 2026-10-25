"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  BicepsFlexed,
  Dumbbell,
  Flame,
  Home,
  PersonStanding,
  Play,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { MuscleFigure } from "@/components/muscle-map";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIES, TEMPLATES, type Category, type Template } from "@/lib/templates";
import { estimateMinutes, topMuscles } from "@/lib/workout-plan";
import {
  copyTemplateProgram,
  copyTemplateRoutine,
  getRoutine,
  listExercises,
  listWorkoutLog,
  startSession,
  startTemplateWorkout,
  type Exercise,
} from "@/lib/workout-api";
import { cn } from "@/lib/utils";
import type { MuscleGroup } from "@/types/database";

const ICONS: Record<Category, LucideIcon> = {
  muscle: BicepsFlexed,
  strength: Trophy,
  "fat-loss": Flame,
  ppl: ArrowLeftRight,
  "upper-lower": PersonStanding,
  "full-body": Dumbbell,
  abs: Sparkles,
  home: Home,
};

type Kind = "all" | "programs" | "workouts";
type Level = "all" | Template["level"];

/**
 * Browse: the AI plan card, categories, your most-repeated workouts and
 * ready-made programs and workouts you can start or copy.
 */
export function FindTab({
  busy,
  onStart,
  onPlanAdded,
}: {
  busy: boolean;
  onStart: (create: () => Promise<unknown>) => void;
  /** A program was copied (and maybe started): show the Planned tab. */
  onPlanAdded: () => void;
}) {
  const [library, setLibrary] = useState<Map<string, Exercise>>(new Map());
  const [repeated, setRepeated] = useState<{ routineId: string; name: string; count: number }[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [level, setLevel] = useState<Level>("all");
  const [filtering, setFiltering] = useState(false);
  const [open, setOpen] = useState<Template | null>(null);

  useEffect(() => {
    listExercises()
      .then((xs) => setLibrary(new Map(xs.filter((x) => !x.created_by).map((x) => [x.slug, x]))))
      .catch(() => {});
    listWorkoutLog()
      .then((log) => {
        const counts = new Map<string, { routineId: string; name: string; count: number }>();
        for (const s of log) {
          if (!s.routine_id) continue;
          const key = s.name ?? s.routine_id;
          const c = counts.get(key) ?? { routineId: s.routine_id, name: s.name ?? "Workout", count: 0 };
          c.count++;
          counts.set(key, c);
        }
        setRepeated([...counts.values()].filter((c) => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6));
      })
      .catch(() => {});
  }, []);

  const shown = useMemo(
    () =>
      TEMPLATES.filter(
        (t) =>
          (!category || t.categories.includes(category)) &&
          (level === "all" || t.level === level) &&
          (kind === "all" || (kind === "programs") === t.days.length > 1),
      ),
    [category, kind, level],
  );
  const filtered = kind !== "all" || level !== "all";
  const musclesOf = (t: Template) =>
    topMuscles(
      t.days.flatMap((d) => d.items.map((i) => library.get(i.slug)?.primary_muscle).filter((m): m is MuscleGroup => !!m)),
      5,
    );

  return (
    <div className="flex flex-col gap-5">
      <AdaptivePlanCard />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Categories</h2>
          <Button variant={filtered ? "default" : "secondary"} size="sm" onClick={() => setFiltering(true)}>
            <SlidersHorizontal /> Filter{filtered && " · on"}
          </Button>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {CATEGORIES.map((c) => {
            const Icon = ICONS[c.key];
            const on = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setCategory(on ? null : c.key)}
                className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
              >
                <span className={cn("grid size-16 place-items-center rounded-full", on ? "bg-primary text-primary-foreground" : "glass")}>
                  <Icon className="size-7" />
                </span>
                <span className={cn("text-center text-xs leading-tight font-semibold", !on && "text-muted-foreground")}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {!category && !filtered && repeated.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Trending for you</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {repeated.map((r) => (
              <button
                key={r.routineId}
                type="button"
                disabled={busy}
                onClick={() => onStart(async () => startSession(await getRoutine(r.routineId)))}
                className="from-primary/50 to-ai/30 flex h-32 w-44 shrink-0 flex-col justify-end rounded-2xl bg-gradient-to-br p-3 text-left"
              >
                <span className="text-foreground/85 text-xs font-semibold">Done {r.count}×</span>
                <span className="line-clamp-2 font-bold">{r.name}</span>
                <span className="text-foreground/85 mt-1 flex items-center gap-1 text-xs font-semibold">
                  <Play className="size-3 fill-current" /> Start again
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {category ? CATEGORIES.find((c) => c.key === category)!.label : "Ready-made programs"}
        </h2>
        {shown.length === 0 && <p className="text-muted-foreground text-sm">Nothing matches. Try another category or filter.</p>}
        <div className="grid grid-cols-2 gap-3">
          {shown.map((t) => {
            const muscles = musclesOf(t);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpen(t)}
                className="glass flex flex-col overflow-hidden rounded-2xl text-left"
                data-testid="template-card"
              >
                <span className="from-primary/35 to-ai/15 relative block h-24 bg-gradient-to-br" aria-hidden>
                  <MuscleFigure
                    side="front"
                    className="absolute top-2 left-1/2 h-24 -translate-x-1/2"
                    fill={(m) => (muscles.includes(m) ? "var(--primary-text)" : "rgb(255 255 255 / 0.12)")}
                  />
                </span>
                <span className="flex flex-col gap-0.5 p-3">
                  <span className="leading-tight font-bold">{t.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {t.days.length > 1 ? `${t.days.length} days/week · ${t.weeks} weeks` : `~${estimateMinutes(dayItems(t.days[0]))} min workout`}
                  </span>
                  <span className="text-muted-foreground text-xs">{t.level}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Dialog open={filtering} onOpenChange={setFiltering}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter</DialogTitle>
            <DialogDescription>Narrow down the ready-made programs.</DialogDescription>
          </DialogHeader>
          <FilterRow
            label="Type"
            value={kind}
            onChange={(v) => setKind(v as Kind)}
            options={[
              ["all", "All"],
              ["programs", "Programs"],
              ["workouts", "Single workouts"],
            ]}
          />
          <FilterRow
            label="Level"
            value={level}
            onChange={(v) => setLevel(v as Level)}
            options={[
              ["all", "All"],
              ["Beginner", "Beginner"],
              ["Intermediate", "Intermediate"],
            ]}
          />
          <Button onClick={() => setFiltering(false)}>Show {shown.length} results</Button>
        </DialogContent>
      </Dialog>

      <TemplateSheet
        template={open}
        library={library}
        busy={busy}
        onOpenChange={(o) => !o && setOpen(null)}
        onStart={onStart}
        onPlanAdded={() => {
          setOpen(null);
          onPlanAdded();
        }}
      />
    </div>
  );
}

const dayItems = (d: Template["days"][number]) =>
  d.items.map((i) => ({ target_sets: i.sets, warmup_sets: i.warmups ?? 0, rest_seconds: i.rest ?? 120 }));

function FilterRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={cn("h-10 rounded-lg text-sm font-semibold", value === v ? "bg-foreground text-background" : "text-muted-foreground")}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The big purple "Your Adaptive Program" card: hands off to the AI program builder. */
function AdaptivePlanCard() {
  // Training load over a 6-week cycle: three build weeks, a peak, a lighter week, then a new high.
  const load = [0.35, 0.5, 0.65, 0.8, 0.45, 0.9];
  const W = 300, H = 70;
  const pts = load.map((v, i) => [(i / (load.length - 1)) * W, H - v * H] as const);
  const path = pts.reduce((d, [x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${d} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#3a2a8c] via-[#2a1f66] to-[#151233] p-5 shadow-[0_10px_40px_rgb(110_80_230/0.35)]"
      data-testid="adaptive-plan"
    >
      <p className="text-ai text-xs font-bold tracking-wide uppercase">New cycle</p>
      <h2 className="text-2xl font-extrabold text-white">Your Adaptive Program</h2>
      <p className="text-sm text-white/80">The AI builds a multi-week program and adjusts it after every workout.</p>
      <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="my-3 h-20 w-full" aria-hidden preserveAspectRatio="none">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="rgb(179 154 255 / 0.18)" />
        <path d={path} fill="none" stroke="#b39aff" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Goal", "Your pick"],
          ["Length", "4–12 wks"],
          ["Adjusts", "Each workout"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/10 px-1 py-2">
            <dt className="text-[11px] font-semibold tracking-wide text-white/75 uppercase">{k}</dt>
            <dd className="text-sm font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <Button asChild size="lg" className="w-full bg-white text-[#2a1f66] shadow-none hover:bg-white/90">
        <Link href="/plans/#generator">
          <Sparkles /> Get Started
        </Link>
      </Button>
    </section>
  );
}

function TemplateSheet({
  template,
  library,
  busy,
  onOpenChange,
  onStart,
  onPlanAdded,
}: {
  template: Template | null;
  library: Map<string, Exercise>;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (create: () => Promise<unknown>) => void;
  onPlanAdded: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const t = template;
  const isProgram = !!t && t.days.length > 1;

  async function run(action: () => Promise<unknown>, done: string) {
    setSaving(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!t}
      onOpenChange={(o) => {
        if (!o) setMessage(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        {t && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold">{t.name}</DialogTitle>
              <DialogDescription>
                {isProgram ? `${t.days.length} days a week · ${t.weeks} weeks · ${t.level}` : `~${estimateMinutes(dayItems(t.days[0]))} min · ${t.level}`}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-relaxed">{t.description}</p>
            {t.days.map((d, i) => (
              <section key={d.name} className="glass rounded-2xl p-3">
                <h3 className="mb-1 font-bold">
                  {isProgram && <span className="text-primary-text">Day {i + 1} · </span>}
                  {d.name}
                  <span className="text-muted-foreground text-sm font-normal"> · ~{estimateMinutes(dayItems(d))} min</span>
                </h3>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {d.items.map((it) => (
                    <li key={it.slug} className="flex justify-between gap-2">
                      <span className="truncate">{library.get(it.slug)?.name ?? it.slug}</span>
                      <span className="text-muted-foreground shrink-0 num">
                        {it.sets} × {it.reps}
                        {it.repsMax ? `–${it.repsMax}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {message && <p className="text-sm font-semibold" role="status">{message}</p>}
            {isProgram ? (
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={saving}
                  onClick={() => run(() => copyTemplateProgram(t, false), "Saved to your programs.")}
                >
                  <Save /> Save
                </Button>
                <Button
                  size="lg"
                  disabled={saving}
                  onClick={async () => {
                    if (!confirm(`Start "${t.name}"? It becomes your active program.`)) return;
                    if (await run(() => copyTemplateProgram(t, true), "Program started.")) onPlanAdded();
                  }}
                >
                  <Play className="fill-current" /> Start program
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={saving}
                  onClick={() => run(() => copyTemplateRoutine(t.days[0], t.description), "Saved to My workouts.")}
                >
                  <Save /> Save
                </Button>
                <Button size="lg" disabled={busy || saving} onClick={() => onStart(() => startTemplateWorkout(t.days[0]))}>
                  <Play className="fill-current" /> Start now
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
