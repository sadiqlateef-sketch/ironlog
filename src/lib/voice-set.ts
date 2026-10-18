// Understand a set said out loud: "bench 185 for 8", "8 reps at 60 kilos",
// "one eighty five for eight", "same for 6", "bodyweight for 12".
//
// Pure TypeScript with no imports: the watch app keeps an identical copy at
// watch/src/voiceSet.ts (a test checks they match), so change both together.

export interface SpokenExercise<K> {
  key: K;
  name: string;
  aliases?: string[];
}

export interface SpokenSet<K> {
  /** As said, in `unit` (or the lifter's unit when unit is null). Null = keep what's there. */
  weight: number | null;
  /** "lb" or "kg" when they said it, else null. */
  unit: "lb" | "kg" | null;
  reps: number | null;
  /** They said "bodyweight": log 0 extra weight. */
  bodyweight: boolean;
  /** The exercise they named, or null to use the one they're on. */
  exercise: K | null;
  /** True when they named an exercise we couldn't find in this workout. */
  unknownExercise: boolean;
}

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const LB_WORDS = new Set(["lb", "lbs", "pound", "pounds"]);
const KG_WORDS = new Set(["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"]);
const REP_WORDS = new Set(["rep", "reps", "repetition", "repetitions"]);
/** Words between weight and reps: "185 for 8", "185 by 8", "185 times 8", "185 x 8". */
const JOIN_WORDS = new Set(["for", "by", "times", "x"]);
/** Words before a weight after the reps: "8 reps at 185". */
const AT_WORDS = new Set(["at", "with", "of", "on"]);
const BODYWEIGHT = new Set(["bodyweight", "bw"]);
const FILLER = new Set([
  "i", "did", "just", "log", "logged", "set", "sets", "the", "a", "an", "and", "my", "on", "of", "with", "at", "for", "by", "times", "x",
  "um", "uh", "okay", "ok", "so", "then", "got", "that", "was", "is", "it", "do", "done", "again", "please", "next", "plus",
  ...REP_WORDS, ...LB_WORDS, ...KG_WORDS,
]);
/** Gym shorthand for words in exercise names. */
const SYNONYMS: Record<string, string[]> = {
  bench: ["bench"],
  ohp: ["overhead", "press"],
  rdl: ["romanian", "deadlift"],
  rdls: ["romanian", "deadlift"],
  dead: ["deadlift"],
  deads: ["deadlift"],
  deadlifts: ["deadlift"],
  squats: ["squat"],
  rows: ["row"],
  curls: ["curl"],
  pullups: ["pull", "up"],
  pullup: ["pull", "up"],
  chinups: ["chin", "up"],
  chinup: ["chin", "up"],
  pushups: ["push", "up"],
  dips: ["dip"],
  lunges: ["lunge"],
  db: ["dumbbell"],
  bb: ["barbell"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1 x $2")
    .replace(/(\d)(lbs?|kgs?|kilos?|pounds?)\b/g, "$1 $2")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/body\s*weight/g, "bodyweight")
    .replace(/[-–]/g, " ")
    .replace(/[^a-z0-9.½ ]/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

type Tok = { word: string } | { num: number };

/**
 * Turn number words into numbers. Lifters say weights the short way:
 * "one eighty five" = 185, "two twenty five" = 225, "ninety five" = 95,
 * "a hundred and thirty five" = 135, "forty two and a half" = 42.5.
 */
function readNumbers(words: string[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const small = (j: number): { value: number; used: number } | null => {
    // 0-99 from words: "eighty five", "twelve", "eighty".
    const w = words[j];
    if (w in TENS) {
      const u = words[j + 1];
      if (u && u in UNITS && UNITS[u] > 0 && UNITS[u] < 10) return { value: TENS[w] + UNITS[u], used: 2 };
      return { value: TENS[w], used: 1 };
    }
    if (w in UNITS) return { value: UNITS[w], used: 1 };
    return null;
  };
  while (i < words.length) {
    const w = words[i];
    if (/^\d+(\.\d+)?½?$/.test(w) || w === "½") {
      out.push({ num: w === "½" ? 0.5 : parseFloat(w) + (w.endsWith("½") ? 0.5 : 0) });
      i++;
      continue;
    }
    // "a hundred ..." / "one hundred ..." / "two hundred ..."
    let j = i;
    let value: number | null = null;
    const lead = words[j] === "a" ? { value: 1, used: 1 } : small(j);
    if (lead && words[j + lead.used] === "hundred") {
      value = lead.value * 100;
      j += lead.used + 1;
      if (words[j] === "and" && words[j + 1] && small(j + 1)) j++;
      const rest = small(j);
      if (rest) {
        value += rest.value;
        j += rest.used;
      }
    } else if (lead && words[i] !== "a") {
      value = lead.value;
      j += lead.used;
      // "one eighty five" / "two twenty five" / "three fifteen": hundreds said as a digit.
      const next = words[j];
      if (lead.used === 1 && lead.value >= 1 && lead.value <= 9 && next && (next in TENS || (next in UNITS && UNITS[next] >= 10))) {
        const rest = small(j);
        if (rest) {
          value = lead.value * 100 + rest.value;
          j += rest.used;
        }
      }
    }
    if (value == null) {
      out.push({ word: w });
      i++;
      continue;
    }
    // "and a half" / "point five"
    if (words[j] === "and" && words[j + 1] === "a" && words[j + 2] === "half") {
      value += 0.5;
      j += 3;
    } else if (words[j] === "point" && words[j + 1] && words[j + 1] in UNITS) {
      value += UNITS[words[j + 1]] / 10;
      j += 2;
    }
    out.push({ num: value });
    i = j;
  }
  return out;
}

const isNum = (t: Tok | undefined): t is { num: number } => !!t && "num" in t;
const isWord = (t: Tok | undefined, set: Set<string>) => !!t && "word" in t && set.has(t.word);

function stem(w: string): string[] {
  if (SYNONYMS[w]) return SYNONYMS[w];
  return [w.length > 4 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -1) : w.length > 2 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w];
}

/** How well the spoken words name this exercise, 0 (not at all) to 1. */
function score(spoken: string[], name: string): number {
  const nameWords = tokenize(name).flatMap(stem);
  if (!spoken.length || !nameWords.length) return 0;
  let hit = 0;
  for (const s of spoken) if (nameWords.some((n) => n === s || (s.length >= 4 && n.startsWith(s)) || (n.length >= 4 && s.startsWith(n)))) hit++;
  // Most of what they said has to be in the name: "leg press" isn't "overhead press".
  if (hit / spoken.length < 0.66) return 0;
  // Mostly how much of what they said matched; a little for how much of the name it covers.
  return (hit / spoken.length) * 0.8 + (hit / nameWords.length) * 0.2;
}

function matchExercise<K>(spoken: string[], exercises: SpokenExercise<K>[]): K | null {
  let best: { key: K; s: number } | null = null;
  for (const e of exercises) {
    const s = Math.max(score(spoken, e.name), ...(e.aliases ?? []).map((a) => score(spoken, a)));
    if (s > 0 && (!best || s > best.s)) best = { key: e.key, s };
  }
  return best?.key ?? null;
}

/**
 * Read a spoken set. Returns null when there's nothing to log (no reps and
 * no weight heard). `exercises` are the ones in this workout.
 */
export function parseSpokenSet<K>(text: string, exercises: SpokenExercise<K>[] = []): SpokenSet<K> | null {
  const toks = readNumbers(tokenize(text));
  let weight: number | null = null;
  let reps: number | null = null;
  let unit: "lb" | "kg" | null = null;
  let bodyweight = false;
  const used = new Set<number>();

  const unitAt = (i: number) => (isWord(toks[i], LB_WORDS) ? "lb" : isWord(toks[i], KG_WORDS) ? "kg" : null);

  for (let i = 0; i < toks.length; i++) if (isWord(toks[i], BODYWEIGHT)) bodyweight = true;

  // "<reps> reps (at) <weight> (unit)"
  for (let i = 0; i < toks.length && reps == null; i++) {
    const t = toks[i];
    if (isNum(t) && isWord(toks[i + 1], REP_WORDS)) {
      reps = t.num;
      used.add(i);
      let j = i + 2;
      if (isWord(toks[j], AT_WORDS)) j++;
      const w = toks[j];
      if (isNum(w) && weight == null) {
        weight = w.num;
        used.add(j);
        unit = unitAt(j + 1);
      }
    }
  }

  // "<weight> (unit) for|by|times|x <reps>", or "<weight> <reps>" when the joiner was misheard.
  if (reps == null || weight == null) {
    const nums = toks.map((t, i) => (isNum(t) && !used.has(i) ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < nums.length && reps == null; k++) {
      const i = nums[k];
      let j = i + 1;
      const u = unitAt(j);
      if (u) j++;
      if (isWord(toks[j], JOIN_WORDS) && isNum(toks[j + 1])) {
        if (weight == null) {
          weight = (toks[i] as { num: number }).num;
          unit = u;
        }
        reps = (toks[j + 1] as { num: number }).num;
        used.add(i).add(j + 1);
      } else if (isNum(toks[j]) && !used.has(j)) {
        // "185 4 8": "for" heard as 4. Otherwise "185 8".
        const third = toks[j + 1];
        if ((toks[j] as { num: number }).num === 4 && isNum(third)) {
          weight = (toks[i] as { num: number }).num;
          reps = third.num;
          used.add(i).add(j).add(j + 1);
        } else {
          weight = (toks[i] as { num: number }).num;
          reps = (toks[j] as { num: number }).num;
          used.add(i).add(j);
        }
        unit = u ?? unitAt(j + 1);
      }
    }
  }

  // "bodyweight for 12", "same for 6", "for 8": just reps.
  if (reps == null) {
    for (let i = 0; i < toks.length; i++) {
      if (isNum(toks[i]) && !used.has(i) && (isWord(toks[i - 1], JOIN_WORDS) || bodyweight)) {
        reps = (toks[i] as { num: number }).num;
        used.add(i);
        break;
      }
    }
  }

  // One number on its own: reps if it's a believable rep count, else a weight.
  const left = toks.map((t, i) => (isNum(t) && !used.has(i) ? i : -1)).filter((i) => i >= 0);
  if (reps == null && weight == null && left.length === 1) {
    const i = left[0];
    const n = (toks[i] as { num: number }).num;
    const u = unitAt(i + 1);
    if (u || n > 30) {
      weight = n;
      unit = u;
    } else reps = n;
    used.add(i);
  }
  if (bodyweight) weight = 0;

  if (reps != null && (!Number.isFinite(reps) || reps < 0 || reps > 200)) reps = null;
  if (reps != null) reps = Math.round(reps);
  if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > 2000)) weight = null;
  if (reps == null && weight == null) return null;

  // Whatever words are left name the exercise.
  const spoken = toks
    .filter((t, i) => !used.has(i) && "word" in t && !FILLER.has(t.word) && !BODYWEIGHT.has(t.word) && t.word !== "same")
    .flatMap((t) => stem((t as { word: string }).word));
  const exercise = spoken.length ? matchExercise(spoken, exercises) : null;
  return { weight, unit, reps, bodyweight, exercise, unknownExercise: spoken.length > 0 && exercise == null };
}
