import { test } from "node:test";
import assert from "node:assert/strict";
import { countsForCalendar, distanceMeters, gymOf, isAtGym } from "../src/lib/gym-logic.ts";
import { buildEvent, defaultCalendar, eventIdFor, signState, verifyState } from "../supabase/functions/_shared/google.ts";

const gym = { lat: 40.7128, lng: -74.006, radius: 200, name: "Iron Temple" };

test("distance between two points is about right", () => {
  // 0.001 degrees of latitude is about 111 m.
  assert.ok(Math.abs(distanceMeters(gym, { lat: gym.lat + 0.001, lng: gym.lng }) - 111) < 1);
  assert.equal(distanceMeters(gym, gym), 0);
});

test("you're at the gym inside the circle, or when a fuzzy fix reaches it", () => {
  assert.equal(isAtGym({ lat: gym.lat + 0.001, lng: gym.lng }, gym), true);
  assert.equal(isAtGym({ lat: gym.lat + 0.003, lng: gym.lng }, gym), false, "333 m away");
  assert.equal(isAtGym({ lat: gym.lat + 0.003, lng: gym.lng, accuracy: 140 }, gym), true, "333 m with a 140 m error circle");
  assert.equal(isAtGym({ lat: gym.lat + 0.01, lng: gym.lng, accuracy: 5000 }, gym), false, "a very rough fix can't stretch the gym past 150 m");
});

test("no gym saved means no check-in", () => {
  assert.equal(gymOf(null), null);
  assert.equal(gymOf({ gym_lat: null, gym_lng: -74, gym_radius_m: 200, gym_name: null }), null);
  assert.deepEqual(gymOf({ gym_lat: 1, gym_lng: 2, gym_radius_m: 100, gym_name: "G" }), { lat: 1, lng: 2, radius: 100, name: "G" });
});

test("only gym workouts longer than 30 minutes go on the calendar", () => {
  const start = "2026-10-14T18:00:00Z";
  assert.equal(countsForCalendar(true, start, "2026-10-14T18:31:00Z"), true);
  assert.equal(countsForCalendar(true, start, "2026-10-14T18:30:00Z"), false, "exactly 30 isn't longer than 30");
  assert.equal(countsForCalendar(false, start, "2026-10-14T19:30:00Z"), false);
  assert.equal(countsForCalendar(null, start, "2026-10-14T19:30:00Z"), false);
});

test("sign-in state can't be forged, reused late, or pointed elsewhere", async () => {
  const user = "8f14e45f-ceea-467f-a0e6-1c2b3d4e5f60";
  const now = Date.parse("2026-10-14T12:00:00Z");
  const state = await signState(user, "app", "key", now);
  assert.deepEqual(await verifyState(state, "key", now + 60_000), { userId: user, returnTo: "app" });
  assert.equal(await verifyState(state, "other-key", now), null);
  assert.equal(await verifyState(state, "key", now + 16 * 60_000), null, "expired");
  assert.equal(await verifyState(state.replace(".app.", ".web."), "key", now), null);
  assert.equal(await verifyState(state.replace(user, "11111111-1111-4111-8111-111111111111"), "key", now), null);
  assert.equal(await verifyState("junk", "key", now), null);
});

test("calendar events use a stable id Google accepts", () => {
  const id = eventIdFor("8F14E45F-CEEA-467F-A0E6-1C2B3D4E5F60");
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.equal(id, eventIdFor("8f14e45f-ceea-467f-a0e6-1c2b3d4e5f60"));
});

test("the event reads well", () => {
  const e = buildEvent(
    { id: "8f14e45f-ceea-467f-a0e6-1c2b3d4e5f60", name: "Push Day", start_time: "2026-10-14T18:00:00Z", end_time: "2026-10-14T19:05:00Z", volume_kg: 4535.9, sets: 18, exercises: ["Bench Press", "Overhead Press"] },
    { gymName: "Iron Temple", unit: "imperial" },
  );
  assert.equal(e.summary, "Workout: Push Day");
  assert.equal(e.location, "Iron Temple");
  assert.equal(e.start.dateTime, "2026-10-14T18:00:00.000Z");
  assert.equal(e.end.dateTime, "2026-10-14T19:05:00.000Z");
  assert.match(e.description, /^65 min · 18 sets · 10,000 lb lifted/);
  assert.match(e.description, /• Bench Press\n• Overhead Press/);
  assert.equal("location" in buildEvent({ id: "a", name: null, start_time: "2026-10-14T18:00:00Z", end_time: "2026-10-14T19:00:00Z", volume_kg: 0, sets: 1, exercises: [] }, { gymName: null, unit: "metric" }), false);
});

test("a calendar named Workout is picked first", () => {
  const cals = [
    { id: "me@gmail.com", name: "me@gmail.com", primary: true },
    { id: "w", name: "Workout", primary: false },
    { id: "f", name: "Family", primary: false },
  ];
  assert.equal(defaultCalendar(cals)?.id, "w");
  assert.equal(defaultCalendar(cals.filter((c) => c.id !== "w"))?.id, "me@gmail.com");
  assert.equal(defaultCalendar([]), null);
});
