// Matching exercise names from other apps and notes ("DB Row", "Bench Press
// (Barbell)") to the exercise library. Shared by the import-workout and
// claude-connector functions and the app's file import, so all three agree.

export interface Matchable {
  slug: string;
  name: string;
  aliases: string[];
  created_by: string | null;
}

const STOP = new Set(["the", "a", "with", "on", "of", "and"]);
const SYNONYMS: Record<string, string> = {
  db: "dumbbell", dbs: "dumbbell", dumbbells: "dumbbell", bb: "barbell", kb: "kettlebell", kettlebells: "kettlebell",
  ohp: "overhead press", rdl: "romanian deadlift", sldl: "stiff leg deadlift", bw: "bodyweight",
  ext: "extension", extensions: "extension", raises: "raise", curls: "curl", rows: "row", presses: "press",
  squats: "squat", lunges: "lunge", flyes: "fly", flies: "fly", pulldowns: "pulldown", pushups: "push up",
  pullups: "pull up", chinups: "chin up", ups: "up", dips: "dip", deadlifts: "deadlift", shrugs: "shrug",
};

/** Lowercase words with common gym shorthand spelled out. */
export function normalizeName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()[\]/,.\-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (SYNONYMS[w] ?? w).split(" "))
    .filter((w) => !STOP.has(w));
}

/**
 * Best library match for a name, by word overlap. Used when Claude's slug
 * isn't in the library. Returns null unless it's a confident match.
 */
export function matchByName<T extends Matchable>(name: string, library: T[]): T | null {
  const [best] = rankMatches(name, library, 1);
  return best && best.score >= 0.75 ? best.exercise : null;
}

/**
 * Library exercises ranked by how closely their names match, best first
 * (score 1 = the same words). Your own exercises win ties with built-ins.
 */
export function rankMatches<T extends Matchable>(name: string, library: T[], limit = 5): { exercise: T; score: number }[] {
  const want = new Set(normalizeName(name));
  if (want.size === 0) return [];
  const ranked: { exercise: T; score: number }[] = [];
  for (const e of library) {
    let score = 0;
    for (const candidate of [e.name, e.slug.replace(/-/g, " "), ...e.aliases]) {
      const have = new Set(normalizeName(candidate));
      if (have.size === 0) continue;
      let common = 0;
      for (const w of want) if (have.has(w)) common++;
      // Dice coefficient: 1 means the same words.
      score = Math.max(score, (2 * common) / (want.size + have.size));
    }
    if (score > 0) ranked.push({ exercise: e, score });
  }
  ranked.sort((a, b) => b.score - a.score || Number(!!b.exercise.created_by) - Number(!!a.exercise.created_by));
  return ranked.slice(0, limit);
}
