// Global search: one box for exercises, past workouts, programs and the
// app's own screens. Pure matching here; the screen loads the lists.

/** Lowercase, no accents or punctuation, so "Pull-up" finds "pullup" and "pull up". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * How well `query` matches any of `fields` (the first is the name): 0 = no match.
 * Every word typed must appear somewhere; a name that starts with the query ranks highest.
 */
export function score(query: string, fields: (string | null | undefined)[]): number {
  const q = normalize(query);
  if (!q) return 0;
  const words = q.split(" ");
  const texts = fields.filter((f): f is string => !!f).map(normalize);
  if (!texts.length) return 0;
  const all = texts.join(" | ");
  const squashed = all.replace(/ /g, "");
  if (!words.every((w) => all.includes(w) || squashed.includes(w))) return 0;
  const name = texts[0];
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.split(" ").some((w) => w.startsWith(words[0]))) return 60;
  if (words.every((w) => name.includes(w))) return 40;
  return 20;
}

/** The items that match, best first, ties kept in their original order. */
export function rank<T>(query: string, items: T[], fields: (item: T) => (string | null | undefined)[]): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(query, fields(item)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
