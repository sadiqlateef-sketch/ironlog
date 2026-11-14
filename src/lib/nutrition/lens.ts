// Student lens lookups and the study-break quiz (extra 6). The quiz is built
// only from each card's own text, so it never says more than the cited page.

import { LENS_CARDS, type LensCard } from "./lens-content.ts";

export function lensCard(key: string): LensCard | null {
  return LENS_CARDS.find((c) => c.key === key) ?? null;
}

export interface QuizQuestion {
  key: string;
  prompt: string;
  answer: string;
  choices: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One fill-in-the-blank per card, with up to three other cards' answers as wrong choices. */
export function quizFrom(cards: readonly LensCard[], seed = 0): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  cards.forEach((c, i) => {
    const re = new RegExp(`(?<![a-z-])${escape(c.answer)}(?![a-z-])`, "i");
    if (!re.test(c.fact)) return;
    const others = [...new Set(cards.map((o) => o.answer))].filter((a) => a.toLowerCase() !== c.answer.toLowerCase());
    const wrong: string[] = [];
    for (let k = 0; k < others.length && wrong.length < 3; k++) {
      const a = others[(i * 7 + seed + k * 3) % others.length];
      if (!wrong.includes(a)) wrong.push(a);
    }
    const choices = [...wrong];
    choices.splice((i + seed) % (wrong.length + 1), 0, c.answer);
    out.push({ key: c.key, prompt: c.fact.replace(re, "____"), answer: c.answer, choices });
  });
  return out;
}
