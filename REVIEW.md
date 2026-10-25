# IronLog review (2026-10-25)

Read-only review of `main` at `d129cf4`. No app code was changed. The only files written are this one and `NOTES.md`.

**Labels:** **CONFIRMED** = I saw it in the code, or saw it happen when I ran the app. **INFERRED** = my deduction, not checked end to end.

**How I checked:** I read the code and docs, ran `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`, and then ran the built app in a headless Chrome. I used two phone-sized windows: 412 px wide (Fold8 folded, cover screen) and 884 px wide (unfolded). The exact Fold8 widths are INFERRED. I did not use a real phone or watch.

**Pictures:** Screenshots of the app as it is now and the proposed mockups are in the project files under `ironlog-review/`. They are not in this repo, so the repo stays app code plus these two notes. `mockups.html` in that folder is the source for the mockup pictures.

---

## 1. Catch-up

### Git state
- `git status`: clean, nothing uncommitted. The branch matches `origin/main` (`d129cf4`). CONFIRMED.
- The last 18 commits (Oct 23 to 25) came from the Antigravity sessions. In order:
  - "v2.0.0 Cosmic Ruby" theme, Bujo ContentProvider, and a **1,435-line local mock backend**
  - Phases 1 to 10 (lint, debounce guards, Bujo bridge tests, foldable dual-pane, watch contract tests, 1RM transparency, AI prompt-injection tests, release packaging, backup tests)
  - Watch offline fallback and Wearable Data Layer bridge
  - Rest-notification action buttons and the plate visualizer
  - Yesterday's "stacked progress deck, periodization auto-adjust, science hypertrophy routines" (+4,682 lines)
  
  CONFIRMED.
- Docs in the repo root: `README.md`, `HANDOFF.md`, `PLAN.md`, `INVENTORY.md`, `BACKLOG.md`, `PHASES.md`, `MASTER_AGENT.md`, `MASTER_FIX_PLAYBOOK.md`. There was no `NOTES.md` before this review.

### Open pull requests (features that are NOT in the app yet)
| PR | Feature | State |
|---|---|---|
| #18 | Forgot password using Supabase's standard reset email | **open**, not merged |
| #20 | Health Connect (workouts out, heart rate and weight in) | **open**, not merged |
| #22 | Automatic deload weeks (server rules) | **open**, not merged |
| #19 Google login, #21 form demos | merged | on `main` |

These are CONFIRMED from GitHub. Some of these branches are a week old and are now far behind `main`.

### App map (CONFIRMED)
- **Routes** (Next.js static export, 14 pages): `/` Home, `/workout`, `/progress`, `/more`, `/plans`, `/exercises`, `/settings`, `/search`, `/log`, `/import`, `/welcome`, `/link-watch`, `/login`.
- **Tabs:** Home · Workout · Progress · More (`src/lib/nav.ts`).
- **State:**
  - The workout logger lives in `src/hooks/use-workout.ts` (1,265 lines).
  - The workout in progress is a mirror in IndexedDB (`src/lib/offline/workout-store.ts`).
  - Unsent changes wait in an outbox queue in IndexedDB (`src/lib/offline/queue.ts`).
  - Profile and session come from `auth-provider.tsx`.
  - There is no global store.
- **Data layer:** `src/lib/supabase/client.ts` → `mock-backend.ts` (see Defect D1). The real Supabase project has 17 tables and 20 migrations. The newest migration is from Oct 19, so the Antigravity work added no database changes.
- **Edge functions:** generate-plan (now Claude or Gemini), suggest-adjustments, import-workout, weekly-recap, watch-pair, gym-calendar, claude-connector.
- **Capacitor plugins:**
  - Official/community: app, browser, filesystem, geolocation, haptics, local-notifications, share, splash-screen, keep-awake, speech-recognition
  - Custom native: `RestCountdownPlugin`, `IronLogEcosystemPlugin`, `WearableBridgePlugin`
- **Watch:** React Native Wear OS app in `watch/`.

### Baseline checks (CONFIRMED, run today)
| Check | Result | Docs say |
|---|---|---|
| `npm test` | **227/227 pass** | 218/218 (HANDOFF) |
| `npm run lint` | **4 errors, 33 warnings** | "0 errors, 0 warnings" (HANDOFF) |
| `npm run typecheck` | Fails on a fresh clone (`LayoutProps` not found). Passes after `npm run build` generates the types. | "0 errors" |
| `npm run build` | Pass, 16/16 pages | Pass |
| GitHub "Android APK" workflow | **Fails** on `main` and on this PR (see D10) | "BUILD SUCCESSFUL" (local PC build) |

The lint errors are in:
- `home/last-session-card.tsx`
- `home/next-session-card.tsx`
- `progress/hypertrophy-landmarks-card.tsx`
- `lib/overload-settings.ts`

All four come from yesterday's commit.

---

## 2. State summary

### What is built and wired up (CONFIRMED)
- **Logger:**
  - Planned and empty workouts, warm-up/drop/failure set types, supersets
  - Swipes, hold to duplicate, number pad, one-handed and focus modes
  - Reorder and insert exercises, swap an exercise, per-exercise sticky note, per-exercise rest
  - Unilateral and timed sets, hold and interval timers
  - Effort (RPE/RIR) asked after a set, voice set entry
  - Record pop-up, finish summary
- **Rest timer:** in-app bar (±15 s, skip) plus a lock-screen countdown with +30 / −15 / Skip actions (native).
- **Plans:**
  - Ready-made templates
  - "Instant" builder
  - Program builder with a choice of Gemini or Claude
  - Periodization "mesocycle waves" with auto-apply, and overload settings
- **Progress:** Overview, Lifts, Body and Activity tabs. Recovery heatmap, volume and e1RM charts, streak calendar, plateau and insight cards, and the new "Progress Index" deck.
- **Import and backup:** JEFIT/Strong/Hevy file import, import from a photo, "Log with AI", and an `.xlsx` backup.
- **Native:** Bujo ecosystem ContentProvider, Wearable Data Layer bridge, keep-awake, haptics.

### Stubbed, faked or half-finished
- **The whole cloud backend is bypassed** (Defect D1). Here is what that means for each feature. CONFIRMED in `mock-backend.ts`, except where marked:

  | Feature | What happens now |
  |---|---|
  | Program builder ("Gemini" or "Claude") | Returns a **fixed template** with the label "Gemini" or "Claude" on it. No AI is called. The same 6 day types repeat, at 3 to 4 sets of 8 to 10. |
  | Photo import, AI log chat, weekly AI recap, next-time suggestions, gym calendar, watch pairing | Every other edge function returns `{ success: true }` and does nothing. I believe each screen shows an empty or "done" result. That part is INFERRED: I did not click through each one. |
  | Exercise library | **32 exercises** (seen in the app). The real database has 612 or more. |
- **Watch:**
  - When the watch can't reach the server, it makes up a 6-digit pairing code that pairs with nothing. It then shows a built-in "Full Body A" plan with fixed weights (100 kg squat and so on), from `watch/src/pairing.ts` and `watch/src/api.ts`. CONFIRMED.
  - A weight logged on the watch is dropped on the phone (Defect D5).
- **Welcome / onboarding:** `/welcome` exists, but new users never see it. The mock profile ships with `onboarded_at` already set, `unit_system: "metric"`, and gym "Home Gym". CONFIRMED.
- **Dead or leftover:**
  - `scripts/master-audit-fixes.mjs` (690 lines) and `scripts/full-verification.mjs` are agent-orchestration scripts, not app code.
  - `MASTER_AGENT.md` and `MASTER_FIX_PLAYBOOK.md` are instructions for agents.
  - The flagged `watch` link is still visible in More.
  
  INFERRED that none of these are needed at runtime.

### Docs vs code (trust the code)
| Doc claim | Code says |
|---|---|
| INVENTORY: the mock backend is a fallback "if Supabase is unconfigured or unreachable" | **Unconditional.** It answers every auth, database and function call before the network is tried (`client.ts:31`). CONFIRMED |
| HANDOFF: "ESLint 0 errors" | 4 errors. CONFIRMED |
| HANDOFF: "Release-ready", "Device-verified Fold8 and Watch8" | Cannot verify from code. The Watch8 pairing "verified" here can only mean the offline fake code. INFERRED |
| Plans screen: "Claude 5.5 Opus · Deep volume", "Gemini 3.8 Flash" | No model is called from the app (see above). CONFIRMED |
| Welcome screen: "Claude will build your first program" | The welcome flow never shows, and the builder is a template. CONFIRMED |
| README describes hosted Supabase, RLS, edge functions as the live setup | True for the server code. The phone app no longer uses any of it. CONFIRMED |

---

## 3. Reported items

### 3.1 Finish-workout bug (reported Oct 22): finishing doesn't clear the active session
**Verdict:** the plain case is fixed. A related defect is still present.

- **Fixed (CONFIRMED live):** I started "Full Body A", logged a set, tapped Finish, then went Home, reloaded and opened Workout. The workout stayed closed, and Home showed it as the last session. `finishSession()` clears the phone's copy first and stamps `end_time` locally (`workout-store.ts:283-319`).
- **Still present (CONFIRMED live): a second unfinished workout pops open the moment you finish one.**
  - The real database allowed only one unfinished workout per user. The local mock has no such rule.
  - `getActiveSession()` picks "any unfinished workout". So if two are open, finishing one immediately opens the other.
  - I reproduced it: with a leftover open workout in storage, I finished my workout and the Workout tab and Home "Resume" bar both came back with the other one.
  - **How a second one gets created** (INFERRED, not reproduced on a phone):
    - Home's Start button works while the active workout is still loading (`center-start-button.tsx:33`).
    - Watch starts.
    - A workout from yesterday (see below).
- **Also present (CONFIRMED live): a workout from a previous day can't be resumed, and closing the prompt deletes it.**
  - `isToday()` guards in `workout-store.ts` hide any workout that started before midnight. So:
    - A workout that runs past midnight vanishes from the logger mid-session. Relevant for late shifts. This part is CONFIRMED in code, not run.
    - The "Unfinished workout from previous day" sheet appears.
    - **Resume workout does nothing**: the sheet comes straight back. I tapped it and it reappeared.
    - **The X, tapping outside, or the Android back button all *discard* it**, including its logged sets, with no second tap (`workout-screen.tsx:109`, `onOpenChange → discardStale`).
  - So the only way out is deleting the workout. This loop is the most likely cause of the "keeps reopening" feeling. INFERRED.

### 3.2 Offline mode and onboarding
- **Offline mid-workout: works, but for the wrong reason.** CONFIRMED.
  - Every read and write goes to the phone's local storage, so signal never matters.
  - Nothing ever reaches the cloud either. The outbox "syncs" into the same local mock.
  - The original offline queue (IndexedDB outbox, retry on reconnect) is still there and would work against the real server.
- **Onboarding:** a 4-card tour runs on first launch (CONFIRMED live). The `/welcome` setup (name, units, goal, days, first program) is unreachable for new users because the mock profile is pre-filled (CONFIRMED). Units default to **kg** (CONFIRMED live: the logger showed KG).

### 3.3 Supabase scoping: is my data scoped to my account?
- **On the server: yes.** CONFIRMED in migrations.
  - All 17 tables have Row Level Security turned on.
  - Every policy checks `auth.uid()`. For example, `workout_sets` must be yours and must belong to your own session.
  - The `anon` role is locked out (`20261016000000_lockdown.sql`).
  - The 3 `security definer` functions are scoped.
  - I did not log into the live project, so whether these are deployed there is INFERRED.
- **In the app as built: scoping no longer applies.** CONFIRMED live.
  - I signed in as `x@y.z` with a wrong password and got in. The app showed "Sadiq Lateef / sadiq.lateef@gmail.com".
  - Any email and password, or the Google button, signs in to the same fake account (`mock-backend.ts:979`, `google-sign-in.ts:27`).
  - Your data sits unprotected in the app's WebView storage on the phone.
  - **Your earlier cloud history is not shown in the app:** JEFIT imports, workouts logged from Claude chat via the connector, and anything before Oct 23.
- **Also (CONFIRMED):** `android/app/build.gradle:25-27` and `watch/android/app/build.gradle:100-102` hard-code a fallback password for the shared Bujo/IronLog release keystore. The `.jks` file itself is git-ignored. Anyone who gets that file and this repo can sign apps that the Bujo ContentProvider trusts.

---

## 4. UI audit

Pictures are in the project files under `ironlog-review/`. Files named `current-*` are the app now, and files named `mockup-*` are proposals.

### Mid-workout usability (folded is the main case)
- **Good (CONFIRMED live):**
  - Big numbers: weight and reps at about 22 px bold, with 48 px tall fields and check buttons.
  - "Last time" column on every row.
  - One big **Log Set** button that logs the next set and starts rest.
  - Screen kept awake.
  - Logging a set is **1 tap** when the prefilled numbers are right, and 3 to 4 taps to change a number with the keypad.
- **Problems:**
  1. **The bottom of the screen is covered by stacked bars.** Folded, the rest bar, the Log Set bar and the tab bar together take about 470 of 915 px while resting. The Log Set bar is see-through, so set numbers show through it ("100", "Add"), and **"+ Add exercise" sits under the tab bar**. See `current-logger-resting-folded.png`. CONFIRMED.
  2. **Warm-up sets prefill 0 weight.** For a planned workout, both W rows showed `0 × 7` and Log Set logs them as 0. The warm-up calculator exists as a separate sheet but isn't used to fill these. CONFIRMED live.
  3. **Targets are silently rewritten.**
     - "Auto-apply periodization" is **on by default** (`overload-settings.ts:29`). It changed a 3×5 squat into "Target 7".
     - The same line then says "Accumulation (RPE 7-8) · RPE 8", which is two different RPE targets.
     - It stacks on programs that already periodize (5/3/1, Sheiko).
     - Its week counter is a manual setting, not tied to the program week.
     
     CONFIRMED live and in `use-workout.ts:258-273`.
  4. Header buttons: **Discard** (red text) sits about 90 px from **Finish**. Both are in the hardest-to-reach corner of a 6.5" screen one-handed. INFERRED risk of mis-taps.
  5. **No live volume or running total** while logging. It only shows on the finish summary. CONFIRMED by search.
  6. Swipe/hold hint banner takes the top of the screen until dismissed. Minor.

### Foldable (folded vs unfolded)
- **Logger unfolded:** a real two-pane layout, with the set table on the left and session exercises on the right. Good use of width. CONFIRMED (`current-logger-unfolded.png`).
- **Home unfolded:** the folded single column, stretched. Three cards at the top, then about 60% empty screen. The "Start Workout" button is centered at about 380 px wide. CONFIRMED (`current-home-unfolded.png`).
- **Progress, Settings, Plans unfolded:** single column stretched to full width. Progress becomes a long wall of wide, short cards. CONFIRMED.
- **Tab bar unfolded:** floats centered at about 60% width. That's fine.

### Consistency
- **Theme drift:**
  - Most screens use the ruby/gold "Cosmic Ruby" palette.
  - The new **Progress Index / Strength / Volume / Balance deck** uses its own **purple** tokens (`--progress-purple*` in `globals.css`). It also uses a different card style and emoji (⚠️).
  - The periodization card uses blue.
  - CONFIRMED. (Note: the dark-navy glass look you approved on Oct 14 was replaced by this ruby/gold theme in the Antigravity work. If that was your choice, fine. Just confirming it was intentional.)
- **Home header duplicates the tabs:** "Progress" and "More" buttons appear in the header and again in the tab bar. CONFIRMED.
- **Naming drift:** "Programs" / "Plans" / "Choose Plan" / "Build new hypertrophy plan" / "Find a plan" all mean the same place. "Last Session" vs "Last Session Debrief". CONFIRMED.
- **Progress Overview is about 9,000 px tall when folded**, with about 20 cards. Several show alarming empty states. For example, on an empty account it shows "Week Closed Empty ⚠️" with "Score: 94". CONFIRMED live.

### Empty, loading and error states
- **Good:** Home, Workout, Progress, Lifts and Exercises have proper empty states. The logger shows skeletons while loading (CONFIRMED). No screen hung on a spinner during my run.
- **Silent failure risks:**
  - The mock backend swallows storage errors (`setStored` → `catch {}`). When the phone's WebView storage fills up (usually around 5 to 10 MB), new sets and imports **silently don't save**. A big JEFIT history makes this likely. CONFIRMED in code; the size limit is INFERRED.
  - AI and photo/recap screens get a fake `{ success: true }` instead of an error, so they can't tell you "this doesn't work right now". INFERRED.

---

## 5. Feature audit against the approved list

| Feature | Status | Evidence |
|---|---|---|
| Rest timer | **EXISTS** | Auto-starts on Log Set; ±15 s, skip; lock-screen countdown with actions (`rest-timer-bar.tsx`, `RestCountdownPlugin.java`). CONFIRMED live |
| Last-session numbers per exercise | **EXISTS** | "Last time" column, from `get_last_performance` (local now). CONFIRMED live |
| Progressive-overload nudges | **EXISTS** | "Try X today" suggestion (`set-logic.ts:141`, `suggestWeight`), with settings for increments and triggers. CONFIRMED |
| Plate calculator | **EXISTS** | `plate-calculator.tsx` (sleeve visual) and in More. CONFIRMED |
| Warm-up set calculator | **PARTIAL** | Ramp sheet works (`warmup-sheet.tsx`, `warmupRamp`), but planned warm-up rows prefill 0 weight. CONFIRMED live |
| Live workout volume | **MISSING** | Only on the finish summary and Home after finishing. CONFIRMED |
| PR tracking with e1RM (Epley) | **EXISTS** | `one-rm.ts`, record pop-up, Lifts tab, "tested vs estimated" label. CONFIRMED |
| Form cues per exercise | **EXISTS** | Looping demo images and instruction steps per exercise (`exercise-animation.tsx`, `exercise-detail.tsx`), plus routine notes. Demo images load from GitHub (needs internet). CONFIRMED |
| RPE logging | **EXISTS** | Effort picker after each set, RPE or RIR scale. CONFIRMED |
| Supersets / circuits | **EXISTS** / **PARTIAL** | Supersets yes (`superset_group`, toggle). There is no circuit mode with rounds and auto-advance across 3+ exercises. INFERRED |
| Drop sets / AMRAPs | **EXISTS** / **MISSING** | Drop sets yes (hold → add drop set). No AMRAP set type: types are warmup/normal/drop/failure only (`database.ts:7`). CONFIRMED |
| Tempo prescriptions | **MISSING** | No tempo field anywhere. CONFIRMED |
| Deload suggestions | **PARTIAL** | Client periodization has a deload week in the wave. Server rules are in suggest-adjustments (mocked away). Full deload weeks are PR #22 (open). CONFIRMED |
| Per-muscle recovery status | **EXISTS** | `recovery.ts` and body heatmap. CONFIRMED |
| Exercise substitutions | **EXISTS** | `swap-sheet.tsx` ("smart swaps" by kit). CONFIRMED |
| Program templates | **EXISTS** | `templates.ts` (Find tab), and new science hypertrophy routines. CONFIRMED |
| Voice logging | **EXISTS** | Mic in the logger (`voice-log.tsx`, `voice-set.ts`) uses on-device speech. "Log with AI" chat depends on a mocked function. CONFIRMED / INFERRED |
| Missed-rep auto-adjust | **PARTIAL** | The client only suggests going up or holding. Lowering weight after missed reps lived in suggest-adjustments, which is now mocked. CONFIRMED |
| Per-set notes | **PARTIAL** | DB column `workout_sets.notes` exists. The UI only has a per-exercise sticky note and workout notes. CONFIRMED |
| Strength curves (progress charts) | **EXISTS** | e1RM and volume line charts, Lifts tab, exercise overview. CONFIRMED |
| Health Connect sync | **MISSING on main** | Only in open PR #20. CONFIRMED |

### Bujo Tasks bridge: where it would hook in (assessment only)
- **Write-back on completion already exists.**
  - `useWorkout().finish()` (`src/hooks/use-workout.ts`, line 456) calls `IronLogEcosystemSync.onWorkoutCompleted()` (`src/services/ironlogEcosystemSync.ts`).
  - That calls the native `IronLogEcosystemPlugin.java`, which writes to `IronLogContentProvider` (`content://com.ironlog.app.provider/workouts|recovery|prs`, signature-protected) and calls into Bujo / Braindump.
  - CONFIRMED in code. A two-app test on the phone is not something I can do here.
- **Reading "today's planned workout" has no hook yet.**
  - The provider has no `today` or `plan` table.
  - Today's plan only exists in the web layer (`program_progress` / `next_routine_*`, now from WebView storage). Native code can't read it.
  - The natural spot: whenever Home loads the program, push "next routine" through the same plugin into a new provider table.
  - INFERRED.

---

## 6. Proposals

Each proposal lists: problem → proposal · files · effort · risk.

### Defects
- **D1. App is cut off from the cloud.**
  - **Problem:** see 3.2 and 3.3. Your history, AI features and watch pairing are fake or missing, any password opens the app, and all data lives in one phone's WebView storage.
  - **Proposal:**
    - Make the mock a **dev-only fallback**, used only when no Supabase URL is configured.
    - Restore real sign-in.
    - Keep the existing offline queue for gym dead zones.
    - Add a one-time "upload what's on this phone" step, so the Oct 23-25 workouts aren't lost.
  - **Files:** `src/lib/supabase/client.ts`, `mock-backend.ts`, `google-sign-in.ts`, `workout-store.ts` (remove direct `localStorage` writes), plus a small migration helper.
  - **Effort:** project (1 to 2 sessions).
  - **Risk:** **high** if done carelessly (data on the phone). Mitigation: export a backup first, which already exists.
  - **Decision for you:** do you want IronLog cloud-backed (my recommendation) or deliberately phone-only?
- **D2. Previous-day workout is stuck: Resume doesn't work, and closing the prompt deletes it.**
  - **Proposal:**
    - Resume should actually resume.
    - Closing the prompt keeps the workout.
    - Delete needs a confirm.
    - Replace the "same calendar day" rule with "started less than 12 hours ago", so late-night sessions survive midnight.
  - **Files:** `workout-store.ts` (`getActiveSession`, `peekActiveWorkout`, `getStaleSession`), `workout-screen.tsx:105-138`, `use-active-workout.ts`.
  - **Effort:** quick win. **Risk:** low.
  - **Picture:** `mockup-4-overnight-workout.png`.
- **D3. Two unfinished workouts → finishing one opens the other.**
  - **Proposal:**
    - Refuse to start a workout while one is open: offer resume or finish instead.
    - Disable Start until the active check has loaded.
    - Restoring the real DB rule (D1) also fixes this.
  - **Files:** `startPlannedSession` in `workout-store.ts`, `center-start-button.tsx`, `home-tab.tsx`, `planned-tab.tsx`.
  - **Effort:** quick win. **Risk:** low.
- **D4. Silent data loss when storage is full.**
  - **Proposal:** surface write failures as a visible "Couldn't save" banner. D1 removes most of the risk.
  - **Files:** `mock-backend.ts` (`setStored`).
  - **Effort:** quick win. **Risk:** low.
- **D5. Watch weight is dropped.**
  - **Problem:** sets logged on the watch send `weight_kg`, but the phone expects `weight` (and a string in your unit). Reps arrive as a number in a text field.
  - **Files:** `use-workout.ts:1177-1197`.
  - **Effort:** quick win. **Risk:** low.
- **D6. Periodization auto-apply is on by default and overrides program targets.**
  - **Proposal:** default it to off; when on, only apply to workouts that are not from a periodized program, and show the original target next to the adjusted one.
  - **Files:** `overload-settings.ts:29`, `use-workout.ts:258-273`.
  - **Effort:** quick win. **Risk:** low.
- **D7. Warm-up rows prefill 0.**
  - **Proposal:** fill planned warm-up rows from `warmupRamp()` using the first working weight.
  - **Files:** `startPlannedSession` / `use-workout.ts` load.
  - **Effort:** quick win. **Risk:** low.
- **D8. Lint is red (4 errors) and typecheck fails on a fresh clone.**
  - **Proposal:** fix the 4 set-state-in-effect / impure-render errors. Make `typecheck` run `next typegen` first, or document it.
  - **Effort:** quick win. **Risk:** low.
- **D10. The phone APK no longer builds on GitHub Actions.** CONFIRMED.
  - **Problem:** the "Android APK" workflow is red on `main` (run 109, from `d129cf4`) and on this PR (run 110), with `SigningConfig "release" is missing required property "storeFile"` at `:app:packageDebug`.
  - **Cause:** `android/app/build.gradle` now signs the **debug** build with the release key, and the key path falls back to a Windows path on your PC (`C:/Users/sadiq/...`). On GitHub's runner that file doesn't exist, so the debug build has no key. So you can't get a new APK from Actions until this is fixed. Builds from Android Studio on your own PC still work.
  - **Proposal:** debug builds use the normal debug key again, and release builds use the keystore only when one is provided (the workflow already passes it as a secret).
  - **Files:** `android/app/build.gradle` (and the same pattern in `watch/android/app/build.gradle`, whose workflow is still green).
  - **Effort:** quick win. **Risk:** low. A debug-signed APK can't install over a release-signed one without uninstalling first, so I'd check which one is on your phone.
- **D9. Keystore fallback password committed in two Gradle files.**
  - **Proposal:** remove the fallback (env-only), and consider rotating it if the `.jks` was ever shared.
  - **Effort:** quick win. **Risk:** low. Rotating means re-signing all the ecosystem apps, so treat that as a separate decision.

### Quick wins (UI and features)
- **Q1. One bottom dock in the logger, folded.**
  - **Problem:** see 4, problem 1.
  - **Proposal:**
    - Hide the tab bar during a workout.
    - Merge the rest timer and Log Set into one solid dock that shows the countdown ring and "Set 2 · 230 × 5".
    - Move "+ Add exercise" into the list.
  - **Files:** `workout-screen.tsx` (bottom bar), `rest-timer-bar.tsx`, `app-shell.tsx`.
  - **Effort:** quick-to-medium. **Risk:** low to medium (touches the most-used screen).
  - **Picture:** `mockup-1-logger-folded.png` (compare `current-logger-resting-folded.png`).
- **Q2. Live volume chip in the logger header**, plus "Ex 1 of 4". Shown in mockup 1.
  - **Files:** `workout-screen.tsx`.
  - **Effort:** quick. **Risk:** low.
- **Q3. Move Discard into the ⋯ menu**, so only Finish stays in the header.
  - **Files:** `workout-screen.tsx:461`.
  - **Effort:** quick. **Risk:** low.
- **Q4. Plate breakdown inline under barbell sets** ("45+45+2.5 /side"), using `plates.ts`. Shown in mockup 1.
  - **Effort:** quick. **Risk:** low.
- **Q5. AMRAP set type and a tempo field** on routine exercises (for example "3-1-1-0", shown under the target).
  - **Files:** migration (`set_type` enum, `routine_exercises.tempo`), `set-row.tsx`, `workout-editor.tsx`.
  - **Effort:** quick-to-medium. **Risk:** low.
- **Q6. Per-set note:** hold a set → "Add note" (the DB column exists).
  - **Files:** `set-row.tsx`, `use-workout.ts`.
  - **Effort:** quick. **Risk:** low.
- **Q7. Remove the duplicate Progress/More buttons from the Home header, and pick one name ("Programs") everywhere.**
  - **Files:** `src/app/page.tsx`, the Home cards.
  - **Effort:** quick. **Risk:** low.
- **Q8. Purple Progress deck → app tokens.**
  - **Proposal:** use the gold/ruby tokens, and drop the alarm-style empty states ("Week Closed Empty ⚠️", score shown with no data).
  - **Files:** `progress/*-card.tsx`, `globals.css`.
  - **Effort:** quick. **Risk:** low.

### Projects
- **P1. Home as a two-column dashboard when unfolded.**
  - **Proposal:**
    - Left: Today card with a big Start button and week strip.
    - Right: last workout and recovery chips.
    - Folded keeps the current single column.
  - **Files:** `src/app/page.tsx`, `components/home/*`.
  - **Effort:** project (small). **Risk:** low.
  - **Picture:** `mockup-2-home-unfolded.png` (compare `current-home-unfolded.png`).
- **P2. Progress: a short summary first, the rest folded away.**
  - **Proposal:**
    - Top: This week (workouts / volume / PRs), main-lift e1RM sparklines, one "needs attention" line (plateau).
    - Everything else goes behind collapsible sections.
    - Unfolded: two columns.
  - **Files:** `src/app/progress/page.tsx`, `components/progress/*`.
  - **Effort:** project. **Risk:** low to medium (lots of cards to move).
  - **Picture:** `mockup-3-progress-folded.png` (compare `current-progress-folded-strip.png`).
- **P3. Missed-rep auto-adjust on the phone.**
  - **Proposal:** extend `suggestWeight()` to suggest a 5-10% drop after two sessions that missed the bottom of the rep range, so it works without the server. This pairs with PR #22.
  - **Files:** `set-logic.ts`, `exercise-block.tsx`.
  - **Effort:** small project. **Risk:** low.
- **P4. Circuit mode.**
  - **Proposal:** a group of 3+ exercises done in rounds, where Log Set auto-advances to the next exercise and rest happens only after the round.
  - **Files:** `use-workout.ts`, `exercise-block.tsx`, `workout-editor.tsx`.
  - **Effort:** project. **Risk:** medium.
- **P5. Land the open PRs.** Rebase and merge #18 (reset email), #22 (deload weeks) and #20 (Health Connect) after D1, since all three assume the real backend.
  - **Effort:** project (rebases are large now). **Risk:** medium.
- **P6. Bujo "today's plan" read hook.** As described in section 5. Assess only; not designed here.
- **P7. Clean up agent leftovers.** Archive `MASTER_AGENT.md`, `MASTER_FIX_PLAYBOOK.md`, the `scripts/master-*` / `full-verification` scripts, and outdated claims in `HANDOFF.md` / `INVENTORY.md`, so the next session doesn't trust them.
  - **Effort:** quick. **Risk:** none.

---

## 7. Prioritized list (approve item by item)

**Defects**
1. D1: Reconnect the app to your cloud account (mock becomes dev-only), keeping offline logging. *Needs your decision: cloud-backed or phone-only.*
2. D10: Make the phone APK build on GitHub Actions again (red on `main` since `d129cf4`).
3. D2: Fix the previous-day workout prompt (Resume works, closing keeps it, late-night sessions survive midnight).
4. D3: Block a second open workout, so finishing one can't pop open another.
5. D5: Watch-logged weight gets dropped on the phone.
6. D6: Turn periodization auto-apply off by default, and stop it overriding program targets.
7. D7: Prefill warm-up weights instead of 0.
8. D4: Show an error when saving fails (storage full).
9. D9: Remove the committed keystore password fallback.
10. D8: Make lint and typecheck green again.

**Quick wins**
11. Q1: One bottom dock in the logger (folded); hide tabs during a workout. *(mockup 1)*
12. Q2: Live volume and exercise count in the logger header.
13. Q3: Move Discard into the ⋯ menu.
14. Q4: Inline plate breakdown on barbell sets.
15. Q6: Per-set notes.
16. Q5: AMRAP set type and tempo prescriptions.
17. Q7: Remove duplicate Home header buttons; one name for Programs.
18. Q8: Bring the Progress deck back to the app's colors; calmer empty states.

**Projects**
19. P1: Two-column Home when unfolded. *(mockup 2)*
20. P2: Progress summary-first layout. *(mockup 3)*
21. P3: Missed-rep auto-adjust on the phone.
22. P5: Rebase and merge the open PRs (#18 reset email, #22 deload, #20 Health Connect).
23. P4: Circuit mode.
24. P6: Bujo "today's plan" read hook.
25. P7: Archive agent leftovers and outdated status docs.
