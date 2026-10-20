// Weekly recap: the facts we hand Claude, the shape it answers in, and a
// rule-based recap for when Claude can't be reached. Pure, so it's tested.

import { z } from "zod";
import { formatKg, type UnitSystem } from "./units.ts";

const DAY = 86_400_000;

export const RecapRequest = z.object({
  /** Monday of the week in the lifter's time zone, yyyy-mm-dd. */
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** new Date().getTimezoneOffset() on the phone: minutes to add to local time to get UTC. */
  tz_offset_min: z.number().int().min(-840).max(840),
});

/** UTC instant of local midnight at the start of week_start. */
export function weekStartInstant(weekStart: string, tzOffsetMin: number): number {
  const [y, m, d] = weekStart.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + tzOffsetMin * 60_000;
}

export const RecapOutput = z.object({
  headline: z.string().describe("One upbeat sentence, under 90 characters, about the week."),
  wins: z.array(z.string()).describe("1-3 specific wins with numbers, one short sentence each."),
  watch_outs: z.array(z.string()).describe("0-2 things to keep an eye on, one short sentence each. Empty if nothing stands out."),
  next_week: z.array(z.string()).describe("1-3 concrete, actionable focuses for next week, one short sentence each."),
});
export type RecapText = z.infer<typeof RecapOutput>;

export const RECAP_SYSTEM_PROMPT = `You write a short weekly training recap for a lifter using a strength-training log app.
Rules:
- Use only the facts given. Never invent numbers, lifts or records.
- Plain, warm, direct language at about an 8th-grade reading level. No jargon without a short explanation.
- Write weights exactly as given, in the lifter's unit.
- Be specific: name lifts and numbers. One short sentence per item.
- If the week was light or missed, be encouraging, not guilt-tripping.
- Watch-outs only for real patterns in the facts (a stalled lift, a muscle group with no sets, a big drop in workouts, very high average RPE). Otherwise leave it empty.
- Next-week focuses must be doable in the next 7 days.
- Do not give medical advice.`;

export interface RecapSet {
  session_id: string;
  exercise: string;
  muscle: string;
  set_type: string;
  weight_kg: number;
  reps: number;
  rpe: number | null;
}

export interface RecapSession {
  id: string;
  name: string | null;
  start: number;
  end: number | null;
  volume_kg: number;
}

const e1rm = (kg: number, reps: number) => (kg <= 0 || reps <= 0 ? 0 : reps === 1 ? kg : kg * (1 + reps / 30));

const GROUPS: Record<string, string> = {
  chest: "Chest", lats: "Back", upper_back: "Back", lower_back: "Back", traps: "Back",
  front_delts: "Shoulders", side_delts: "Shoulders", rear_delts: "Shoulders",
  biceps: "Arms", triceps: "Arms", forearms: "Arms",
  quads: "Legs", hamstrings: "Legs", glutes: "Legs", calves: "Legs", adductors: "Legs", abductors: "Legs",
  abs: "Core", obliques: "Core",
};

export interface RecapFacts {
  unit: UnitSystem;
  workouts: number;
  minutes: number;
  volume_kg: number;
  sets: number;
  prev_workouts: number;
  prev_volume_kg: number;
  /** Average workouts a week over the 4 weeks before this one. */
  avg_workouts_4w: number;
  avg_rpe: number | null;
  days: string[];
  groups: { group: string; sets: number }[];
  missing_groups: string[];
  records: { exercise: string; weight_kg: number; reps: number; e1rm_kg: number; prev_e1rm_kg: number }[];
  top_lifts: { exercise: string; weight_kg: number; reps: number }[];
}

/**
 * Everything worth saying about one week. `sessions` and `sets` cover this
 * week and up to 12 weeks before it (for records and comparisons).
 */
export function recapFacts(sessions: RecapSession[], sets: RecapSet[], weekStart: number, unit: UnitSystem): RecapFacts {
  const weekEnd = weekStart + 7 * DAY;
  const inWeek = (s: RecapSession) => s.start >= weekStart && s.start < weekEnd;
  const cur = sessions.filter(inWeek);
  const prev = sessions.filter((s) => s.start >= weekStart - 7 * DAY && s.start < weekStart);
  const before4 = sessions.filter((s) => s.start >= weekStart - 28 * DAY && s.start < weekStart);
  const curIds = new Set(cur.map((s) => s.id));
  const startOf = new Map(sessions.map((s) => [s.id, s.start]));
  const working = sets.filter((s) => s.set_type !== "warmup");
  const curSets = working.filter((s) => curIds.has(s.session_id));

  const groupCount = new Map<string, number>();
  for (const s of curSets) {
    const g = GROUPS[s.muscle];
    if (g) groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
  }
  const groups = [...groupCount.entries()].map(([group, n]) => ({ group, sets: n })).sort((a, b) => b.sets - a.sets);

  // Records: this week's best e1RM per lift against the best before this week.
  const before = new Map<string, number>();
  const best = new Map<string, { weight_kg: number; reps: number; e1rm_kg: number }>();
  for (const s of working) {
    const t = startOf.get(s.session_id);
    if (t == null) continue;
    const e = e1rm(s.weight_kg, s.reps);
    if (!e) continue;
    if (t < weekStart) before.set(s.exercise, Math.max(before.get(s.exercise) ?? 0, e));
    else if (t < weekEnd && e > (best.get(s.exercise)?.e1rm_kg ?? 0)) best.set(s.exercise, { weight_kg: s.weight_kg, reps: s.reps, e1rm_kg: e });
  }
  const records = [...best.entries()]
    .filter(([ex, b]) => (before.get(ex) ?? 0) > 0 && b.e1rm_kg > before.get(ex)! + 1e-6)
    .map(([exercise, b]) => ({ exercise, ...b, prev_e1rm_kg: before.get(exercise)! }));
  const top_lifts = [...best.entries()]
    .sort((a, b) => b[1].e1rm_kg - a[1].e1rm_kg)
    .slice(0, 5)
    .map(([exercise, b]) => ({ exercise, weight_kg: b.weight_kg, reps: b.reps }));

  const rpes = curSets.map((s) => s.rpe).filter((r): r is number => r != null && r > 0);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const minutes = Math.round(cur.reduce((t, s) => t + (s.end ? Math.max(0, s.end - s.start) / 60_000 : 0), 0));
  const sum = (xs: RecapSession[]) => xs.reduce((t, s) => t + s.volume_kg, 0);
  return {
    unit,
    workouts: cur.length,
    minutes,
    volume_kg: Math.round(sum(cur)),
    sets: curSets.length,
    prev_workouts: prev.length,
    prev_volume_kg: Math.round(sum(prev)),
    avg_workouts_4w: Math.round((before4.length / 4) * 10) / 10,
    avg_rpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    // Day of the week from the offset-free local start (weekStart is local midnight Monday).
    days: [...new Set(cur.map((s) => dayNames[(1 + Math.floor((s.start - weekStart) / DAY)) % 7]))],
    groups,
    missing_groups: cur.length >= 2 ? ["Chest", "Back", "Shoulders", "Arms", "Legs"].filter((g) => !groupCount.has(g)) : [],
    records,
    top_lifts,
  };
}

const w = (kg: number, unit: UnitSystem) => formatKg(kg, unit);
const big = (kg: number, unit: UnitSystem) => `${Math.round(unit === "imperial" ? kg * 2.2046226218 : kg).toLocaleString("en-US")} ${unit === "imperial" ? "lb" : "kg"}`;

/** The facts as text for Claude, in the lifter's unit. */
export function factsPrompt(f: RecapFacts): string {
  const u = f.unit;
  const lines = [
    `Lifter's unit: ${u === "imperial" ? "lb" : "kg"}`,
    `This week: ${f.workouts} workouts (${f.days.join(", ") || "none"}), ${f.sets} working sets, ${f.minutes} minutes, total volume ${big(f.volume_kg, u)}.`,
    `Last week: ${f.prev_workouts} workouts, volume ${big(f.prev_volume_kg, u)}. Average over the 4 weeks before: ${f.avg_workouts_4w} workouts a week.`,
    f.avg_rpe != null ? `Average RPE of working sets that had one: ${f.avg_rpe}.` : "RPE wasn't logged this week.",
    `Working sets by area: ${f.groups.map((g) => `${g.group} ${g.sets}`).join(", ") || "none"}.`,
    f.missing_groups.length ? `No sets this week for: ${f.missing_groups.join(", ")}.` : "",
    f.records.length
      ? `New records (best estimated 1RM ever): ${f.records.map((r) => `${r.exercise} ${w(r.weight_kg, u)} x ${r.reps} (est. 1RM ${w(r.e1rm_kg, u)}, was ${w(r.prev_e1rm_kg, u)})`).join("; ")}.`
      : "No new records this week.",
    f.top_lifts.length ? `Best sets: ${f.top_lifts.map((t) => `${t.exercise} ${w(t.weight_kg, u)} x ${t.reps}`).join("; ")}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** A recap written by rules, used when Claude isn't available. */
export function rulesRecap(f: RecapFacts): RecapText {
  const u = f.unit;
  if (f.workouts === 0) {
    return {
      headline: "A rest week. Your muscles got time to recover.",
      wins: f.avg_workouts_4w > 0 ? [`You'd averaged ${f.avg_workouts_4w} workouts a week before this, so the base is there.`] : ["Every plan has rest weeks."],
      watch_outs: [],
      next_week: ["Pick two days and put a workout on your calendar.", "Start a little lighter than last time and build back up."],
    };
  }
  const wins: string[] = [];
  for (const r of f.records.slice(0, 2)) wins.push(`New best on ${r.exercise}: ${w(r.weight_kg, u)} × ${r.reps}.`);
  if (f.workouts > f.prev_workouts) wins.push(`${f.workouts} workouts, ${f.workouts - f.prev_workouts} more than last week.`);
  if (!wins.length) wins.push(`${f.workouts} ${f.workouts === 1 ? "workout" : "workouts"} and ${f.sets} working sets logged.`);

  const watch: string[] = [];
  if (f.missing_groups.length) watch.push(`No sets for ${f.missing_groups.join(" or ").toLowerCase()} this week.`);
  if (f.avg_rpe != null && f.avg_rpe >= 9) watch.push(`Your average RPE was ${f.avg_rpe}. That's close to failure on most sets.`);
  if (f.prev_workouts >= 2 && f.workouts <= f.prev_workouts / 2) watch.push(`Workouts dropped from ${f.prev_workouts} to ${f.workouts}.`);

  const next: string[] = [];
  if (f.missing_groups.length) next.push(`Add a few sets for ${f.missing_groups[0].toLowerCase()}.`);
  if (f.top_lifts[0]) next.push(`Try to beat ${w(f.top_lifts[0].weight_kg, u)} × ${f.top_lifts[0].reps} on ${f.top_lifts[0].exercise}.`);
  if (f.workouts < Math.max(2, Math.round(f.avg_workouts_4w))) next.push("Get one more workout in than this week.");
  if (!next.length) next.push("Keep the same schedule and add a little weight where your reps felt easy.");

  return {
    headline: f.records.length ? `${f.records.length} new ${f.records.length === 1 ? "record" : "records"} this week. Nice work.` : `${f.workouts} ${f.workouts === 1 ? "workout" : "workouts"} done this week.`,
    wins: wins.slice(0, 3),
    watch_outs: watch.slice(0, 2),
    next_week: next.slice(0, 3),
  };
}

/** Claude's text, trimmed to the sizes the card shows. */
export function tidyRecap(r: RecapText): RecapText {
  const clip = (s: string) => s.trim().slice(0, 220);
  return {
    headline: clip(r.headline).slice(0, 120),
    wins: r.wins.map(clip).filter(Boolean).slice(0, 3),
    watch_outs: r.watch_outs.map(clip).filter(Boolean).slice(0, 2),
    next_week: r.next_week.map(clip).filter(Boolean).slice(0, 3),
  };
}
