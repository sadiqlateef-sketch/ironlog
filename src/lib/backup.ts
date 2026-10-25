// Full backup: everything you've put into Ironlog, as one spreadsheet with a
// tab per kind of data. Weights are in your units; the IDs let each tab be
// matched up with the others (a set's workout ID is on the Workouts tab).

import { getSupabase } from "./supabase/client.ts";
import { kgToLb, type UnitSystem } from "./units.ts";
import { buildXlsx, type CellValue, type Sheet } from "./xlsx.ts";

type Row = Record<string, unknown>;

const PAGE = 1000;
const MAX_HEART_RATE_ROWS = 300_000;

/** Every row of a table you can see (your own, by row-level security), a page at a time. */
async function all(table: string, select: string, order: string[], limit = Infinity): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    // Tables are named at runtime here, so the typed client can't help; rows are read defensively below.
    let q = (getSupabase() as unknown as { from: (t: string) => { select: (s: string) => Query } }).from(table).select(select);
    for (const col of order) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
interface Query {
  order: (col: string) => Query;
  range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local "YYYY-MM-DD HH:MM", which spreadsheets sort and read as a date. */
function when(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  if (Number.isNaN(+d)) return v;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown): string => (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v));

export interface BackupData {
  profile: Row | null;
  sessions: Row[];
  sets: Row[];
  exercises: Row[];
  prefs: Row[];
  routines: Row[];
  routineExercises: Row[];
  programs: Row[];
  body: Row[];
  heartRate: Row[];
  adjustments: Row[];
}

export async function fetchBackupData(userId: string): Promise<BackupData> {
  const [profile, sessions, sets, exercises, prefs, routines, routineExercises, programs, body, heartRate, adjustments] = await Promise.all([
    all("users", "*", ["id"]).then((r) => r[0] ?? null),
    all("workout_sessions", "*", ["start_time", "id"]),
    all("workout_sets", "*, exercises(name)", ["session_id", "exercise_order", "set_number"]),
    all("exercises", "*", ["name"]).then((r) => r.filter((e) => e.created_by === userId)),
    all("exercise_prefs", "*, exercises(name)", ["exercise_id"]),
    all("routines", "*", ["position", "id"]),
    all("routine_exercises", "*, exercises(name)", ["routine_id", "position"]),
    all("programs", "*", ["created_at", "id"]),
    all("body_measurements", "*", ["measured_on"]),
    all("heart_rate_samples", "session_id, recorded_at, bpm, source", ["recorded_at", "id"], MAX_HEART_RATE_ROWS),
    all("routine_adjustments", "*", ["created_at", "id"]),
  ]);
  return { profile, sessions, sets, exercises, prefs, routines, routineExercises, programs, body, heartRate, adjustments };
}

export function backupSheets(d: BackupData, unit: UnitSystem, now = new Date()): Sheet[] {
  const lb = unit === "imperial";
  const W = lb ? "lb" : "kg";
  const w = (kg: unknown): CellValue => {
    const v = n(kg);
    return v == null ? null : Math.round((lb ? kgToLb(v) : v) * 100) / 100;
  };
  const cm = (v: unknown): CellValue => {
    const x = n(v);
    return x == null ? null : lb ? Math.round((x / 2.54) * 10) / 10 : x;
  };
  const sessionById = new Map(d.sessions.map((x) => [x.id, x]));
  // Sets in workout order (the database pages them by workout ID, which isn't by date).
  const startOf = (x: Row) => s(sessionById.get(x.session_id)?.start_time);
  const sets = [...d.sets].sort(
    (a, b) => startOf(a).localeCompare(startOf(b)) || s(a.session_id).localeCompare(s(b.session_id)) || Number(a.exercise_order) - Number(b.exercise_order) || Number(a.set_number) - Number(b.set_number),
  );
  const routineById = new Map(d.routines.map((x) => [x.id, x]));
  const programById = new Map(d.programs.map((x) => [x.id, x]));
  const exName = (x: Row) => s((x.exercises as Row | null)?.name);
  const p = d.profile ?? {};
  const stats = (p.physical_stats ?? {}) as Row;
  const finished = d.sessions.filter((x) => x.end_time);

  return [
    {
      name: "About",
      widths: [28, 60],
      rows: [
        ["Ironlog backup", ""],
        ["Made", when(now.toISOString())],
        ["Account", s(p.email)],
        ["Name", s(p.display_name)],
        ["Weights in", W],
        ["Workouts", finished.length],
        ["Sets", d.sets.length],
        ["First workout", finished.length ? when(finished[0].start_time) : ""],
        ["Height", cm(stats.height_cm) != null ? `${cm(stats.height_cm)} ${lb ? "in" : "cm"}` : ""],
        ["Bodyweight", w(stats.bodyweight_kg) != null ? `${w(stats.bodyweight_kg)} ${W}` : ""],
        ["Birth year", n(stats.birth_year)],
        ["Training goal", s(p.training_goal)],
        ["Days per week", n(p.training_days_per_week)],
        ["Equipment", s(p.training_equipment)],
        [`Bar weight (${W})`, w(p.bar_weight_kg)],
        [`Plates (${W})`, Array.isArray(p.available_plates_kg) ? (p.available_plates_kg as number[]).map((x) => w(x)).join(", ") : ""],
        ["Default rest (seconds)", n(p.default_rest_seconds)],
        ["Gym", s(p.gym_name)],
        ["", ""],
        ["Tabs", "Workouts, Sets, Your exercises, Exercise notes, Routines, Programs, Body, Heart rate, Suggestions"],
        ["Matching tabs up", "Each set's Workout ID is the ID on the Workouts tab."],
        ...(d.heartRate.length >= MAX_HEART_RATE_ROWS ? [["Heart rate", `Only the first ${MAX_HEART_RATE_ROWS.toLocaleString()} readings fit.`]] : []),
      ],
    },
    {
      name: "Workouts",
      widths: [17, 17, 9, 28, 9, 12, 8, 8, 8, 40, 38],
      rows: [
        ["Start", "End", "Minutes", "Name", "Source", `Volume (${W})`, "Avg HR", "Max HR", "At gym", "Notes", "ID"],
        ...d.sessions.map((x) => {
          const mins = x.end_time ? Math.round((Date.parse(s(x.end_time)) - Date.parse(s(x.start_time))) / 60_000) : null;
          return [when(x.start_time), when(x.end_time), mins, s(x.name), s(x.source), w(x.volume), n(x.avg_hr), n(x.max_hr), x.at_gym == null ? "" : x.at_gym ? "yes" : "no", s(x.notes), s(x.id)];
        }),
      ],
    },
    {
      name: "Sets",
      widths: [17, 24, 28, 6, 5, 9, 11, 6, 6, 12, 10, 12, 6, 30, 38],
      rows: [
        ["Date", "Workout", "Exercise", "Order", "Set", "Type", `Weight (${W})`, "Reps", "RPE", `Est. 1RM (${W})`, "Seconds", `Distance (${lb ? "mi" : "km"})`, "Done", "Notes", "Workout ID"],
        ...sets.map((x) => {
          const sess = sessionById.get(x.session_id);
          const dist = n(x.distance_m);
          return [
            when(x.completed_at ?? sess?.start_time),
            s(sess?.name),
            exName(x),
            n(x.exercise_order),
            n(x.set_number),
            s(x.set_type),
            w(x.weight),
            n(x.reps),
            n(x.rpe),
            w(x.estimated_1rm),
            n(x.duration_seconds),
            dist == null ? null : Math.round((dist / (lb ? 1609.344 : 1000)) * 100) / 100,
            x.is_completed ? "yes" : "no",
            s(x.notes),
            s(x.session_id),
          ];
        }),
      ],
    },
    {
      name: "Your exercises",
      widths: [30, 14, 24, 14, 11, 12, 30],
      rows: [
        ["Name", "Muscle", "Also works", "Equipment", "Type", "Tracks", "Other names"],
        ...d.exercises.map((x) => [s(x.name), s(x.primary_muscle), s(x.secondary_muscles), s(x.equipment), s(x.mechanic), s(x.tracking), s(x.aliases)]),
      ],
    },
    {
      name: "Exercise notes",
      widths: [30, 10, 12, 50],
      rows: [["Exercise", "Favorite", `Goal (${W})`, "Notes"], ...d.prefs.map((x) => [exName(x), x.favorite ? "yes" : "", w(x.goal_weight_kg), s(x.notes)])],
    },
    {
      name: "Routines",
      widths: [26, 22, 6, 6, 28, 6, 6, 9, 11, 6, 8, 8, 9, 30],
      rows: [
        ["Routine", "Program", "Week", "Day", "Exercise", "Sets", "Reps", "Reps max", `Weight (${W})`, "RPE", "% 1RM", "Warm-ups", "Rest (s)", "Notes"],
        ...d.routineExercises.map((x) => {
          const r = routineById.get(x.routine_id);
          return [
            s(r?.name),
            s(programById.get(r?.program_id)?.name),
            n(r?.program_week),
            n(r?.program_day),
            exName(x),
            n(x.target_sets),
            n(x.target_reps),
            n(x.target_reps_max),
            w(x.target_weight_kg),
            n(x.target_rpe),
            n(x.target_percent_1rm),
            n(x.warmup_sets),
            n(x.rest_seconds),
            s(x.notes),
          ];
        }),
      ],
    },
    {
      name: "Programs",
      widths: [28, 20, 7, 9, 8, 17, 50, 50],
      rows: [
        ["Name", "Method", "Weeks", "Days/week", "Active", "Started", "Summary", "Progression"],
        ...d.programs.map((x) => [s(x.name), s(x.methodology), n(x.weeks), n(x.days_per_week), x.is_active ? "yes" : "", when(x.started_at), s(x.summary), s(x.progression_rule)]),
      ],
    },
    {
      name: "Body",
      widths: [12, 12, 12, 12],
      rows: [["Date", `Weight (${W})`, "Body fat %", `Waist (${lb ? "in" : "cm"})`], ...d.body.map((x) => [s(x.measured_on), w(x.weight_kg), n(x.body_fat_pct), cm(x.waist_cm)])],
    },
    {
      name: "Heart rate",
      widths: [20, 6, 8, 38],
      rows: [
        ["Time", "BPM", "From", "Workout ID"],
        ...d.heartRate.map((x) => {
          const t = new Date(s(x.recorded_at));
          return [Number.isNaN(+t) ? s(x.recorded_at) : `${when(x.recorded_at)}:${pad(t.getSeconds())}`, n(x.bpm), s(x.source), s(x.session_id)];
        }),
      ],
    },
    {
      name: "Suggestions",
      widths: [17, 10, 12, 14, 8, 50, 9, 38],
      rows: [
        ["Date", "Action", `From (${W})`, `Suggested (${W})`, "Reps", "Why", "Status", "Workout ID"],
        ...d.adjustments.map((x) => [when(x.created_at), s(x.action), w(x.current_weight_kg), w(x.suggested_weight_kg), n(x.suggested_reps), s(x.reason), s(x.status), s(x.session_id)]),
      ],
    },
  ];
}

/** The whole backup as an .xlsx file. */
export async function buildBackup(userId: string, unit: UnitSystem): Promise<Blob> {
  const bytes = buildXlsx(backupSheets(await fetchBackupData(userId), unit));
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
