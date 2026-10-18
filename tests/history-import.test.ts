import { test } from "node:test";
import assert from "node:assert/strict";
import { exerciseNames, guessExerciseDetails, parseCsv, parseLogs, parseMinutes, parseMoment, readHistoryFile } from "../src/lib/history-import.ts";

const JEFIT = [
  "### PROFILE ###",
  "_id,height,weight",
  "1,70,180",
  "### EXERCISE LOGS ###",
  "_id,belongSys,mydate,eid,ename,logs,belongplan,edit_time",
  '1,1,2024-03-05,1,Barbell Bench Press,"135x10,155x8,175x6",3,1709673000',
  '2,1,2024-03-05,2,Dumbbell Row,"60x12,60x12",3,1709673000',
  '3,1,2024-03-07,3,Pull Up,"0x10,x8,25x6",3,1709850000',
  '4,1,2024-03-07,4,Plank,"0:45,1:00",3,1709850000',
  "5,1,2024-03-08,5,Empty,,3,1709850000",
  "### WORKOUT SESSIONS ###",
  "_id,mydate,starttime,endtime,total_time",
  "1,2024-03-05,1709667000,1709671200,4200",
].join("\r\n");

test("JEFIT backup: sets from the logs column, times from the sessions table", () => {
  const h = readHistoryFile(JEFIT);
  assert.equal(h.app, "jefit");
  assert.equal(h.unit, null, "JEFIT doesn't say lb or kg, so the lifter picks");
  assert.equal(h.sessions.length, 2);
  const [a, b] = h.sessions;
  assert.equal(a.date, "2024-03-05");
  assert.equal(a.minutes, 70);
  assert.ok(a.time, "start time comes from the session table");
  assert.deepEqual(a.exercises.map((x) => x.name), ["Barbell Bench Press", "Dumbbell Row"]);
  assert.deepEqual(a.exercises[0].sets.map((s) => [s.weight, s.reps]), [[135, 10], [155, 8], [175, 6]]);
  assert.deepEqual(b.exercises[0].sets.map((s) => [s.weight, s.reps]), [[null, 10], [null, 8], [25, 6]]);
  assert.deepEqual(b.exercises[1].sets.map((s) => s.seconds), [45, 60]);
  assert.equal(b.time, null);
  assert.equal(h.skippedRows, 1);
});

test("same file twice gives the same keys; a changed workout gets a new one", () => {
  const k1 = readHistoryFile(JEFIT).sessions.map((s) => s.key);
  const k2 = readHistoryFile(JEFIT).sessions.map((s) => s.key);
  assert.deepEqual(k1, k2);
  const k3 = readHistoryFile(JEFIT.replace("175x6", "175x5")).sessions.map((s) => s.key);
  assert.notEqual(k3[0], k1[0]);
  assert.equal(k3[1], k1[1]);
});

test("Strong export: one row per set, W for warm-ups, duration per workout", () => {
  const csv = [
    "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
    '2024-03-05 18:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),W,95,10,0,0,,,',
    "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Bench Press (Barbell),1,185,5,0,0,,,8",
    "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Bench Press (Barbell),2,185,5,0,0,,,",
    "2024-03-06 07:00:00,Legs,45m,Squat (Barbell),1,225,5,0,0,,,",
  ].join("\n");
  const h = readHistoryFile(csv);
  assert.equal(h.app, "strong");
  assert.equal(h.sessions.length, 2);
  const [push] = h.sessions;
  assert.equal(push.name, "Push, heavy");
  assert.equal(push.time, "18:30");
  assert.equal(push.minutes, 65);
  assert.deepEqual(push.exercises[0].sets.map((s) => s.set_type), ["warmup", "normal", "normal"]);
  assert.equal(push.exercises[0].sets[1].rpe, 8);
});

test("Hevy export: start/end times and weight_lbs", () => {
  const csv = [
    '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles","duration_seconds","rpe"',
    '"Upper","28 Jan 2025, 07:30","28 Jan 2025, 08:40","","Lat Pulldown (Cable)","","","0","normal","120","10","","",""',
    '"Upper","28 Jan 2025, 07:30","28 Jan 2025, 08:40","","Lat Pulldown (Cable)","","","1","dropset","100","8","","",""',
  ].join("\n");
  const h = readHistoryFile(csv);
  assert.equal(h.app, "hevy");
  assert.equal(h.unit, "lb");
  assert.equal(h.sessions[0].date, "2025-01-28");
  assert.equal(h.sessions[0].minutes, 70);
  assert.deepEqual(h.sessions[0].exercises[0].sets.map((s) => s.set_type), ["normal", "drop"]);
});

test("a plain spreadsheet with sets x reps per row, US dates and kg in the header", () => {
  const h = readHistoryFile("Date,Exercise,Sets,Reps,Weight (kg)\n3/5/2024,Deadlift,3,5,140\n13/5/2024,Deadlift,1,3,150\n");
  assert.equal(h.unit, "kg");
  assert.equal(h.sessions[0].date, "2024-03-05");
  assert.equal(h.sessions[0].exercises[0].sets.length, 3);
  assert.equal(h.sessions[1].date, "2024-05-13", "a day over 12 must be day-first");
});

test("files that aren't workout exports get a plain explanation", () => {
  assert.throws(() => readHistoryFile("name,email\nSadiq,x@y.z\n"), /Couldn't find the workouts/);
  assert.throws(() => readHistoryFile("PK\u0003\u0004binary"), /Save it as CSV/);
});

test("CSV basics: quotes, escaped quotes, newlines in cells, semicolons", () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\n1,"2\n3",4'), [["a", "b,c", 'd "e"'], ["1", "2\n3", "4"]]);
  assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("logs, times and durations", () => {
  assert.deepEqual(parseLogs("135 x 5 x 3").length, 3);
  assert.deepEqual(parseLogs("100kg x 5, 12").map((s) => [s.weight, s.reps]), [[100, 5], [null, 12]]);
  assert.equal(parseMoment("1709667000")?.date != null, true);
  assert.equal(parseMoment("2024-02-30"), null);
  assert.equal(parseMoment("Jan 28, 2025 7:30 PM")?.time, "19:30");
  assert.equal(parseMinutes("1:05:00"), 65);
  assert.equal(parseMinutes("4200", true), 70);
});

test("exercise names are counted and unknown ones get sensible details", () => {
  const names = exerciseNames(readHistoryFile(JEFIT));
  assert.equal(names[0].name, "Barbell Bench Press");
  assert.equal(names.find((n) => n.name === "Plank")?.timed, true);
  assert.deepEqual(guessExerciseDetails("Incline Dumbbell Curl"), { primary_muscle: "biceps", equipment: "dumbbell", mechanic: "isolation" });
  assert.equal(guessExerciseDetails("Hack Squat").equipment, "machine");
  assert.equal(guessExerciseDetails("Seated Calf Raise").primary_muscle, "calves");
});

test("backup spreadsheet is a valid zip with one sheet per tab", async () => {
  const { buildXlsx } = await import("../src/lib/xlsx.ts");
  const bytes = buildXlsx([
    { name: "Workouts", rows: [["Date", "Name"], ["2024-03-05", 'Push & "pull" <day>'], ["2024-03-06", 12.5]] },
    { name: "Sets/Reps", rows: [["A"]] },
  ]);
  const text = new TextDecoder().decode(bytes);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /xl\/worksheets\/sheet2\.xml/);
  assert.match(text, /Push &amp; &quot;pull&quot; &lt;day&gt;/);
  assert.match(text, /<v>12.5<\/v>/);
  assert.match(text, /name="Sets Reps"/, "slashes aren't allowed in sheet names");
});

test("a file workout becomes a saveable session in kg with your exercise ids", async () => {
  const { toSessionToSave } = await import("../src/lib/history-import.ts");
  const [s] = readHistoryFile(JEFIT).sessions;
  const ids = new Map([["barbell bench press", "bench-id"]]);
  const out = toSessionToSave(s, ids, "lb", "JEFIT workout")!;
  assert.equal(out.exercises.length, 1, "unmapped exercises are left out");
  assert.equal(out.exercises[0].exercise_id, "bench-id");
  assert.equal(Math.round(out.exercises[0].sets[0].weight_kg * 2.2046226218), 135);
  assert.equal(out.minutes, 70);
  assert.equal(out.name, "JEFIT workout");
  assert.equal(out.import_key, s.key);
});
