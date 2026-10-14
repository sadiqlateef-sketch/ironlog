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
  your phone, go to Home > **Link watch** and enter it. Codes last 10 minutes
  and work once, and 10 wrong tries locks code entry for a while.
- **Log from the wrist.** Start a routine or continue the phone's workout.
  Each set shows big **−/+** buttons for weight (5 lb or 2.5 kg) and reps,
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

## Import a finished workout

Workout > **Import** (or Home > **Import a workout from a photo or notes**)
adds a workout you already did somewhere else.

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
- **Finish** drops unchecked sets and saves the workout. Unit (lb / kg) is on
  the home screen.

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
