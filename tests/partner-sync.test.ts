import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRoomCode, PartnerSyncManager, type PartnerEvent } from "../src/services/partnerSync.ts";

test("generateRoomCode formats a 9-char code with IRON- prefix", () => {
  const code = generateRoomCode();
  assert.ok(code.startsWith("IRON-"));
  assert.equal(code.length, 9);
  // Ensure valid characters
  const suffix = code.slice(5);
  assert.match(suffix, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
});

test("PartnerSyncManager manages rooms, state updates and event dispatching", () => {
  const manager = new PartnerSyncManager();
  assert.equal(manager.isConnected, false);

  manager.joinRoom("IRON-TEST", "Alex");
  assert.equal(manager.isConnected, true);
  assert.equal(manager.roomCode, "IRON-TEST");

  let receivedEvent: PartnerEvent | null = null;
  const unsubscribe = manager.subscribe((event) => {
    receivedEvent = event;
  });

  // Simulate an incoming set_completed event from partner
  manager.handleIncomingEvent({
    id: "evt-1",
    type: "set_completed",
    senderName: "Jordan",
    timestamp: new Date().toISOString(),
    payload: {
      type: "set_completed",
      set: {
        exerciseName: "Barbell Squat",
        setNumber: 3,
        weight: 315,
        reps: 5,
        unit: "imperial",
        isPr: true,
      },
    },
  });

  assert.ok(receivedEvent);
  assert.equal(manager.state.partnerName, "Jordan");
  assert.equal(manager.state.lastExercise, "Barbell Squat");
  assert.equal(manager.state.lastSet?.weight, 315);
  assert.equal(manager.state.lastSet?.reps, 5);

  // Simulate rest timer update
  manager.handleIncomingEvent({
    id: "evt-2",
    type: "rest_timer",
    senderName: "Jordan",
    timestamp: new Date().toISOString(),
    payload: {
      type: "rest_timer",
      rest: {
        secondsTotal: 90,
        secondsRemaining: 45,
        isRunning: true,
      },
    },
  });
  assert.equal(manager.state.activeRest?.secondsRemaining, 45);

  // Simulate reaction
  manager.handleIncomingEvent({
    id: "evt-3",
    type: "reaction",
    senderName: "Jordan",
    timestamp: new Date().toISOString(),
    payload: {
      type: "reaction",
      reaction: {
        emoji: "🔥",
        senderName: "Jordan",
      },
    },
  });
  assert.equal(manager.state.lastReaction?.emoji, "🔥");

  unsubscribe();
  manager.leaveRoom();
  assert.equal(manager.isConnected, false);
  assert.equal(manager.roomCode, null);
});
