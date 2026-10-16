import { test } from "node:test";
import assert from "node:assert/strict";
import { nextMorning, recoveryMessage } from "../src/lib/recovery-reminder.ts";

test("reminder is set for 9:00 the next day", () => {
  const d = nextMorning(new Date(2026, 9, 16, 19, 30));
  assert.equal(d.getDate(), 17);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 0);
  // Late on the last day of the month rolls into the next month.
  const e = nextMorning(new Date(2026, 9, 31, 23, 50));
  assert.equal(e.getMonth(), 10);
  assert.equal(e.getDate(), 1);
});

test("message names the most-trained muscles", () => {
  const m = recoveryMessage(["quads", "quads", "quads", "glutes", "glutes", "hamstrings", "calves"]);
  assert.equal(m.title, "Recovery day");
  assert.match(m.body, /^Your quads, glutes and hamstrings are still rebuilding/);
  assert.match(recoveryMessage(["chest"]).body, /^Your chest is still/);
  assert.match(recoveryMessage([]).body, /^Your muscles are rebuilding/);
});
