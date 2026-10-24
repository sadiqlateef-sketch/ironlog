import { test } from "node:test";
import assert from "node:assert/strict";
import { backupSheets, type BackupData } from "../src/lib/backup.ts";
import { buildXlsx } from "../src/lib/xlsx.ts";

const mockBackupData: BackupData = {
  profile: {
    id: "user-123",
    email: "lifter@example.com",
    display_name: "Strong Lifter",
    training_goal: "strength",
    training_days_per_week: 4,
    training_equipment: ["barbell", "bench", "squat rack"],
    bar_weight_kg: 20,
    available_plates_kg: [20, 10, 5, 2.5, 1.25],
    default_rest_seconds: 180,
    gym_name: "Metro Barbell Club",
    physical_stats: {
      height_cm: 180,
      bodyweight_kg: 85,
      birth_year: 1995,
    },
    // Sensitive fields that must NEVER leak into backup
    password_hash: "secret_hash_value",
    refresh_token: "secret_refresh_token",
  },
  sessions: [
    {
      id: "sess-2",
      name: "Upper Heavy",
      start_time: "2026-10-20T10:00:00Z",
      end_time: "2026-10-20T11:15:00Z",
      volume: 4500,
      avg_hr: 135,
      max_hr: 168,
      at_gym: true,
      source: "phone",
      notes: "hit all top sets",
    },
    {
      id: "sess-1",
      name: "Leg Day",
      start_time: "2026-10-18T09:00:00Z",
      end_time: "2026-10-18T10:20:00Z",
      volume: 6200,
      avg_hr: 142,
      max_hr: 175,
      at_gym: true,
      source: "phone",
      notes: "squats felt fast",
    },
  ],
  sets: [
    {
      session_id: "sess-1",
      exercise_order: 1,
      set_number: 1,
      set_type: "normal",
      weight: 140, // kg
      reps: 5,
      rpe: 8,
      estimated_1rm: 163.3,
      duration_seconds: 35,
      distance_m: null,
      is_completed: true,
      notes: "clean form",
      completed_at: "2026-10-18T09:15:00Z",
      exercises: { name: "Back Squat" },
    },
    {
      session_id: "sess-2",
      exercise_order: 1,
      set_number: 1,
      set_type: "normal",
      weight: 100, // kg
      reps: 5,
      rpe: 8.5,
      estimated_1rm: 116.7,
      duration_seconds: 30,
      distance_m: null,
      is_completed: true,
      notes: "paused",
      completed_at: "2026-10-20T10:15:00Z",
      exercises: { name: "Bench Press" },
    },
  ],
  exercises: [
    {
      name: "Deficit Deadlift",
      primary_muscle: "lower_back",
      secondary_muscles: ["glutes", "hamstrings"],
      equipment: "barbell",
      mechanic: "compound",
      tracking: "weight_reps",
      aliases: ["2-inch Deficit Deadlift"],
    },
  ],
  prefs: [
    {
      favorite: true,
      goal_weight_kg: 150,
      notes: "reach by end of year",
      exercises: { name: "Bench Press" },
    },
  ],
  routines: [
    {
      id: "routine-1",
      name: "Day 1 - Squat Focus",
      program_id: "prog-1",
      program_week: 1,
      program_day: 1,
    },
  ],
  routineExercises: [
    {
      routine_id: "routine-1",
      target_sets: 4,
      target_reps: 5,
      target_reps_max: null,
      target_weight_kg: 140,
      target_rpe: 8,
      target_percent_1rm: 85,
      warmup_sets: 3,
      rest_seconds: 180,
      notes: "heavy working sets",
      exercises: { name: "Back Squat" },
    },
  ],
  programs: [
    {
      id: "prog-1",
      name: "5/3/1 Strength Block",
      methodology: "531",
      weeks: 8,
      days_per_week: 4,
      is_active: true,
      started_at: "2026-10-15T00:00:00Z",
      summary: "Strength building block",
      progression_rule: "Add 5 lb upper, 10 lb lower per cycle",
    },
  ],
  body: [
    {
      measured_on: "2026-10-18",
      weight_kg: 85,
      body_fat_pct: 14.5,
      waist_cm: 82,
    },
  ],
  heartRate: [
    {
      session_id: "sess-1",
      recorded_at: "2026-10-18T09:15:00Z",
      bpm: 152,
      source: "watch",
    },
  ],
  adjustments: [
    {
      session_id: "sess-1",
      action: "increase",
      current_weight_kg: 140,
      suggested_weight_kg: 145,
      suggested_reps: null,
      reason: "Hit all target reps easily",
      status: "applied",
      created_at: "2026-10-18T10:25:00Z",
    },
  ],
};

test("backup: generates all 10 standard tabs with expected headers and structure", () => {
  const sheets = backupSheets(mockBackupData, "imperial", new Date("2026-10-24T05:00:00Z"));
  assert.equal(sheets.length, 10);

  const sheetNames = sheets.map((s) => s.name);
  assert.deepEqual(sheetNames, [
    "About",
    "Workouts",
    "Sets",
    "Your exercises",
    "Exercise notes",
    "Routines",
    "Programs",
    "Body",
    "Heart rate",
    "Suggestions",
  ]);

  // About tab
  const about = sheets[0];
  assert.equal(about.rows[0][0], "Ironlog backup");
  assert.equal(about.rows[2][1], "lifter@example.com");
  assert.equal(about.rows[3][1], "Strong Lifter");
  assert.equal(about.rows[4][1], "lb");

  // Workouts tab
  const workouts = sheets[1];
  assert.deepEqual(workouts.rows[0], [
    "Start",
    "End",
    "Minutes",
    "Name",
    "Source",
    "Volume (lb)",
    "Avg HR",
    "Max HR",
    "At gym",
    "Notes",
    "ID",
  ]);
  assert.equal(workouts.rows.length, 3); // header + 2 sessions

  // Sets tab
  const sets = sheets[2];
  assert.deepEqual(sets.rows[0], [
    "Date",
    "Workout",
    "Exercise",
    "Order",
    "Set",
    "Type",
    "Weight (lb)",
    "Reps",
    "RPE",
    "Est. 1RM (lb)",
    "Seconds",
    "Distance (mi)",
    "Done",
    "Notes",
    "Workout ID",
  ]);
  assert.equal(sets.rows.length, 3); // header + 2 sets
});

test("backup: converts weights and dimensions accurately in imperial vs metric", () => {
  const imperial = backupSheets(mockBackupData, "imperial");
  const metric = backupSheets(mockBackupData, "metric");

  // About tab: Height & Bodyweight
  const aboutImp = Object.fromEntries(imperial[0].rows as [string, unknown][]);
  const aboutMet = Object.fromEntries(metric[0].rows as [string, unknown][]);

  // 180 cm -> 70.9 in
  assert.equal(aboutImp["Height"], "70.9 in");
  assert.equal(aboutMet["Height"], "180 cm");

  // 85 kg -> 187.39 lb
  assert.equal(aboutImp["Bodyweight"], "187.39 lb");
  assert.equal(aboutMet["Bodyweight"], "85 kg");

  // Workouts tab: Volume
  const sessImp = imperial[1].rows[1];
  const sessMet = metric[1].rows[1];
  // 4500 kg volume -> 9920.8 lb
  assert.equal(sessImp[5], 9920.8);
  assert.equal(sessMet[5], 4500);

  // Sets tab: Weight
  const setImp = imperial[2].rows[1];
  const setMet = metric[2].rows[1];
  // 140 kg -> 308.65 lb
  assert.equal(setImp[6], 308.65);
  assert.equal(setMet[6], 140);
});

test("backup security: never leaks password hashes or refresh tokens", () => {
  const sheets = backupSheets(mockBackupData, "imperial");
  const allJson = JSON.stringify(sheets);

  assert.equal(allJson.includes("secret_hash_value"), false, "Password hash must never leak");
  assert.equal(allJson.includes("secret_refresh_token"), false, "Refresh token must never leak");
});

test("backup: buildXlsx produces valid ZIP container with OpenXML structure", () => {
  const sheets = backupSheets(mockBackupData, "imperial");
  const bytes = buildXlsx(sheets);

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500, "XLSX file must have substantial content");

  // Verify ZIP local file header signature: 0x50, 0x4B, 0x03, 0x04 ("PK\x03\x04")
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);

  // Verify internal text contains OpenXML workbook entries
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes("[Content_Types].xml"));
  assert.ok(text.includes("xl/workbook.xml"));
  assert.ok(text.includes("xl/worksheets/sheet1.xml"));
});
