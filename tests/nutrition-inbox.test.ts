import test from "node:test";
import assert from "node:assert/strict";
import { inboxAddHref, makeInboxItem, MAX_INBOX, normalizeInbox, orphanPhotos, photoFileFor } from "../src/lib/nutrition/inbox.ts";
import { DEFAULT_PREFS } from "../src/lib/nutrition/day.ts";
import type { Shift } from "../src/lib/shifts.ts";

const prefs = { ...DEFAULT_PREFS, day_start: "04:00" };

test("inbox food day and meal come from the capture time, not the logging time", () => {
  // 02:30 on the 13th is still the 12th's food day with a 04:00 day start.
  const late = makeInboxItem({ id: "a", takenAt: new Date(2026, 10, 13, 2, 30), prefs, shifts: [], note: "  kebab  " });
  assert.equal(late.foodDay, "2026-11-12");
  assert.equal(late.mealId, "meal-snacks");
  assert.equal(late.note, "kebab");
  const lunch = makeInboxItem({ id: "b", takenAt: new Date(2026, 10, 13, 12, 0), prefs, shifts: [], photoPath: photoFileFor("b") });
  assert.equal(lunch.foodDay, "2026-11-13");
  assert.equal(lunch.mealId, "meal-lunch");
  assert.equal(lunch.photoPath, "inbox/b.jpg");
  assert.equal(lunch.note, null);
});

test("inbox follows the shift-driven food day when it is on", () => {
  const shifts: Shift[] = [{ date: "2026-11-12", type: "night", start: "19:00", end: "07:30" }];
  const item = makeInboxItem({ id: "c", takenAt: new Date(2026, 10, 13, 9, 0), prefs: { ...DEFAULT_PREFS, follow_shifts: true }, shifts });
  assert.equal(item.foodDay, "2026-11-12");
});

test("normalizeInbox drops junk, sorts oldest first, caps the list", () => {
  const ok = { id: "x", takenAt: "2026-11-13T10:00:00.000Z", foodDay: "2026-11-13", mealId: null, note: null, photoPath: null };
  const older = { ...ok, id: "y", takenAt: "2026-11-12T10:00:00.000Z" };
  const out = normalizeInbox([ok, null, { id: "z" }, { ...ok, id: "bad", foodDay: "13/11" }, older]);
  assert.deepEqual(out.map((i) => i.id), ["y", "x"]);
  assert.deepEqual(normalizeInbox("nope"), []);
  const many = Array.from({ length: MAX_INBOX + 5 }, (_, i) => ({ ...ok, id: `n${i}`, takenAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() }));
  assert.equal(normalizeInbox(many).length, MAX_INBOX);
});

test("orphan sweep lists only unreferenced photo files", () => {
  const items = normalizeInbox([{ id: "a", takenAt: "2026-11-13T10:00:00.000Z", foodDay: "2026-11-13", mealId: null, note: null, photoPath: "inbox/a.jpg" }]);
  assert.deepEqual(orphanPhotos(items, ["a.jpg", "b.jpg", "notes.txt", "inbox/c.jpg"]), ["inbox/b.jpg", "inbox/c.jpg"]);
  assert.deepEqual(orphanPhotos([], []), []);
});

test("logging an inbox item opens add food on its day and meal", () => {
  assert.equal(inboxAddHref({ id: "a b", foodDay: "2026-11-12", mealId: "meal-snacks" }), "/food/add/?d=2026-11-12&meal=meal-snacks&inbox=a%20b");
  assert.equal(inboxAddHref({ id: "a", foodDay: "2026-11-12", mealId: null }), "/food/add/?d=2026-11-12&inbox=a");
});
