import test from "node:test";
import assert from "node:assert/strict";

// Feature 1: Velocity
import {
  estimateRpeFromVelocity,
  analyzeSetVelocity,
  integrateConcentricVelocity,
} from "../src/lib/velocity.ts";

// Feature 2: Drop Sets
import {
  calculateDropLoad,
  generateDropSequence,
  generateRestPausePlan,
} from "../src/lib/drop-sets.ts";

// Feature 3: Volume Landmarks
import {
  evaluateMuscleVolume,
  evaluateDeloadTrigger,
  VOLUME_LANDMARKS,
} from "../src/lib/volume-landmarks.ts";

// Feature 4: Equipment Scanner
import {
  calculateEffectiveCableTension,
  encodeMachineQr,
  parseMachineQr,
} from "../src/lib/equipment-scanner.ts";

// Feature 6: DOMS Heatmap
import {
  calculateDomsAdjustedReadiness,
  evaluateDomsImpact,
} from "../src/lib/doms-heatmap.ts";

// Feature 7: Audio Coach
import {
  buildNextSetSpeech,
  buildRestCountdownSpeech,
  buildPrSpeech,
} from "../src/lib/audio-coach.ts";

// Feature 8: Fatigue Prediction
import { predictSetDecay } from "../src/lib/fatigue-prediction.ts";

// Feature 9: Watch Tile Payload
import {
  buildWatchComplication,
  buildWatchTile,
} from "../src/lib/watch-tile-payload.ts";

// Feature 10: Partner Duel
import {
  evaluateDuelScore,
  compareDuel,
  generateRackRotation,
} from "../src/lib/partner-duel.ts";

test("Feature 1: Velocity & Mean Concentric Speed Estimator", () => {
  // RPE from Velocity mapping
  assert.equal(estimateRpeFromVelocity(0.16), 10);
  assert.equal(estimateRpeFromVelocity(0.24), 9.5);
  assert.equal(estimateRpeFromVelocity(0.45), 8.0);
  assert.equal(estimateRpeFromVelocity(0.75), 6.5);

  // Set velocity analysis
  const repVelocities = [0.65, 0.60, 0.54, 0.48, 0.38]; // 5 reps with progressive fatigue
  const analysis = analyzeSetVelocity(repVelocities);
  assert.equal(analysis.reps.length, 5);
  assert.equal(analysis.reps[0].repNumber, 1);
  assert.equal(analysis.reps[0].meanVelocityMs, 0.65);
  // Velocity loss from rep 1 (0.65) to rep 5 (0.38): ~42%
  assert.ok(analysis.totalVelocityLossPercent >= 40);
  assert.equal(analysis.fatigueWarning, true);
  assert.ok(analysis.recommendation.includes("velocity loss"));

  // Accel integration
  const samples = [
    { timestampMs: 0, zAccel: 0 },
    { timestampMs: 200, zAccel: 2.5 },
    { timestampMs: 400, zAccel: 3.0 },
    { timestampMs: 600, zAccel: 1.0 },
  ];
  const velocity = integrateConcentricVelocity(samples);
  assert.ok(velocity > 0.5 && velocity < 2.0);
});

test("Feature 2: Automated Drop Sets & Rest-Pause Countdown", () => {
  // -20% drop from 225 lb should round to 180 lb on imperial plates
  const dropWeight = calculateDropLoad(225, 20, "imperial");
  assert.equal(dropWeight, 180);

  // Triple drop set cascade
  const cascade = generateDropSequence(225, 3, 20, "imperial");
  assert.equal(cascade.length, 3);
  assert.equal(cascade[0].recommendedWeight, 180);
  assert.ok(cascade[1].recommendedWeight < 180);
  assert.equal(cascade[0].restSeconds, 15);

  // Rest-Pause cluster plan (15 total reps, initial 8, 15s pause)
  const restPause = generateRestPausePlan(15, 8, 15);
  assert.equal(restPause.length, 3);
  assert.equal(restPause[0].targetReps, 8);
  assert.equal(restPause[0].intraSetRestSeconds, 15);
  assert.equal(restPause[2].isTerminal, true);
  assert.equal(restPause[2].intraSetRestSeconds, 0);
});

test("Feature 3: Volume Landmarks & Deload Autopilot", () => {
  // Chest volume landmark check
  assert.equal(VOLUME_LANDMARKS.chest.mev, 10);
  assert.equal(VOLUME_LANDMARKS.chest.mrv, 22);

  const lowChest = evaluateMuscleVolume("chest", 6);
  assert.equal(lowChest.zone, "below_mev");

  const optimalChest = evaluateMuscleVolume("chest", 16);
  assert.equal(optimalChest.zone, "optimal_mav");

  const overChest = evaluateMuscleVolume("chest", 24);
  assert.equal(overChest.zone, "overreaching");
  assert.ok(overChest.percentageOfMrv > 100);

  // Deload Trigger check: 2 overreached muscles triggers proactive deload
  const deloadVerdict = evaluateDeloadTrigger([
    evaluateMuscleVolume("chest", 24),
    evaluateMuscleVolume("quads", 22),
  ]);
  assert.equal(deloadVerdict.shouldDeload, true);
  assert.equal(deloadVerdict.suggestedVolumeCutPercent, 50);
  assert.ok(deloadVerdict.reason.includes("overreaching"));

  // Accumulated MAV (5 weeks) also triggers deload
  const mesocycleEndVerdict = evaluateDeloadTrigger(
    [evaluateMuscleVolume("chest", 16)],
    5
  );
  assert.equal(mesocycleEndVerdict.shouldDeload, true);
  assert.ok(mesocycleEndVerdict.reason.includes("End of mesocycle"));
});

test("Feature 4: Equipment QR & Barcode Scanner", () => {
  // Cable tension with 2:1 pulley
  assert.equal(calculateEffectiveCableTension(100, "2:1"), 50);
  assert.equal(calculateEffectiveCableTension(120, "3:1"), 40);
  assert.equal(calculateEffectiveCableTension(150, "1:1"), 150);

  // QR serialization round-trip
  const machine = {
    id: "machine-lat-01",
    name: "Hammer Strength Lat Pulldown",
    exerciseSlug: "lat-pulldown",
    brand: "Hammer Strength",
    pulleyRatio: "2:1" as const,
    seatSetting: 4,
    pinSetting: 140,
    notes: "Wide neutral grip",
  };

  const qrUri = encodeMachineQr(machine);
  assert.ok(qrUri.startsWith("ironlog://equip?"));

  const parsed = parseMachineQr(qrUri);
  assert.ok(parsed);
  assert.equal(parsed.id, machine.id);
  assert.equal(parsed.exerciseSlug, machine.exerciseSlug);
  assert.equal(parsed.pulleyRatio, "2:1");
  assert.equal(parsed.seatSetting, "4");

  // Raw barcode fallback
  const barcodeScan = parseMachineQr("GYM-TAG-992");
  assert.ok(barcodeScan);
  assert.equal(barcodeScan.barcode, "GYM-TAG-992");
});

test("Feature 6: DOMS Soreness Heatmap & Autoregulation", () => {
  // Baseline recovery 90%
  const fresh = calculateDomsAdjustedReadiness(90, 1);
  assert.equal(fresh, 90);

  const severeDoms = calculateDomsAdjustedReadiness(90, 5); // Level 5 imposes -60 penalty
  assert.equal(severeDoms, 30);

  const impact = evaluateDomsImpact("quads", 85, 5);
  assert.equal(impact.adjustedReadinessPercent, 25);
  assert.equal(impact.recommendedAction, "substitute");
  assert.ok(impact.recommendation.includes("Severe DOMS"));

  const mildImpact = evaluateDomsImpact("chest", 85, 3);
  assert.equal(mildImpact.recommendedAction, "extra_warmup");
});

test("Feature 7: Whisper Voice Cues & Audio Coach", () => {
  const speech = buildNextSetSpeech("Bench Press", 225, 5, "lb");
  assert.equal(speech, "Next up: Bench Press, 225 lb for 5 reps.");

  const countdown10 = buildRestCountdownSpeech(10);
  assert.equal(countdown10, "Ten seconds remaining. Chalk up and get ready.");

  const countdown3 = buildRestCountdownSpeech(3);
  assert.equal(countdown3, "Three, two, one. Time to lift.");

  const countdownOther = buildRestCountdownSpeech(45);
  assert.equal(countdownOther, null);

  const prText = buildPrSpeech("Deadlift", 405, "lb");
  assert.equal(prText, "New personal record on Deadlift! 405 lb conquered.");
});

test("Feature 8: Fatigue-Adjusted 1RM Prediction Curves", () => {
  const decay = predictSetDecay({
    initialWeight: 225,
    targetReps: 5,
    totalSets: 4,
    restSeconds: 120,
    initialRpe: 8.0,
    isCompound: true,
    unit: "imperial",
  });

  assert.equal(decay.length, 4);
  assert.equal(decay[0].setNumber, 1);
  assert.equal(decay[0].prescribedWeight, 225);
  assert.equal(decay[0].fatiguePercent, 0);

  // Later sets experience fatigue accumulation
  assert.ok(decay[3].fatiguePercent > 0);
  assert.ok(decay[3].recommendedWeightToMatchReps < 225);
  assert.ok(decay[3].expectedRpe > 8.0);
});

test("Feature 9: Wear OS Ambient Live Tile & Complication Engine", () => {
  // Complication during rest period
  const restComplication = buildWatchComplication(true, 45, 120, "Squat");
  assert.equal(restComplication.complicationType, "RANGED_VALUE");
  assert.equal(restComplication.shortText, "45s");
  assert.ok(restComplication.progressPercent > 0);
  assert.equal(restComplication.iconName, "timer");

  // Complication during lifting
  const activeComplication = buildWatchComplication(false, 0, 0, "Squat");
  assert.equal(activeComplication.complicationType, "SHORT_TEXT");
  assert.equal(activeComplication.shortText, "SQUAT");

  // Live Tile payload
  const tile = buildWatchTile({
    workoutName: "PHUL Upper Power",
    exerciseName: "Barbell Bench Press",
    exerciseSlug: "bench-press",
    currentSetIndex: 3,
    totalSets: 4,
    targetWeight: 225,
    targetReps: 5,
    unit: "lb",
    isRestActive: true,
    restRemaining: 30,
    totalRest: 120,
  });

  assert.equal(tile.setIndexText, "Set 3 of 4");
  assert.equal(tile.targetWeightText, "225 lb");
  assert.equal(tile.isRestActive, true);
  assert.equal(tile.restPercent, 75); // (120 - 30) / 120 = 75%
});

test("Feature 10: Synchronized Partner Duel & Alternating Rack Mode", () => {
  const partnerA = {
    userId: "user-a",
    displayName: "Alex",
    totalVolume: 15000,
    completedSets: 12,
    averageRpe: 8.5,
    personalRecordsBroken: 1,
    durationMinutes: 45,
  };

  const partnerB = {
    userId: "user-b",
    displayName: "Jordan",
    totalVolume: 12000,
    completedSets: 10,
    averageRpe: 8.0,
    personalRecordsBroken: 0,
    durationMinutes: 45,
  };

  const scoreA = evaluateDuelScore(partnerA);
  const scoreB = evaluateDuelScore(partnerB);
  assert.ok(scoreA.compositeScore > scoreB.compositeScore);

  const matchup = compareDuel(partnerA, partnerB);
  assert.equal(matchup.leaderUserId, "user-a");
  assert.equal(matchup.isTied, false);
  assert.ok(matchup.summary.includes("Alex"));

  // Alternating rack rotation
  const rotation = generateRackRotation("Barbell Squat", 3, 90);
  assert.equal(rotation.length, 6); // 3 sets * 2 partners = 6 alternating turns
  assert.equal(rotation[0].lifter, "Partner A");
  assert.equal(rotation[1].lifter, "Partner B");
  assert.equal(rotation[0].setNumber, 1);
  assert.equal(rotation[1].setNumber, 1);
  assert.equal(rotation[5].setNumber, 3);
});
