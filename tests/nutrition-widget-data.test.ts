import test from "node:test";
import assert from "node:assert/strict";
import { deepLinkPath, widgetPayload } from "../src/services/ironlogEcosystemSync.ts";

// Made-up day totals.
const day = { date: "2026-11-13", kcal: 1450.4, protein: 98.6, goalKcal: 2200, goalProtein: 160, waterMl: 1500, entries: 4, streak: 3 };

test("widget: kcal left, protein against goal, water", () => {
  assert.deepEqual(widgetPayload(day), { widgetTitle: "Food today", widgetLine1: "750 kcal left", widgetLine2: "99/160 g protein · 1.5 L water" });
  assert.equal(widgetPayload({ ...day, kcal: 2300 }).widgetLine1, "100 kcal over");
});

test("widget: unset goals show plain totals; nothing logged; no data", () => {
  const p = widgetPayload({ ...day, goalKcal: null, goalProtein: null, waterMl: 250 });
  assert.equal(p.widgetLine1, "1450 kcal");
  assert.equal(p.widgetLine2, "99 g protein · 250 ml water");
  assert.equal(widgetPayload({ ...day, kcal: 0, protein: 0, entries: 0, waterMl: 0 }).widgetLine1, "Nothing logged yet");
  assert.equal(widgetPayload({ ...day, kcal: 0, protein: 0, entries: 0, waterMl: 0 }).widgetLine2, "0/160 g protein");
  assert.equal(widgetPayload(null).widgetLine1, "Nothing logged yet");
});

test("deep link ironlog://food opens add food; others are ignored", () => {
  assert.equal(deepLinkPath("ironlog://food"), "/food/add/");
  assert.equal(deepLinkPath("ironlog://food/add/"), "/food/add/");
  assert.equal(deepLinkPath("ironlog://workout"), null);
  assert.equal(deepLinkPath("https://example.com/food"), null);
  assert.equal(deepLinkPath(null), null);
});
