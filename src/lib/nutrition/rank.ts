// Order search results by how well the name fits the query, so "banana"
// shows Banana before "&Joy Frutas Banana + Cacau". Within a match level the
// food that lists more nutrients comes first, then the shorter name. Foods
// with no calories at all go last.

import { completeness } from "./quality.ts";
import type { RemoteFood } from "./types.ts";

/** Lowercase, accents and punctuation gone, single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * 0 exact name, 1 name starts with the query as whole words, 2 name starts
 * with the query, 3 every query word is a whole word in the name, 4 every
 * query word is somewhere in the name, 5 anything else. Lower is better.
 */
export function matchLevel(name: string, query: string): number {
  const n = normalizeName(name);
  const q = normalizeName(query);
  if (q === "") return 5;
  if (n === q) return 0;
  if (n.startsWith(`${q} `)) return 1;
  if (n.startsWith(q)) return 2;
  const words = q.split(" ");
  const nameWords = new Set(n.split(" "));
  if (words.every((w) => nameWords.has(w))) return 3;
  if (words.every((w) => n.includes(w))) return 4;
  return 5;
}

/** A new list, best match first. Equal foods keep the order they came in. */
export function rankFoods<T extends Pick<RemoteFood, "name" | "nutrients">>(query: string, foods: readonly T[]): T[] {
  const keyed = foods.map((food, i) => ({
    food,
    i,
    level: matchLevel(food.name, query),
    known: completeness(food.nutrients).known,
    // A food with no calories listed can't be logged usefully, so it sinks below every food that has them.
    empty: food.nutrients.energy.state === "incomplete" ? 1 : 0,
    len: normalizeName(food.name).length,
  }));
  keyed.sort((a, b) => a.empty - b.empty || a.level - b.level || b.known - a.known || a.len - b.len || a.i - b.i);
  return keyed.map((k) => k.food);
}
