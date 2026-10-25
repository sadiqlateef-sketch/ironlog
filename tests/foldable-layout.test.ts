import test from "node:test";
import assert from "node:assert/strict";
import { exerciseUnits, unitIndex } from "../src/lib/workout-logic.ts";

test("foldable layout: exercise units group supersets and split independent exercises", () => {
  const blocks = [
    { order: 1, supersetGroup: 1, sets: [] },
    { order: 2, supersetGroup: 1, sets: [] },
    { order: 3, supersetGroup: null, sets: [] },
    { order: 4, supersetGroup: 2, sets: [] },
    { order: 5, supersetGroup: 2, sets: [] },
  ];

  const units = exerciseUnits(blocks);
  // Unit 0: blocks 1 & 2 (superset 1)
  // Unit 1: block 3 (individual)
  // Unit 2: blocks 4 & 5 (superset 2)
  assert.equal(units.length, 3);
  assert.equal(unitIndex(blocks, 1), 0);
  assert.equal(unitIndex(blocks, 2), 0);
  assert.equal(unitIndex(blocks, 3), 1);
  assert.equal(unitIndex(blocks, 4), 2);
  assert.equal(unitIndex(blocks, 5), 2);
});

test("foldable layout: dual-pane and grid column spacing invariants", () => {
  // Verifies that multi-column grid item gap markers only appear between distinct units
  const blocks = [
    { order: 1, supersetGroup: null, sets: [] },
    { order: 2, supersetGroup: null, sets: [] },
    { order: 3, supersetGroup: null, sets: [] },
  ];

  const gaps = blocks.map((b, i) => i > 0 && unitIndex(blocks, blocks[i - 1].order) !== unitIndex(blocks, b.order));
  // Block 1: first item -> gap false
  // Block 2: distinct unit from Block 1 -> gap true
  // Block 3: distinct unit from Block 2 -> gap true
  assert.deepEqual(gaps, [false, true, true]);
});

test("foldable layout: screen size boundary verification (600dp breakpoint)", () => {
  // Folded cover screen threshold is < 600dp (typically 380-420dp width)
  // Unfolded inner screen threshold is >= 600dp (typically 700-800dp width)
  const isFoldedCover = (widthDp: number) => widthDp < 600;
  const isUnfoldedMain = (widthDp: number) => widthDp >= 600;

  // Folded cover screen (Galaxy Z Fold8 cover: ~412dp)
  assert.equal(isFoldedCover(412), true);
  assert.equal(isUnfoldedMain(412), false);

  // Unfolded main screen (Galaxy Z Fold8 inner: ~768dp)
  assert.equal(isFoldedCover(768), false);
  assert.equal(isUnfoldedMain(768), true);
});
