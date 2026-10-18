# Ironlog: strength training tracker

Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui, with a Supabase (PostgreSQL)
backend protected by Row Level Security.

| Phase | What | Status |
| ----- | ---- | ------ |
| 1 | Project setup & database schema | Done |
| 2 | Sign-in, exercise library, workout logger, rest timer, plate calculator | Done |
| 3 | Volume & 1RM charts, 1RM calculator, muscle recovery heatmap | Done |
| 4 | AI workout generation (Claude API) | Done |
| 5 | Android app (Capacitor) | Done |
| 6 | Wear OS watch app | Done |

## Wear OS watch app (Phase 6)

A standalone watch app in `watch/` (React Native). It talks to the same
Supabase database as the phone, so a workout started on either shows up on both.

- **Link once, no typing on the watch.** The watch shows a 6-digit code. On
  your phone, go to Home > **Link watch** and enter it. That button is hidden
  until you turn it on: add a repository variable `FEATURE_WATCH` = `1`
  (Settings > Secrets and variables > Actions > Variables) and rebuild the APK. Codes last 10 minutes
  and work once, and 10 wrong tries locks code entry for a while.
- **Log from the wrist.** Start a routine or continue the phone's workout.
  Each set shows big **−/+** buttons for weight (5 lb or 2.5 kg a tap; hold for 0.5 lb or 0.25 kg) and reps,
  pre-filled from the plan or your last set, then **✓ Done**. Tap the
  exercise name to jump to the next exercise. **+ Add set** adds a bonus set.
- **Rest timer** with the same rules as the phone, −15 / +15 / Skip, and a
  buzz when rest is over.
- **Heart rate** from the watch sensor (Wear OS Health Services), shown in
  zone colors and saved every 15 seconds. The workout's average and max heart
  rate show on the phone's home screen.
- **Works without signal.** Every change is saved on the watch first and
  sent when the connection returns, without duplicates.

The screen stays on during a workout so heart rate keeps recording.
Recording with the screen off would need a Wear OS "exercise session", which
is a possible later upgrade.

Build and install: see [watch/README.md](watch/README.md).

## Putting it online (no command line)

The repo includes three buttons under GitHub's **Actions** tab:

| Workflow | What it does | Secrets it needs |
| -------- | ------------ | ---------------- |
| Deploy database and functions | Creates the tables and deploys the server functions (AI programs, watch linking) in your Supabase project | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, optional `ANTHROPIC_API_KEY` |
| Android APK | Builds the phone app | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Watch APK | Builds the watch app | the same two as Android APK |

Add secrets under the repo's Settings > Secrets and variables > Actions.
Run "Deploy database and functions" first. On the first run, tick "load the
starter exercises". If you already pasted the first three migration files
into the SQL Editor by hand, also tick "I already ran the first 3 migration files".

## Android app (Phase 5)

The Android app is the same web app running inside a native shell
(Capacitor), plus a few phone-only extras:

- **Rest alerts while the phone is locked.** When you leave the app mid-rest,
  the phone shows a "Rest over" notification at the exact moment the timer
  ends. On Android 14+ the workout screen offers an **Allow** button for exact
  alarms; without it Android may deliver the alert a little late.
- **Haptics.** A light tap when you tick off a set, and a strong buzz when rest is over.
- **Screen stays on** while a workout is open, and can sleep again when you finish.
- App icon, dark splash screen and a barbell notification icon.

### 1. Point the app at hosted Supabase

A phone can't reach `127.0.0.1` on your computer, so the app needs your
hosted Supabase project (see Setup, Option B). Create `.env.production.local`
next to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your publishable key>
```

`npm run dev` keeps using `.env.local`. Builds (`npm run build` and the
Android commands) use `.env.production.local`.

Sign-up confirmation emails open in the phone's browser. Confirm there,
then sign in from the app. Or turn off "Confirm email" while testing.

### 2a. Build on your computer (Android Studio)

Install [Android Studio](https://developer.android.com/studio). It includes
the Android SDK and Java. Then:

```bash
npm run android:sync    # build the web app and copy it into android/
npm run android:open    # opens the project in Android Studio
```

In Android Studio, plug in your phone (with USB debugging on) or start an
emulator, and press Run ▶.

To build just the APK file instead, run `npm run android:apk`. The file
lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to
your phone and open it. Android will ask you to allow installing apps from
that source.

Run `npm run android:sync` again after every change to the web app.

### 2b. Or build in the cloud (GitHub Actions)

You can skip installing Android Studio. Push the project to a GitHub repo,
add the secrets `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Settings > Secrets and variables >
Actions), then go to Actions > Android APK > Run workflow. The APK is attached
to the finished run under Artifacts. See `.github/workflows/android.yml`.

### Release build (for sharing or the Play Store)

Debug APKs are fine for your own phone. To share the app or publish it,
sign it with your own key. Make the key once and keep it safe: you need the
same key for every future update.

```bash
keytool -genkey -v -keystore ironlog-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias ironlog
export IRONLOG_KEYSTORE=$PWD/ironlog-release.jks IRONLOG_KEY_ALIAS=ironlog
export IRONLOG_KEYSTORE_PASSWORD=... IRONLOG_KEY_PASSWORD=...
npm run android:sync && cd android && ./gradlew assembleRelease bundleRelease
```

The Play Store takes the `.aab` file from `android/app/build/outputs/bundle/release/`.
In the GitHub workflow, set `ANDROID_KEYSTORE_BASE64` (output of
`base64 -w0 ironlog-release.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` to get signed builds too.
Bump `versionCode` and `versionName` in `android/app/build.gradle` for each release.

### Changing the icon

Replace the PNGs in `assets/` (1024×1024 icons, 2732×2732 splash), then
run `npm run android:assets`.

## AI programs (Phase 4)

Home > **Programs** (or Workout > Programs & routines) opens the Programs screen.

- **Build a program.** Pick a goal, a style (5/3/1, Sheiko, RP hypertrophy,
  linear, or let Claude choose), how many weeks (4, 6, 8 or 12), days per week,
  session length, experience, your equipment, and any notes ("bad left
  shoulder"). Claude designs the program from the app's exercise library and
  maps out every workout: each day keeps the same exercises every week, while
  the weight, sets and reps move week to week (with deload weeks where the
  style uses them). For main lifts it uses a
  **percent of your estimated max**, which the app turns into a real weight
  rounded to plates you can load (5 lb or 2.5 kg). If you have no history for
  a lift, it uses an effort target (RPE) instead.
- **Start program.** It becomes your one active program and starts at Week 1,
  Day 1. Home, the Workout tab and the watch then show **Up next** (for example
  "Week 2 of 8 · Day 3"), which moves on each time you finish that workout.
  Starting another program replaces it; **Restart** goes back to Week 1;
  **Stop program** puts Home back to a plain Start workout.
- **Edit a workout.** The pencil on any day lets you swap, remove or add
  exercises and change sets, reps and weight, for just that workout or for that
  day in every later week. Later weeks keep their own progression: a weight
  change moves each week by the same amount.
- **Start a day.** Each day also has its own Start button. The logger fills in
  the sets, warm-ups and target weight.
- **Next time.** When you finish a workout from a plan, the app compares
  what you did with the targets and suggests the next session's numbers:
  add weight, repeat, deload, or change the rep target. **Apply** updates the
  plan (in a program, that day in every later week too); **Dismiss** leaves it alone. Suggestions you haven't answered also show
  on the Plans screen.

### Safety rails

Claude suggests and the app checks. Claude never writes directly to your plan.

- Every suggestion is clamped to between 20% lighter and 10% heavier
  than the current weight, and rounded to loadable plates. A "deload" must go
  down and an "add weight" must go up.
- Sets, reps, rest and percentages in a generated plan are clamped to sane
  ranges. An exercise that isn't in the library is dropped.
- If Claude is unavailable (no API key, outage, or a refusal), the
  suggestions come from built-in double-progression rules instead:
  - Hit every set: +2.5% (upper body) or +5% (lower body).
  - Small miss: repeat the weight.
  - Big miss (3+ reps short, or under half the sets): deload about 10%.
- Daily limits per user: 5 programs and 20 workout checks per 24 hours.
  Every call is logged in the `ai_usage` table with token counts.

### Turning on Claude

The API key lives only in Supabase Edge Functions, never in the app or the
phone. Get a key at https://console.anthropic.com.

Local:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > supabase/functions/.env   # git-ignored
npx supabase functions serve --env-file supabase/functions/.env
```

Hosted:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy generate-plan suggest-adjustments import-workout
```

The app uses `claude-opus-5-5` with adaptive thinking, and the system
prompts are cached. A program is one request (a few thousand input tokens plus
the plan and Claude's thinking); a post-workout check is a smaller one. Real
token counts land in `ai_usage`, so you can compare them with current pricing
at https://www.anthropic.com/pricing.

## Log a past workout

Workout > **Log past workout** (or the same button on Home) opens one Log
screen with three tabs: **Voice** and **Type** (a chat with Claude, below) and
**Photo** (screenshots or notebook photos). The old `/import/` address now
opens the Photo tab.

### Photo

The Photo tab adds a workout you already did somewhere else.

1. **Add it.** Take a photo of your notebook, pick screenshots from another app
   (Strong, Hevy, JEFIT, a spreadsheet...), or type/paste it ("Squat 3x5 225").
   Very tall screenshots are cut into readable pieces before sending.
2. **Claude reads it** (the `import-workout` Edge Function). It expands
   shorthand like `3x5 @ 225` into separate sets, keeps warm-up/drop/failure
   marks, and matches each exercise to your library ("DB Row" is Dumbbell
   Row). Nothing is saved yet.
3. **Check it.** Every exercise, set, weight and rep can be fixed. Anything
   that isn't in your library is outlined in yellow: **Choose exercise** to
   pick the right one, or **New exercise** to add it (the name is filled in).
   Set the date, start time and length. Weights are shown in your unit.
4. **Save.** It's stored as a finished workout on that date, with every set
   ticked, so charts, records, recovery and "last time" all include it.

The server converts units to kg, drops impossible numbers and dates in the
future, and limits imports to 20 per person per day (logged in `ai_usage`).

### Voice and Type (log by chatting)

The Voice and Type tabs share one chat (Voice puts the mic first). Type or
tap the mic and say what you did: "squat three sets of five at two twenty five,
bench one eighty five for eight, eight and seven". Claude answers with what it
understood. Send another message to add or fix something ("forgot curls 3x12
at 30", "actually bench was 185") and it answers with the updated workout.
**Check and save** opens the same review screen as an import.

It uses the same `import-workout` Edge Function: the app sends the whole chat
each time, numbered, so later messages can change earlier ones. Each message
counts toward the 20 imports a day. The mic uses the phone's own speech
recognizer in the Android app (it asks for microphone permission the first
time) and the browser's speech recognition on the web, where the browser has
one; otherwise the mic button is hidden and your keyboard's mic still works.

### Say a set mid-workout

In the logger, tap the mic next to **Log Set** and say the set: "bench 185 for
8", "8 reps at 60 kilos", "one eighty five for eight", "same for 6",
"bodyweight for 12". It ticks off the next set of the exercise you named (or
the one you're on), starts the rest timer, and shows **Undo** for a few
seconds. The words are read on the phone (`src/lib/voice-set.ts`), not by
Claude, so it needs no signal and doesn't count toward any limit. The speech
itself goes through the phone's recognizer, which works offline when the
phone has its offline speech language installed (most Android phones do for
English; check Settings > Google > Voice > Offline speech recognition).

## Log workouts from a Claude chat

Tell Claude about a workout in any chat (claude.ai, the Claude phone app,
Claude Code) and it saves it to Ironlog: "Just did bench 3x5 at 225, then
rows 3x10 at 135".

**Set up (once):**

1. In Ironlog: Progress > gear > **Connect to Claude** > **Make my link** >
   **Copy link**. The link is shown once and works like a password.
2. On claude.ai: [Settings > Connectors](https://claude.ai/settings/connectors)
   > **Add custom connector**. Name it `Ironlog`, paste the link as the URL,
   and click **Add**. It shows up in the Claude phone app too.
3. In a chat, turn Ironlog on in the tools menu and tell Claude your workout.

**How it works:** the `claude-connector` Edge Function is a small MCP server
(the protocol Claude connectors use) with four tools: `find_exercises`,
`log_workout`, `recent_workouts`, and `delete_workout` (only for workouts it
logged, to fix mistakes). Claude does the reading in your chat, so it costs
nothing on your Anthropic API key. Workouts go through the same cleaning as
imports (unit conversion, impossible numbers, no future dates) and are saved
as finished workouts tagged `source = 'claude'`. An exercise that isn't in
your library is refused with the closest matches, so Claude can pick one or
ask you before adding it as your own exercise.

**Why a secret link and not a Supabase sign-in:** the app is a static site
inside the APK, so there's no web page to host an OAuth sign-in for Claude.
Instead the link carries a long random secret (244 random bits). Only its
SHA-256 hash is stored (`claude_links`, migration
`20261014073000_claude_connector.sql`); making a new link or **Disconnect
Claude** cuts the old one off at once. Clients that can send headers can
also use `POST /functions/v1/claude-connector` with
`Authorization: Bearer <secret>`.

Deploy it with the **Deploy database and functions** workflow (it's in the
function list there), or by hand:
`npx supabase functions deploy claude-connector`.

## Gym check-in and Google Calendar

Progress > gear > **Gym & calendar**.

- **Your gym.** Stand in your gym and tap **I'm at my gym: save this spot**.
  It counts as the gym within 330, 660 (default) or 1310 ft of that spot;
  **Am I there?** shows how far away you are.
- **Check-in.** When a workout opens on the phone (started there or on the
  watch), the app checks your location once and marks the workout
  `at_gym`. If it can't get a fix then, it tries again when you tap Finish.
  There's no background tracking.
- **Calendar.** A gym workout longer than 30 minutes is added to the Google
  Calendar you pick ("Workout: Push Day", with minutes, sets, volume and
  exercises, at your gym's name). The `gym-calendar` Edge Function does it
  right after Finish, and again each time the app opens for anything missed
  in the last 14 days. The event id comes from the workout id, so a workout
  can never be added twice.

The Google sign-in's refresh token is kept in `calendar_connections`, which
only the Edge Function can read (RLS on, no policies).

### Turning on Google Calendar (one time, no command line)

1. Go to https://console.cloud.google.com/projectcreate, name the project
   **Ironlog**, and click **Create**. Make sure it's selected at the top.
2. Open https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   and click **Enable**.
3. Open https://console.cloud.google.com/auth/overview and click **Get started**.
   App name **Ironlog**, your email for support, Audience **External**, your
   email again for contact, tick the agreement, **Create**.
4. Click **Audience** on the left, then **Publish app** > **Confirm**. (In
   "Testing" mode Google signs you out of the calendar every 7 days.)
5. Click **Clients** on the left > **Create client**. Type **Web application**,
   name **Ironlog**. Under **Authorized redirect URIs** click **Add URI** and
   paste `https://<your project ref>.supabase.co/functions/v1/gym-calendar`.
   Click **Create** and keep the window open.
6. In GitHub, go to the repo's Settings > Secrets and variables > Actions and
   add two secrets: `GOOGLE_CLIENT_ID` (the Client ID) and
   `GOOGLE_CLIENT_SECRET` (the Client secret).
7. Run **Actions > Deploy database and functions**, then rebuild the APK.
8. In the app: Gym & calendar > **Connect Google Calendar**. Google will say it
   hasn't verified the app (it's your own app): tap **Advanced** > **Go to
   Ironlog**, tick the calendar boxes, and continue. You land back in Ironlog;
   pick the calendar (one named "Workout" is chosen for you if you have it).

## Progress screen (Phase 3)

- **Muscle recovery heatmap.** Front and back body views, coloured from dark
  (recovered) to bright red (fatigued). Tap a muscle for its % and roughly how
  many hours until it's ready. The model is deliberately simple and lives in
  `src/lib/recovery.ts`: each hard set adds fatigue to the main muscle (helpers
  get half, failure sets count 1.25×), and it fades with a 24 h half-life for
  big muscles and 16 h for small ones. It's a rule of thumb, not a medical measure.
- **Volume per workout.** Bar chart plus workouts / total / average for the range.
- **Estimated 1RM.** Pick a lift, see your best estimated max from each workout
  over time (Epley formula), with best-in-range and change.
- **1RM calculator.** Type any set to get your estimated max and a 60-100% table
  rounded to loadable weights.
- One range filter (4 weeks / 12 weeks / 1 year) scopes the charts. Every chart
  has a "Show as table" view, and values appear on hover, tap or keyboard focus.

## Using the logger

- **Start workout**, then **Add exercise**. Sets are pre-built to match what you
  did last time (warm-ups included), or 3 sets for a new exercise.
- The **Last time** column shows each set's previous weight × reps. Those numbers
  also appear in grey inside the inputs: tap ✓ on an empty set to log exactly what
  you did last time, or type new numbers to beat it.
- Tapping ✓ starts the rest timer on its own (2:00 for compound lifts, 1:30 for
  isolation, 1:00 after warm-ups). It beeps and vibrates when time is up, keeps
  running if you leave the page, and has ±15 s and skip buttons.
- Tap the set number to cycle the set type: **1** normal → **W** warm-up →
  **D** drop → **F** failure. Warm-ups don't count toward volume.
- 🔗 links an exercise with the next one as a **superset**. In a superset the
  timer only starts after the last exercise of the round.
- 🧮 (barbell lifts) opens the **plate calculator** with the set's weight filled in.
- ⋮ shows delete buttons for sets and the exercise.
- **Changing the order mid-workout:** after you add an exercise, tap **Do next**
  on the pop-up to move it straight after the one you're on (or ahead of it, if
  you haven't started it yet). Exercises you haven't started also show a
  **Do next** button. ⋯ has **Move up**, **Move down**, **Add exercise after
  this** and **Reorder exercises** (a drag list, also behind the ↑↓ button next
  to One / All). In the All view, **Add here** between exercises drops a new
  one in that spot. Supersets move together, and a planned workout's targets
  and "next time" suggestions follow an exercise wherever you move it.
- **Finish** drops unchecked sets and saves the workout. Unit (lb / kg) is on
  the home screen.
- **Swipe a set** right to finish it (or undo it), left to delete it (with an
  Undo button for 5 seconds). **Hold a set** to duplicate it, mark it as a
  warm-up, or add a drop set straight after it (about 20% lighter).
- Tapping a weight or reps box opens Ironlog's **number pad**: big keys, − / +
  buttons (weight steps switch between 5 and 2.5 lb, or 2.5 and 1.25 kg), and a
  **Reps** / **Log set** key to move on. Weights show to the nearest 0.5 lb.
- In the All view, finished exercises **collapse to one line**; tap to open.
- The sliders button at the top opens **Logger display**: **Focus mode** (just the
  set you're on and a big rest timer), **One-handed mode** (weight and reps with
  − / + next to Log Set), the number pad, sounds and vibration. Saved per phone.
- While resting, the countdown also shows on the **lock screen and notification
  shade** (Android app, when notifications are allowed), and ticks in the last
  3 seconds.

## What's in here

```
next.config.ts            Static export (Capacitor wraps the `out/` folder)
capacitor.config.ts       Android app settings (app id, splash, notifications)
android/                  The native Android project (open in Android Studio)
assets/                   Source images for the app icon and splash screen
.github/workflows/        Cloud builds (phone APK, watch APK) and Supabase deploy
watch/                    Wear OS watch app (React Native), see watch/README.md
src/app/link-watch/       Phone screen for entering the watch's code
src/lib/native.ts         Phone-only extras (haptics, rest alerts, screen-on)
components.json           shadcn/ui config, so `npx shadcn add <name>` works
src/app/                  Pages: / (home), /login, /workout, /exercises, /progress, /plans
src/components/ui/        shadcn components (button, card, input, dialog)
src/components/workout/   The logger: exercise cards and set rows
src/components/providers/ Sign-in state and the rest timer (shared app-wide)
src/hooks/use-workout.ts  All logger actions (add set, complete set, superset...)
src/lib/workout-api.ts    Every database call the app makes
src/lib/plates.ts         Plate calculator math
src/lib/workout-logic.ts  Small pure helpers (set types, rest rules)
src/lib/recovery.ts       Muscle recovery model for the heatmap
src/lib/one-rm.ts         1RM formulas and percentage table
src/components/charts/    Lightweight SVG bar and line charts
src/components/body-heatmap.tsx  Front/back body recovery map
tests/                    Unit tests (`npm test`)
src/lib/supabase/client.ts  The one Supabase client the app uses
src/lib/units.ts          kg <-> lb helpers (database stores kg)
src/types/database.ts     TypeScript types matching the schema
supabase/migrations/      The schema: tables, enums, triggers, RLS policies
supabase/seed.sql         30 starter exercises (squat, bench, deadlift, ...)
supabase/functions/       Edge Functions that call Claude (Phase 4)
  generate-plan/          Builds a program and saves every week's workouts
  watch-pair/             Links a watch to an account with a one-time code
  suggest-adjustments/    Post-workout "next time" suggestions
  _shared/                Prompts, output schemas, clamps, progression rules
src/app/plans/            Programs screen (generator, program cards)
src/components/up-next.tsx          The active program's next workout
src/components/workout-editor.tsx   Edit a workout (this one or later weeks too)
src/components/adjustment-list.tsx  Apply / Dismiss suggestion cards
```

## Prerequisites

- Node.js 20.9 or newer (`node -v`)
- Option A, local database: Docker Desktop running
- Option B, cloud database: a free project at https://supabase.com

## Setup

```bash
cd fitness-app
npm install
cp .env.example .env.local
```

### Option A: local Supabase (recommended while building)

```bash
npm run db:start      # first run downloads Docker images, takes a few minutes
```

Copy the `API URL` and `Publishable key` (or `anon key`) it prints into
`.env.local`. The migration and seed run automatically on first start. To wipe
and rebuild the database at any time:

```bash
npm run db:reset
```

Supabase Studio (a visual table browser) is at http://127.0.0.1:54323.

### Option B: hosted Supabase

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push                      # applies the migration
npx supabase db push --include-seed  # also loads the starter exercises
```

Put the project URL and publishable key from Dashboard > Project Settings > API
into `.env.local`.

### Run the app

```bash
npm run dev           # http://localhost:3000
```

Create an account on the sign-in screen. With local Supabase you're signed in
right away. On hosted Supabase, email confirmation is on by default: either
click the link in the email, or turn off "Confirm email" under
Authentication > Providers > Email while you're developing.

## Useful commands

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Start the dev server                                |
| `npm run build`     | Build the static site into `out/`                   |
| `npm run typecheck` | Check TypeScript                                    |
| `npm test`          | Run unit tests (plate math, set logic)              |
| `npm run lint`      | Lint                                                |
| `npm run db:reset`  | Rebuild the local database from migrations + seed   |
| `npx supabase migration up` | Apply new migrations without wiping data    |
| `npm run android:sync` | Build the web app and copy it into the Android project |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:apk`  | Build a debug APK (needs the Android SDK) |
| `npm run db:types`  | Regenerate `src/types/database.ts` from the database |
| `npx supabase functions serve --env-file supabase/functions/.env` | Run the AI functions locally |
| `npx supabase functions deploy generate-plan suggest-adjustments` | Deploy the AI functions |

## Database design notes

- **All weights are stored in kg.** The UI converts to lb for imperial users.
- `workout_sessions.volume` updates itself whenever a set is added, edited or
  deleted (warm-ups don't count).
- `workout_sets.estimated_1rm` is calculated by the database (Epley formula).
- `get_last_performance(exercise_id)` returns your sets from the last time you
  did that exercise, for the inline "last time" display.
- Supersets: sets or routine exercises that share a `superset_group` number.
  Drop sets: `set_type = 'drop'`, linked to the top set with `parent_set_id`.
- `client_id` on sets lets the phone and watch save offline and retry syncing
  without creating duplicates.
- Phase 3 adds read-only functions (`get_e1rm_history`, `get_logged_exercises`,
  `get_muscle_sets`) in `supabase/migrations/20261013010000_analytics.sql`.
- Phase 4 (`20261013020000_ai_programs.sql`) adds `routine_exercises.target_percent_1rm`,
  `routine_adjustments` (suggestions, with `apply_routine_adjustment(id)`) and
  `ai_usage` (one row per Claude call; users can read only their own rows).
- `20261014000000_programs.sql` adds `programs` (weeks, days per week, one
  `is_active` per user, `started_at`). Each program workout is a routine with
  `program_id`, `program_week` and `program_day`. `program_progress()` returns
  the next workout: the first one, by week then day, without a finished
  session since the program started. `start_program(id)` / `stop_program(id)`
  switch the active one. Programs made before this were turned into 1-week
  programs.
- Phase 6 (`20261013030000_watch_pairing.sql`) adds `watch_pairings` and
  `watch_pair_attempts`, which only the watch-pair function can read. It also
  adds a trigger that keeps `workout_sessions.avg_hr` / `max_hr` up to date as
  `heart_rate_samples` arrive from the watch.
- Only one unfinished workout per user is allowed at a time.

## Timed and cardio sets

Each exercise records one of three things (`exercises.tracking`): weight × reps
(most lifts), **time** (planks, wall sits, dead hangs, jump rope; optional added
weight), or **distance + time** (treadmill, outdoor run, walk, rower, bike,
elliptical), with your pace worked out from the two. Times can be typed as
seconds (`90`) or minutes:seconds (`1:30`); distance is in miles or km to
match your unit. Stored in `workout_sets.duration_seconds` and `distance_m`.
Cardio doesn't count toward the muscle recovery map.

## First run

A new account starts with five quick questions (name, lb or kg, goal,
equipment, days a week), saved to your profile (`users.training_*`,
`onboarded_at`). **Build my program** opens the program builder with those
answers filled in, and once Claude has built it, **Start Day 1** makes it your
active program and opens the first workout. Accounts that already had
workouts or programs skip the questions.

After that (and once on each phone, including after updating), a four-screen
tour shows where things are. Replay it from **More > Take the tour**.

## Getting around

Four tabs at the bottom: **Home** (the Today card: resume, the program's next
day or a start button, plus how recovered you are), **Workout**, **Progress**
and **More** (programs, exercise library, plate calculator, logging and photo
import, watch pairing, settings). New screens for More go in
`src/lib/nav.ts`.

- **Workout bar.** Mid-workout, every other screen shows a bar above the tabs
  with the workout's time and the rest countdown. Tap it to go back.
- **Search** (Home's magnifier, or the box on More) finds exercises by name,
  nickname, muscle or equipment, your workouts from the last year, programs
  and their days, and the app's own screens.
- **Appearance** (Settings) has dark (default), light or match-the-phone, and
  four text sizes. Saved on the phone (`src/lib/appearance.ts`) and applied
  before the first paint, so nothing flashes.
- **Android back button and back swipe** close an open sheet first, then go
  back a screen. On Home it leaves the app, except mid-workout, when it only
  sends the app to the background so the workout and timer keep running
  (`src/lib/back-button.ts`).

## Logging without signal

The workout logger keeps working with no signal. Every change is saved on the
phone first (IndexedDB) and sent to Supabase in order as soon as there's a
connection; a banner says "Saved offline, will sync" while anything is waiting.
Closing the app keeps the queue, and a workout can be started, logged, reopened
and finished offline. The exercise library, your programs and routines, and
last time's numbers are kept from the last time you were online. Sets and
workouts get their ids on the phone, so a retried sync never duplicates them.
Code: `src/lib/offline/`.

## Forgot password

The sign-in screen has **Forgot password?**: enter your email, then type the
code from the email and a new password. Supabase's standard reset email only
has a link, so make it show the code (one time):

1. Open your project's [email templates](https://supabase.com/dashboard/project/_/auth/templates)
   and pick **Reset Password**.
2. Set the subject to `Your Ironlog password reset code`.
3. Replace the message body with the contents of `supabase/templates/recovery.html`
   and save.

## Sign in with Google

The sign-in screen has **Continue with Google**. In the Android app Google
opens in a browser tab and sends you straight back into Ironlog, signed in.
If you already have an Ironlog account with the same Gmail address, Google
sign-in opens that same account (Supabase links them by email), so your
workouts are all there. A new Google user gets a fresh account and the
usual first-run setup.

It reuses the Google keys from [Google Calendar](#turning-on-google-calendar-one-time-no-command-line).
With those already set up, it's two steps:

1. Open https://console.cloud.google.com/auth/clients (project **Ironlog**
   selected at the top) and click your **Ironlog** client. Under **Authorized
   redirect URIs** click **Add URI**, paste
   `https://<your project ref>.supabase.co/auth/v1/callback`, and **Save**.
   (Keep the `gym-calendar` one that's already there.)
2. Run **Actions > Deploy database and functions**, then rebuild the APK.
   The deploy turns on Supabase's Google provider with your
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` secrets and adds the app's
   return link `com.ironlog.app://auth-callback` to the allowed redirect URLs.

Sign-in uses PKCE: the link back into the app carries a one-time code that
only the phone that started the sign-in can turn into a session. Code:
`src/lib/google-sign-in.ts`.

## Security

The app's public key is inside the APK, so the database is locked down on the
server rather than trusting the app:

- Every table has Row Level Security: you can only see and change your own
  rows, and rows can only point at things you own (your routines, programs,
  sessions, and built-in or your own exercises).
- Signed-out callers get nothing at all (`20261016000000_lockdown.sql`), and
  the same applies to anything added later.
- Every Edge Function checks who is calling: the app's functions check your
  sign-in, `watch-pair` and `claude-connector` check their own one-time code or
  secret link, and `gym-calendar`'s Google callback checks a signed, expiring
  state value.
- The phone app turns off Android backups and phone-to-phone transfers of its
  data, and only shares files from its own share and camera folders.

Since Ironlog is just for you, you can also stop anyone else from making an
account: in Supabase, open **Authentication > Sign In / Providers** and turn off
**Allow new users to sign up** (your own account keeps working).
