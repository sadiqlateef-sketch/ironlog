import test from "node:test";
import assert from "node:assert/strict";
import { LENS_CARDS, LENS_DISCLAIMER } from "../src/lib/nutrition/lens-content.ts";
import { lensCard, quizFrom } from "../src/lib/nutrition/lens.ts";

test("every lens card cites an https NIH or MedlinePlus page", () => {
  for (const c of LENS_CARDS) {
    assert.ok(c.sources.length >= 1, c.key);
    for (const s of c.sources) {
      const u = new URL(s.url);
      assert.equal(u.protocol, "https:", c.key);
      assert.ok(u.hostname.endsWith("nih.gov") || u.hostname.endsWith("medlineplus.gov"), `${c.key}: ${u.hostname}`);
      assert.match(s.accessed, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  assert.equal(LENS_DISCLAIMER, "Educational, not medical advice.");
});

test("lens covers every displayed nutrient plus water, creatine and vitamin D", () => {
  for (const k of ["energy", "protein", "carbohydrates", "fat", "fiber", "sugars", "sodium", "caffeine", "water", "creatine", "vitaminD"]) assert.ok(lensCard(k), k);
  assert.equal(lensCard("nope"), null);
});

test("lens cards never tell the reader what to do; the quiz answer is in the card", () => {
  for (const c of LENS_CARDS) {
    const text = [c.title, ...c.body, c.fact].join(" ").toLowerCase();
    assert.doesNotMatch(text, /\byou should\b|\bmust\b|\byou need to\b/, c.key);
    assert.ok(c.body.join(" ").toLowerCase().includes(c.answer.toLowerCase()), c.key);
  }
});

test("quiz: one question per card from its own fact, answer among the choices", () => {
  const q = quizFrom(LENS_CARDS);
  assert.equal(q.length, LENS_CARDS.length);
  for (const x of q) {
    const card = lensCard(x.key);
    assert.ok(card);
    assert.ok(x.prompt.includes("____"));
    assert.equal(x.prompt.replace("____", x.answer).toLowerCase(), card.fact.toLowerCase());
    assert.ok(x.choices.includes(x.answer));
    assert.equal(new Set(x.choices).size, x.choices.length);
    assert.ok(x.choices.length >= 2 && x.choices.length <= 4);
  }
});
