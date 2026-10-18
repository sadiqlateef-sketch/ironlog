// Bring years of history in from another app's export file: JEFIT's backup
// CSV first of all, but also Strong, Hevy, FitNotes or any spreadsheet with a
// date, an exercise and weight/reps columns. Everything here is pure (no
// network), so it can be checked in tests; the import screen does the saving.
//
// The file is read by its column names rather than a fixed layout, because
// apps change their exports and this has to keep working for the next one.

import { normalizeName, rankMatches, type Matchable } from "../../supabase/functions/_shared/match.ts";

export type SetType = "warmup" | "normal" | "drop" | "failure";

export interface FileSet {
  /** As written in the file, in the file's unit (null = bodyweight / none). */
  weight: number | null;
  reps: number;
  set_type: SetType;
  rpe: number | null;
  seconds: number | null;
  /** Only when this row says its own unit (files that mix lb and kg). */
  unit?: "lb" | "kg";
}

export interface FileExercise {
  name: string;
  sets: FileSet[];
}

export interface FileSession {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Local start time HH:MM when the file has one. */
  time: string | null;
  minutes: number | null;
  name: string | null;
  exercises: FileExercise[];
  /** Same file contents, same key: what stops a re-import doubling up. */
  key: string;
}

export interface FileHistory {
  app: "jefit" | "strong" | "hevy" | "spreadsheet";
  /** "lb"/"kg" when the file says which; null when it doesn't (JEFIT doesn't). */
  unit: "lb" | "kg" | null;
  sessions: FileSession[];
  /** Rows that had an exercise but nothing usable (shown, not silently lost). */
  skippedRows: number;
}

// ---------- CSV ----------

/** RFC 4180 CSV: quoted fields, "" escapes, commas/newlines inside quotes. Also reads tab- and semicolon-separated files. */
export function parseCsv(text: string, sep?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = sep ?? guessDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function guessDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 20).join("\n");
  const count = (ch: string) => head.split(ch).length;
  const [best] = [",", "\t", ";"].sort((a, b) => count(b) - count(a));
  return best;
}

interface Section {
  title: string;
  header: string[];
  rows: string[][];
}

/**
 * JEFIT's backup is one file holding several tables, each introduced by a
 * line like "### EXERCISE LOGS ###". Other apps' files are a single table.
 */
export function splitSections(text: string): Section[] {
  const out: Section[] = [];
  let title = "";
  let buf: string[] = [];
  const flush = () => {
    const rows = parseCsv(buf.join("\n"));
    if (rows.length) out.push({ title, header: rows[0].map(normHeader), rows: rows.slice(1) });
    buf = [];
  };
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*"?#{2,}\s*([^#"]*?)\s*#*"?\s*,*\s*$/);
    if (m) {
      flush();
      title = m[1].toLowerCase();
    } else buf.push(line);
  }
  flush();
  return out;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^"|"$/g, "").replace(/\s+/g, " ");
}

// ---------- Columns ----------

type Field =
  | "date" | "time" | "exercise" | "weight" | "reps" | "set" | "sets" | "logs" | "workout" | "session"
  | "duration" | "seconds" | "type" | "rpe" | "unit" | "start" | "end" | "total";

/** Header patterns for each field, most specific first. Checked in order, and a column is used once. */
const FIELDS: [Field, RegExp][] = [
  ["logs", /^(logs?|set ?logs?|sets ?data|record)$/],
  ["start", /^(starttime|start_time|start time|start|started|workout start)$/],
  ["end", /^(endtime|end_time|end time|end|ended|finish(ed)?( time)?)$/],
  ["total", /^(total_time|total time|totaltime)$/],
  ["date", /^(date|mydate|workout date|day|log date|performed|completed|date \(.*\))$/],
  ["time", /^(time of day|clock)$/],
  ["exercise", /^(exercise|exercise name|exercise_name|exercise_title|ename|exercisename|movement|lift)$/],
  ["seconds", /^(seconds|duration_seconds|duration \(s(ec(onds)?)?\)|time \(s(ec(onds)?)?\)|set duration|interval)$/],
  ["duration", /^(duration|workout duration|duration \(min(utes)?\)|minutes|length)$/],
  ["weight", /^(weight|weight_lbs|weight_kg|weight \((lbs?|kgs?)\)|load|lbs?|kgs?|weight \(lb\/kg\))$/],
  ["reps", /^(reps?|repetitions|rep count|reps_count)$/],
  ["set", /^(set|set order|set_index|set index|set #|set number|set_number|setnumber|order)$/],
  ["sets", /^(sets|set count|number of sets|# sets)$/],
  ["workout", /^(workout|workout name|workout_name|title|routine|routine name|session name|day name|program day)$/],
  ["session", /^(belongsession|session_id|session id|workout_id|workout id|_session_id)$/],
  ["type", /^(set type|set_type|settype|type)$/],
  ["rpe", /^(rpe|rir)$/],
  ["unit", /^(unit|units|weight unit|weight_unit)$/],
];

type Columns = Partial<Record<Field, number>>;

function columns(header: string[]): Columns {
  const cols: Columns = {};
  const used = new Set<number>();
  for (const [field, re] of FIELDS) {
    const i = header.findIndex((h, j) => !used.has(j) && re.test(h));
    if (i >= 0) {
      cols[field] = i;
      used.add(i);
    }
  }
  return cols;
}

function unitFromHeader(header: string[]): "lb" | "kg" | null {
  const h = header.join(" ");
  if (/weight[ _(]*lbs?\b|\blbs?\)|^lbs?$/.test(h) || header.includes("lb") || header.includes("lbs")) return "lb";
  if (/weight[ _(]*kgs?\b|\bkgs?\)/.test(h) || header.includes("kg") || header.includes("kgs")) return "kg";
  return null;
}

// ---------- Values ----------

const pad = (n: number) => String(n).padStart(2, "0");

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(/\s*(lbs?|kgs?)$/i, "").replace(/,(\d{1,2})$/, ".$1");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** When a value is a moment (unix seconds/ms or a date-time), its local day and time. */
export function parseMoment(raw: string | undefined): { date: string; time: string | null; ms: number | null } | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const fromDate = (d: Date, hasTime: boolean) =>
    Number.isNaN(+d) ? null : { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null, ms: hasTime ? +d : null };

  // Unix time in seconds or milliseconds (JEFIT stores start/end times this way).
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    return fromDate(new Date(s.length > 11 ? n : n * 1000), true);
  }
  // 2024-03-05, 2024-03-05 18:30[:00], 2024-03-05T18:30:00[Z]
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (m) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && m[4]) return fromDate(new Date(s), true);
    return dateParts(+m[1], +m[2], +m[3], m[4], m[5], m[7]);
  }
  // 03/05/2024 (US month first unless the first number can't be a month), 5.3.2024
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    if (a > 12 || s.includes(".")) [a, b] = [b, a];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return dateParts(y, a, b, m[4], m[5], m[7]);
  }
  // "28 Jan 2025, 07:30", "Jan 28, 2025 7:30 PM", "Tue Mar 05 2024"
  const cleaned = s.replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  const d = new Date(cleaned);
  return fromDate(d, /\d{1,2}:\d{2}/.test(s));
}

function dateParts(y: number, mo: number, d: number, h?: string, mi?: string, ampm?: string) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  if (new Date(y, mo - 1, d).getDate() !== d) return null; // Feb 30 and friends
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  if (h == null) return { date, time: null, ms: null };
  let hour = +h;
  if (ampm) hour = (hour % 12) + (/pm/i.test(ampm) ? 12 : 0);
  if (hour > 23 || +mi! > 59) return { date, time: null, ms: null };
  const local = new Date(y, mo - 1, d, hour, +mi!);
  return { date, time: `${pad(hour)}:${mi}`, ms: +local };
}

/** "1h 5m", "65", "65 min", "1:05:00", "3900s" -> minutes. */
export function parseMinutes(raw: string | undefined, assumeSeconds = false): number | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/);
  if (m && (m[1] || m[2] || m[3])) return Math.round((+(m[1] ?? 0) * 60 + +(m[2] ?? 0) + +(m[3] ?? 0) / 60) * 10) / 10 || null;
  m = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) return m[3] != null ? +m[1] * 60 + +m[2] + +m[3] / 60 : +m[1] + +m[2] / 60;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return assumeSeconds ? n / 60 : n;
}

function seconds(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) return +(m[1] ?? 0) * 3600 + +m[2] * 60 + +m[3];
  const n = num(s);
  return n != null && n > 0 ? Math.round(n) : null;
}

function setType(raw: string | undefined): SetType {
  const s = (raw ?? "").trim().toLowerCase();
  if (/^w|warm/.test(s)) return "warmup";
  if (/^d|drop/.test(s)) return "drop";
  if (/^f|fail/.test(s)) return "failure";
  return "normal";
}

/**
 * JEFIT's sets for one exercise on one day, all in one cell: "135x10,155x8,175x6".
 * Also reads "135 x 10", "135*10", "135×10", "135 lbs x 10", "x12" (bodyweight)
 * and "0:45" (a timed hold).
 */
export function parseLogs(raw: string): FileSet[] {
  const out: FileSet[] = [];
  // JEFIT writes a cardio entry as five "0x" fields, the last being the time in
  // seconds: "0x102.0,0x1.3,0x5.0,0x0.0,0x600". Keep the time; the other fields
  // aren't labelled in the export, so they're left out rather than guessed.
  const cardio = raw.trim().match(/^0x[\d.]+,0x[\d.]+,0x[\d.]+,0x[\d.]+,0x(\d+)(?:\.0+)?$/);
  if (cardio && (/\./.test(raw) || Number(cardio[1]) >= 120)) {
    const secs = Number(cardio[1]);
    return secs > 0 ? [{ weight: null, reps: 0, set_type: "normal", rpe: null, seconds: Math.min(86_400, secs) }] : [];
  }
  for (const part of raw.split(/[,;|]/)) {
    const p = part.trim().toLowerCase().replace(/\s*(lbs?|kgs?)\b/g, "");
    if (!p) continue;
    let m = p.match(/^(\d+(?:\.\d+)?)?\s*[x×*]\s*(\d+)(?:\s*[x×*]\s*(\d+))?$/);
    if (m) {
      const weight = m[1] != null ? Number(m[1]) : null;
      const reps = Number(m[2]);
      // "135x5x3" is three sets of 5.
      const times = m[3] ? Math.min(20, Number(m[3])) : 1;
      for (let i = 0; i < times; i++) if (reps > 0 || (weight ?? 0) > 0) out.push({ weight: weight || null, reps, set_type: "normal", rpe: null, seconds: null });
      continue;
    }
    m = p.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (m) {
      out.push({ weight: null, reps: 0, set_type: "normal", rpe: null, seconds: +(m[1] ?? 0) * 3600 + +m[2] * 60 + +m[3] });
      continue;
    }
    if (/^\d+$/.test(p) && +p > 0) out.push({ weight: null, reps: +p, set_type: "normal", rpe: null, seconds: null });
  }
  return out;
}

// ---------- Reading a file ----------

/**
 * Read an export file into workouts. Throws a plain-English error when the
 * file isn't something we can read.
 */
export function readHistoryFile(text: string): FileHistory {
  if (/^PK\u0003\u0004/.test(text)) throw new Error("That's an Excel or zip file. Save it as CSV first (in Google Sheets: File, Download, CSV), then pick the CSV.");
  const sections = splitSections(text);
  const isJefit = sections.some((s) => /exercise ?logs?|workout ?sessions?|jefit/.test(s.title)) || sections.some((s) => s.header.includes("ename") || s.header.includes("mydate"));

  // The table with the sets in it: has an exercise column and either a logs
  // column or weight/reps columns. Prefer one JEFIT calls EXERCISE LOGS.
  const scored = sections
    .map((s) => ({ s, c: columns(s.header) }))
    .filter(({ c }) => c.exercise != null && (c.logs != null || c.reps != null || c.weight != null || c.seconds != null))
    .sort((a, b) => Number(/log/.test(b.s.title)) - Number(/log/.test(a.s.title)) || b.s.rows.length - a.s.rows.length);
  const best = scored[0];
  if (!best) {
    throw new Error(
      "Couldn't find the workouts in that file. It needs columns for the date, the exercise, and the weight and reps (or JEFIT's logs). Make sure you picked the export file, not a screenshot or a PDF.",
    );
  }
  const { s: log, c } = best;
  if (c.date == null && c.start == null && c.session == null) throw new Error("That file has exercises but no dates, so there's no way to tell which workout each set belongs to.");

  // JEFIT keeps start/end times in a separate WORKOUT SESSIONS table.
  const sessionInfo = isJefit ? jefitSessionTable(sections, log) : null;

  const unit = unitFromHeader(log.header) ?? (isJefit ? jefitUnit(sections) : null);
  const app: FileHistory["app"] = isJefit
    ? "jefit"
    : log.header.includes("exercise_title") || log.header.includes("weight_lbs") || log.header.includes("weight_kg")
      ? "hevy"
      : log.header.includes("set order") && log.header.includes("workout name")
        ? "strong"
        : "spreadsheet";

  type Group = { date: string; time: string | null; ms: number | null; minutes: number | null; name: string | null; exercises: Map<string, FileExercise>; order: string[] };
  const groups = new Map<string, Group>();
  let skippedRows = 0;
  const get = (row: string[], f: Field) => (c[f] != null ? row[c[f]!] : undefined);

  for (const row of log.rows) {
    const name = (get(row, "exercise") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;
    const rawSession = (get(row, "session") ?? "").trim();
    const sessionId = rawSession === "0" ? "" : rawSession; // JEFIT uses 0 for "no session"
    const info = sessionId ? sessionInfo?.byId.get(sessionId) : undefined;
    const when = parseMoment(get(row, "start")) ?? parseMoment(get(row, "date"));
    const date = when?.date ?? info?.date;
    if (!date) {
      skippedRows++;
      continue;
    }
    const time = (when?.time ?? null) || (info?.time ?? null) || null;

    // The sets on this row.
    let sets: FileSet[];
    if (c.logs != null && (get(row, "logs") ?? "").trim()) {
      sets = parseLogs(get(row, "logs")!);
    } else {
      const reps = num(get(row, "reps")) ?? 0;
      const weight = num(get(row, "weight"));
      const rowUnit = (get(row, "unit") ?? "").trim().toLowerCase();
      const secs = seconds(get(row, "seconds"));
      const rpeRaw = num(get(row, "rpe"));
      const rir = c.rpe != null && log.header[c.rpe] === "rir";
      const rpe = rpeRaw == null ? null : rir ? 10 - rpeRaw : rpeRaw;
      const one: FileSet = {
        weight: weight && weight > 0 ? weight : null,
        reps: Math.max(0, Math.round(reps)),
        // Strong writes warm-up/drop/failure sets as W, D or F in the set column.
        set_type: c.type != null ? setType(get(row, "type")) : /^[wdf]$/i.test((get(row, "set") ?? "").trim()) ? setType(get(row, "set")) : "normal",
        rpe: rpe != null && rpe >= 1 && rpe <= 10 ? Math.round(rpe * 2) / 2 : null,
        seconds: secs,
        ...(/^kgs?$/.test(rowUnit) ? { unit: "kg" as const } : /^lbs?$/.test(rowUnit) ? { unit: "lb" as const } : {}),
      };
      // Rows like "Bench, 3 sets, 5 reps, 225" stand for several sets.
      const count = c.sets != null && c.set == null ? Math.round(num(get(row, "sets")) ?? 1) : 1;
      sets = one.reps > 0 || (one.weight ?? 0) > 0 || one.seconds ? Array.from({ length: Math.min(20, Math.max(1, count)) }, () => ({ ...one })) : [];
    }
    if (sets.length === 0) {
      skippedRows++;
      continue;
    }

    const workout = (get(row, "workout") ?? "").trim() || null;
    const groupKey = sessionId ? `id:${sessionId}` : c.start != null && time ? `t:${date} ${time}` : `d:${date}|${app === "jefit" ? "" : (workout ?? "")}`;
    let g = groups.get(groupKey);
    if (!g) {
      const startMs = when?.ms ?? info?.ms ?? null;
      const endMoment = parseMoment(get(row, "end"));
      const minutes =
        info?.minutes ??
        (endMoment?.ms != null && startMs != null && endMoment.ms > startMs ? (endMoment.ms - startMs) / 60_000 : null) ??
        parseMinutes(get(row, "duration")) ??
        null;
      g = { date, time, ms: startMs, minutes, name: workout, exercises: new Map(), order: [] };
      if (!g.time && !sessionId && sessionInfo) {
        // JEFIT logs only carry the day; the session table has that day's times.
        const day = sessionInfo.byDate.get(date);
        if (day) Object.assign(g, { time: day.time, ms: day.ms, minutes: g.minutes ?? day.minutes });
      }
      groups.set(groupKey, g);
    }
    // Same exercise twice in one workout (one row per set): keep adding sets.
    const exKey = name.toLowerCase();
    let x = g.exercises.get(exKey);
    if (!x) {
      x = { name, sets: [] };
      g.exercises.set(exKey, x);
      g.order.push(exKey);
    }
    x.sets.push(...sets);
  }

  const sessions: FileSession[] = [...groups.values()]
    .map((g) => {
      const exercises = g.order.map((k) => g.exercises.get(k)!).map((x) => ({ ...x, sets: x.sets.slice(0, 60) })).slice(0, 40);
      const minutes = g.minutes != null && g.minutes > 0 && g.minutes <= 600 ? Math.round(g.minutes) : null;
      return { date: g.date, time: g.time, minutes, name: g.name?.slice(0, 80) ?? null, exercises, key: sessionKey(app, g.date, g.time, exercises) };
    })
    .filter((s) => s.exercises.length > 0)
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));

  if (sessions.length === 0) throw new Error("That file was read, but no sets with weight, reps or time were in it.");
  return { app, unit, sessions: dedupeWithinFile(sessions), skippedRows };
}

/** JEFIT's unit: the SETTING table's mass (" lbs" / " kgs"), or a weight_lbs/weight_kg column in its set logs. */
function jefitUnit(sections: Section[]): "lb" | "kg" | null {
  for (const sec of sections) {
    const fromHeader = unitFromHeader(sec.header);
    if (fromHeader) return fromHeader;
    const mass = sec.header.indexOf("mass");
    const v = mass >= 0 ? (sec.rows[0]?.[mass] ?? "").trim().toLowerCase() : "";
    if (/^lbs?$/.test(v)) return "lb";
    if (/^kgs?$/.test(v)) return "kg";
  }
  return null;
}

interface SessionInfo {
  date: string;
  time: string | null;
  ms: number | null;
  minutes: number | null;
}

function jefitSessionTable(sections: Section[], log: Section): { byId: Map<string, SessionInfo>; byDate: Map<string, SessionInfo> } | null {
  const table = sections.find((s) => s !== log && (/session/.test(s.title) || (s.header.includes("starttime") && s.header.includes("endtime"))));
  if (!table) return null;
  const c = columns(table.header);
  const idCol = table.header.findIndex((h) => h === "_id" || h === "id");
  const byId = new Map<string, SessionInfo>();
  const byDate = new Map<string, SessionInfo>();
  for (const row of table.rows) {
    const start = parseMoment(c.start != null ? row[c.start] : undefined);
    const end = parseMoment(c.end != null ? row[c.end] : undefined);
    const day = parseMoment(c.date != null ? row[c.date] : undefined);
    const date = day?.date ?? start?.date;
    if (!date) continue;
    let minutes: number | null = null;
    if (start?.ms != null && end?.ms != null && end.ms > start.ms) minutes = (end.ms - start.ms) / 60_000;
    else if (c.total != null) minutes = parseMinutes(row[c.total], true);
    const info: SessionInfo = { date, time: start?.date === date ? start.time : null, ms: start?.date === date ? start.ms : null, minutes };
    if (idCol >= 0 && row[idCol]) byId.set(row[idCol].trim(), info);
    // Two sessions in a day: keep the longer one's times for the day's logs.
    const had = byDate.get(date);
    if (!had || (info.minutes ?? 0) > (had.minutes ?? 0)) byDate.set(date, info);
  }
  return { byId, byDate };
}

function dedupeWithinFile(sessions: FileSession[]): FileSession[] {
  const seen = new Set<string>();
  return sessions.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)));
}

/**
 * A fingerprint of one workout: the app, the day, and every exercise's sets.
 * Re-exporting the same history later gives the same keys.
 */
export function sessionKey(app: string, date: string, time: string | null, exercises: FileExercise[]): string {
  const body = exercises
    .map((x) => `${x.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}=${x.sets.map((s) => `${s.weight ?? 0}x${s.reps}${s.seconds ? `t${s.seconds}` : ""}`).join(",")}`)
    .join(";");
  return `${app}:${date}${time ? `T${time}` : ""}:${hash(body)}`;
}

/** 53-bit string hash (cyrb53), as hex. Not for security, just a stable fingerprint. */
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// ---------- After reading ----------

/** Every exercise name in the file with how many sets it has, most-used first. */
export function exerciseNames(h: FileHistory): { name: string; sets: number; timed: boolean }[] {
  const m = new Map<string, { name: string; sets: number; timed: number }>();
  for (const s of h.sessions)
    for (const x of s.exercises) {
      const k = x.name.toLowerCase();
      const e = m.get(k) ?? { name: x.name, sets: 0, timed: 0 };
      e.sets += x.sets.length;
      e.timed += x.sets.filter((y) => y.seconds && !y.reps).length;
      m.set(k, e);
    }
  return [...m.values()].map((e) => ({ name: e.name, sets: e.sets, timed: e.timed > e.sets / 2 })).sort((a, b) => b.sets - a.sets);
}

/**
 * Sensible muscle, equipment and movement type for an exercise Ironlog
 * doesn't know, from its name. You can change them later on the Exercises tab.
 */
export function guessExerciseDetails(name: string): {
  primary_muscle: string;
  equipment: string;
  mechanic: "compound" | "isolation";
} {
  const n = ` ${name.toLowerCase()} `;
  const has = (re: RegExp) => re.test(n);
  const equipment = has(/smith/)
    ? "smith_machine"
    : has(/ez|e-z|curl bar/)
      ? "ez_bar"
      : has(/trap bar|hex bar/)
        ? "trap_bar"
        : has(/dumbbell|\bdb\b/)
          ? "dumbbell"
          : has(/kettlebell|\bkb\b/)
            ? "kettlebell"
            : has(/cable|pulldown|pushdown|face pull|crossover/)
              ? "cable"
              : has(/machine|press machine|leg press|leg extension|leg curl|pec deck|hammer strength|seated row machine|hack squat/)
                ? "machine"
                : has(/band/)
                  ? "band"
                  : has(/barbell|\bbb\b|deadlift|squat|bench press|overhead press|clean|snatch/)
                    ? "barbell"
                    : has(/push.?up|pull.?up|chin.?up|dip|plank|crunch|sit.?up|burpee|bodyweight|air squat|leg raise/)
                      ? "bodyweight"
                      : "other";
  const muscle: [RegExp, string][] = [
    [/calf|calves/, "calves"],
    [/hamstring|leg curl|romanian|rdl|stiff/, "hamstrings"],
    [/hip thrust|glute|kickback|bridge/, "glutes"],
    [/adduct/, "adductors"],
    [/abduct/, "abductors"],
    [/squat|leg press|lunge|leg extension|step.?up|split/, "quads"],
    [/deadlift|back extension|good morning|hyperextension/, "lower_back"],
    [/shrug/, "traps"],
    [/face pull|rear delt|reverse fly/, "rear_delts"],
    [/lateral raise|side raise|upright row/, "side_delts"],
    [/overhead press|shoulder press|military|arnold|front raise|\bohp\b/, "front_delts"],
    [/pull.?up|chin.?up|pulldown|pullover|lat /, "lats"],
    [/row/, "upper_back"],
    [/tricep|pushdown|skull|close.?grip|dip|extension/, "triceps"],
    [/curl/, "biceps"],
    [/wrist|forearm|farmer/, "forearms"],
    [/oblique|twist|side bend|woodchop/, "obliques"],
    [/crunch|plank|sit.?up|ab |abs|leg raise|core|rollout/, "abs"],
    [/bench|chest|fly|flye|push.?up|pec/, "chest"],
  ];
  const primary = muscle.find(([re]) => has(re))?.[1] ?? "chest";
  const isolation = has(/curl|raise|fly|flye|extension|pushdown|kickback|shrug|crunch|calf|pec deck|face pull|wrist/);
  return { primary_muscle: primary, equipment, mechanic: isolation ? "isolation" : "compound" };
}

// ---------- Ready to save ----------

const LB_PER_KG = 2.2046226218;

export interface SessionToSave {
  import_key: string;
  name: string;
  start: Date;
  minutes: number;
  exercises: {
    exercise_id: string;
    sets: { weight_kg: number; reps: number; set_type: SetType; rpe: number | null; duration_seconds: number | null }[];
  }[];
}

/**
 * One workout from the file, with exercise names swapped for Ironlog exercise
 * ids and weights in kg. No time in the file: 6 PM that day. No length: about
 * three minutes a set, between 20 minutes and 2 hours.
 */
export function toSessionToSave(s: FileSession, exerciseIds: Map<string, string>, fileUnit: "lb" | "kg", fallbackName: string): SessionToSave | null {
  const exercises: SessionToSave["exercises"] = [];
  for (const x of s.exercises) {
    const id = exerciseIds.get(x.name.toLowerCase());
    if (!id) continue;
    // Same Ironlog exercise twice (two JEFIT names mapped to one): merge.
    const existing = exercises.find((e) => e.exercise_id === id);
    const sets = x.sets.map((set) => {
      const unit = set.unit ?? fileUnit;
      const kg = set.weight ? (unit === "lb" ? set.weight / LB_PER_KG : set.weight) : 0;
      return {
        weight_kg: Math.round(Math.min(1000, Math.max(0, kg)) * 1000) / 1000,
        reps: Math.min(999, Math.max(0, set.reps)),
        set_type: set.set_type,
        rpe: set.rpe,
        duration_seconds: set.seconds != null ? Math.min(86_400, set.seconds) : null,
      };
    });
    if (existing) existing.sets.push(...sets);
    else exercises.push({ exercise_id: id, sets });
  }
  if (exercises.length === 0) return null;
  const setCount = exercises.reduce((n, x) => n + x.sets.length, 0);
  const [y, mo, d] = s.date.split("-").map(Number);
  const [h, mi] = (s.time ?? "18:00").split(":").map(Number);
  return {
    import_key: s.key,
    name: s.name?.trim() || fallbackName,
    start: new Date(y, mo - 1, d, h, mi),
    minutes: s.minutes ?? Math.min(120, Math.max(20, setCount * 3)),
    exercises,
  };
}

// ---------- Matching a whole history ----------

// Words that make it a different exercise: an incline press isn't a flat one,
// a Romanian deadlift isn't a conventional one. A file's name and a library
// name must agree on every one of these.
const DISTINCT = new Set([
  "incline", "decline", "close", "wide", "narrow", "reverse", "romanian", "stiff", "sumo", "front", "rear", "overhead", "upright",
  "seated", "standing", "lying", "prone", "one", "single", "alternate", "alternating", "hammer", "preacher", "concentration", "bent",
  "high", "low", "behind", "neck", "deficit", "split", "bulgarian", "goblet", "hack", "landmine", "straight", "drag", "french", "skull",
  "kickback", "military", "arnold", "zottman", "spider", "face", "hip", "leg", "calf", "chest", "shoulder", "arm", "tricep", "bicep", "delt",
  "lat", "ab", "glute", "jump", "box", "pause", "pin", "floor", "push", "pull", "chin", "dip", "lunge", "shrug", "squat", "deadlift",
  "row", "press", "curl", "raise", "fly", "extension", "pushdown", "pulldown", "crunch", "twist", "plank", "kick", "crossover", "cross",
]);
const EQUIPMENT_WORDS: Record<string, string> = {
  barbell: "barbell", dumbbell: "dumbbell", cable: "cable", machine: "machine", smith: "smith_machine", ez: "ez_bar",
  kettlebell: "kettlebell", band: "band", hex: "trap_bar",
};
const WORD_FORMS: Record<string, string> = { dumbell: "dumbbell", dumbells: "dumbbell", triceps: "tricep", biceps: "bicep", delts: "delt", deltoid: "delt", lats: "lat", abs: "ab", abdominal: "ab", calves: "calf", glutes: "glute", flys: "fly", raises: "raise", crossovers: "crossover" };

/**
 * The library exercise a file's exercise name is, or null. Stricter than the
 * photo import's matching because a wrong match here would quietly fold years
 * of, say, incline bench into flat bench records: equipment and every
 * distinguishing word must agree. When unsure it says no, and the exercise is
 * added as your own instead (which you can still change on the check screen).
 */
export function matchForImport<T extends Matchable & { equipment: string }>(name: string, library: T[]): { exercise: T; sure: boolean } | null {
  const words = (s: string) =>
    new Set(
      normalizeName(s.replace(/\bshoulder shrug/gi, "shrug").replace(/\bup[\s-]*right\b/gi, "upright").replace(/\bcross[\s-]*overs?\b/gi, "crossover").replace(/\bpush[\s-]*downs?\b/gi, "pushdown").replace(/\bpull[\s-]*downs?\b/gi, "pulldown"))
        .map((w) => WORD_FORMS[w] ?? w),
    );
  const want = words(name);
  const wantEquip = [...want].map((w) => EQUIPMENT_WORDS[w]).find(Boolean);
  const core = (set: Set<string>) => [...set].filter((w) => DISTINCT.has(w)).sort().join(" ");
  for (const { exercise, score } of rankMatches(name, library, 25)) {
    if (score < 0.6) break;
    if (wantEquip && exercise.equipment !== wantEquip && !(wantEquip === "machine" && exercise.equipment === "smith_machine")) continue;
    for (const candidate of [exercise.name, ...exercise.aliases]) {
      const have = words(candidate);
      [...have].forEach((w) => EQUIPMENT_WORDS[w] && have.delete(w));
      const mine = new Set([...want].filter((w) => !EQUIPMENT_WORDS[w]));
      if (core(have) !== core(mine)) continue;
      const same = have.size === mine.size && [...have].every((w) => mine.has(w));
      return { exercise, sure: same };
    }
  }
  return null;
}
