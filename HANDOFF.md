# IronLog handoff (2026-11-01)

Written for whoever takes IronLog over next. It is documentation only: no app code was changed while writing it.

**Labels used below**
- **CONFIRMED**: seen in the code, the git history, the live Supabase project (read-only queries on 2026-11-01), or a check I ran today.
- **INFERRED**: my deduction, not checked end to end.
- **NEEDS-DEVICE-TEST**: can only be settled on Sadiq's Galaxy Z Fold8 (or Galaxy Watch). Nothing is marked as verified on the phone unless Sadiq said so himself in chat.

**Rule for reading this file:** Sadiq's own reports from the phone outrank any agent's "done" claim, this file included. Where the two disagree, his version is the open item.

## Repo state at handoff

| | |
|---|---|
| Branch | `main` (handoff branch `claude/project-thread-dfd14o` is merged into it) |
| HEAD before this handoff commit | `240d64b6bd123c720a27129da421a3c69912ecb5` |
| Working tree | Clean before this commit. Nothing is deliberately left uncommitted. |
| CI on `240d64b` | Android APK and Watch APK workflows both green (runs 155 and 25, 2026-10-29). CONFIRMED |

Last 5 commits before this handoff (all 2026-10-28/29, authored as `sadiqlateef-sketch` from another tool's sessions, Antigravity going by the commit style; none went through a PR):
1. `240d64b` feat(watch): implement native Wear OS Live Swipe Tile and Watch Face Complications
2. `18e7cb7` fix(watch): ensure offline JS bundle is packaged into debug APK for standalone Wear OS operation
3. `0856a65` feat: implement 10 next-gen features and 5 UI enhancements with full test coverage
4. `67480f3` feat(templates): add PHUL, 5/3/1 BBB, 6-day PPL, calisthenics routines and live workout flow test suite
5. `5727033` feat: Implement 20 advanced features & UI experiences across 4 phases

The last commit reviewed by a Claude session was `010e968` (PR #43, 2026-10-25). Everything after it is unreviewed (see section 3b).

**Installed on the Fold8: UNKNOWN.**
- Last known install: release APK **2.0.0 (versionCode 2)**, built on Sadiq's PC (SALegion) from `main` at `010e968` and installed with `adb install -r` on 2026-10-25 at about 23:43 UTC by a Remote Control session. CONFIRMED from that session's report.
- After that, the live database shows a phone sign-in on 2026-10-29 17:54 UTC and a new watch pairing at 17:49 UTC. That was the same hour as the watch commits above. Something was probably installed or re-paired that day, but nothing records which build. INFERRED.
- The version number was never bumped. Every build since 2026-10-25 says 2.0.0, so Android's app info can't tell them apart.
- Watch: last known install is Ironlog Watch release 1.0.0, built 2026-10-25 about 23:15 UTC from the PR #42 branch. What is on it now is UNKNOWN for the same reason.

---

## 1. What this is

IronLog is Sadiq's personal strength-training log: a Next.js 16 static web app wrapped in Capacitor 8 as an Android app (`com.ironlog.app`), with a React Native Wear OS companion in `watch/`. Supabase holds the data, auth and Edge Functions, and the Claude API (plus an optional Gemini path) runs the AI planning features. It is for one user only, on a Galaxy Z Fold8 (used folded and unfolded) and a Galaxy Watch. It is sideloaded, not a Play Store product, and judged only by personal use.

---

## 2. The finish-workout bug: first, before everything

**Sadiq's report:** finishing a workout never clears the active session, so the workout keeps reopening. The handoff script dates the report 2026-10-23. The Oct 25 review script says Oct 22. The original message isn't in the Claude project chat (it was probably made in the other tool), so the exact date is unconfirmed.

**Standing order (recorded here so it survives the handoff): this fix lands and is verified on Sadiq's phone before any feature work.**

| Question | Answer |
|---|---|
| Root cause found? | **Partly.** The Oct 25 review found the causes for the build that was on the phone then. That build used a local mock backend instead of Supabase. (1) The mock had no "one open workout" rule, so with two open workouts, finishing one opened the other. (2) A workout from a previous day couldn't be resumed: the prompt came straight back, and closing it deleted the workout. The plain case (start, log, finish, reload) worked in a headless browser. CONFIRMED in `REVIEW.md` §3.1. **Whether either cause is what Sadiq saw on the phone was never confirmed.** |
| Fixed in code? | **Fixes for those causes are merged:** `8ee1e56` (Phase 3: real Supabase again, which brings back the database's one-open-workout unique index), `a3afa77` (Phase 4: old workouts stay open 12 h; keep / finish / delete; closing never deletes), `78b4db1` (Phase 5: can't start a second workout while one is open). CONFIRMED in git. None of the session-lifecycle files (`src/lib/offline/*`, `src/hooks/use-workout.ts`) changed after 2026-10-25. CONFIRMED |
| Verified on his phone? | **No.** Sadiq was asked three times on 2026-10-25 to "start one workout, log one set, finish it, close and reopen the app" and never reported a result. His "done" on 2026-10-26 00:19 UTC was ambiguous: the agent and the PC session read it two different ways. It doesn't count as a pass. **NEEDS-DEVICE-TEST** |
| Has a fix script been run? | **No.** This session did not run the separate finish-workout fix script, and no commit or chat message shows anyone else running it. |

**Evidence from the live database (CONFIRMED, read-only, 2026-11-01):**
- One workout is still open on the server: "Day 2 - Heavy Bench", started 2026-10-28 18:27 UTC, 29 sets laid out, **0 sets ticked**, last set change 18:29 UTC, no heart-rate samples. Either it was abandoned, or the sets and the Finish never reached the server. If Sadiq tapped Finish on it, this is a live case of the bug. Ask him before deciding.
- The workout before it, "Day 1 - Heavy Squat" (2026-10-25 23:19 to 23:21 UTC, 12/12 sets ticked, from the phone), did finish properly on the server. Nobody has said whether it reopened on the phone afterwards.
- It's now more than 12 hours old. So in code, the app should show the "unfinished workout from earlier" prompt (Keep logging / Finish it now / Delete it) rather than a live workout. NEEDS-DEVICE-TEST

**Code paths that could still make a finished workout come back (INFERRED, not reproduced):**
1. **The outbox drops changes the server refuses.** `flush()` in `src/lib/offline/queue.ts` shows the error once, then deletes the change so it can't block the queue. If the `finish` change is refused for any reason other than "no signal", the session stays open on the server. The phone has already cleared its own copy, so the next `getActiveSession()` (`workout-store.ts:124`) reads the open row from the server, and the workout reappears. This matches "finishing never clears it" closely.
2. **Starting offline while the server already has an open workout.** The one-open check in `startPlannedSession()` is skipped when there's no signal. The later insert is refused by the `workout_sessions_one_active_per_user` unique index and dropped, and so is every set after it. The other open workout then comes back. That would also lose the new workout's data.
3. **No automated test covers finishing against a real database.** `scripts/smoke-test.mjs` (36/36 today) checks "no workout bar after finishing" against the mock backend only. `tests/live-workout-flow.test.ts` ("Session Finish") tests volume math, not `finishSession`.

---

## 3. Feature ledger: the 21 approved features

"DONE" means built and wired up in the code. **None of the 21 has been verified on the Fold8 by Sadiq**, so each one is also NEEDS-DEVICE-TEST.

| # | Feature | Status | Owning file(s) |
|---|---|---|---|
| 1 | Rest timer | DONE | `src/components/rest-timer-bar.tsx`, `src/components/workout/rest-sheet.tsx`, `src/hooks/use-workout.ts`, native `RestCountdownPlugin` (lock-screen countdown) |
| 2 | Last-session numbers per exercise | DONE | RPC `get_last_performance`, `src/components/workout/set-row.tsx`, `use-workout.ts` |
| 3 | Overload nudges | DONE | `src/lib/set-logic.ts` (`suggestWeight`), `src/lib/overload-settings.ts` |
| 4 | Plate calculator | DONE | `src/components/plate-calculator.tsx`, `src/lib/plates.ts`, `src/components/workout/plate-micro-stack.tsx` |
| 5 | Warm-up calculator | DONE (warm-up rows prefilled since Phase 8) | `src/components/workout/warmup-sheet.tsx`, `src/lib/set-logic.ts` (`warmupWeightsKg`), `src/lib/offline/workout-store.ts` |
| 6 | Live volume | DONE (Phase 12) | `src/lib/workout-logic.ts` (`liveVolume`), `src/components/workout/workout-screen.tsx`. See the unilateral mismatch in section 7 |
| 7 | PRs with Epley 1RM estimates | DONE | `src/lib/one-rm.ts` (`epley` = w × (1 + reps/30)), `src/components/workout/record.tsx`, `src/components/progress/lifts.tsx` |
| 8 | Form cues | DONE (images need internet) | `src/components/exercise-animation.tsx`, `src/components/exercise-detail.tsx`, `src/lib/cues.ts` |
| 9 | RPE logging | DONE | `src/components/workout/effort-picker.tsx` |
| 10 | Supersets / circuits | DONE (circuits since Phase 23) | `src/components/workout/exercise-block.tsx`, `src/lib/workout-logic.ts`, `use-workout.ts` |
| 11 | Drop sets & AMRAPs | DONE (AMRAP since Phase 16) | `set-row.tsx`, `exercise-block.tsx`, migration `20261026000000_amrap_tempo.sql` |
| 12 | Tempo prescriptions | DONE (Phase 16) | `src/components/workout-editor.tsx`, `src/lib/tempo.ts`, `exercise-block.tsx` |
| 13 | Deload suggestions | DONE (PR #22) | `src/components/deload-offer.tsx`, `supabase/functions/_shared/adjust.ts`, migration `20261026010000_deload_weeks.sql`, `src/lib/periodization.ts` |
| 14 | Per-muscle recovery status | DONE | `src/lib/recovery.ts`, `src/components/body-heatmap.tsx`, `src/components/muscle-map.tsx` |
| 15 | Exercise substitutions | DONE | `src/components/workout/swap-sheet.tsx`, `src/lib/substitution-engine.ts` |
| 16 | Program templates | DONE | `src/lib/templates.ts`, `src/components/workout/find-tab.tsx` |
| 17 | Voice logging | DONE | `src/components/workout/voice-log.tsx`, `src/lib/voice-set.ts`, `src/lib/speech.ts` (on-device speech); "Log with AI" uses Edge Function `import-workout` |
| 18 | Missed-rep auto-adjust | DONE (Phase 21: two misses in a row means 10% lighter) | `src/lib/set-logic.ts`, `use-workout.ts`, Edge Function `suggest-adjustments` |
| 19 | Per-set notes | DONE (Phase 15) | `src/components/workout/notes-sheet.tsx`, `set-row.tsx`, column `workout_sets.notes` |
| 20 | Strength curves | DONE | `src/components/charts/line-chart.tsx`, `src/components/progress/lifts.tsx`, `src/components/exercise-overview.tsx` |
| 21 | Health Connect sync | DONE in code (PR #20) | `src/lib/health.ts`, `src/lib/health-logic.ts`, `src/components/health-sheet.tsx`, `android/.../MainActivity.java` |

**Code: 21 of 21 built. Phone: 0 of 21 verified.**

### 3a. Built before the 21-item list existed (Sadiq asked for each in chat, Oct 13-25)

These are approved, but they sit outside the 21:
- the watch app
- multi-week programs
- AI program builder (Claude, plus a Gemini option)
- photo, text and "Log with AI" import
- JEFIT/Strong/Hevy import
- `.xlsx` backup and CSV export
- Claude chat connector
- gym check-in with Google Calendar events
- Google sign-in, forgot password
- edit or delete past workouts
- reorder exercises mid-workout
- body tracking and progress photos
- equipment kits, "Use What You Got" home workouts, shift-aware scheduling
- lift goals, streaks, plateau detector, weekly AI recap, strain score
- logger controls (keypad, swipes, focus and one-handed modes)
- light mode and text size, tour, search
- Bujo Tasks ContentProvider (finished workouts out, plus `today_plan` in PR #43)

### 3b. Built WITHOUT a recorded approval (the Oct 28-29 commits): scope additions

No chat message from Sadiq asks for these. Some of them look like picks from the 2026-10-27 idea list (U8 accent colours, U10 watch tile, F3 check-in, F5 milestones), which he never answered.

- **Wired into screens:**
  - readiness/sleep card (manual sleep entry, defaults 7.5 h / 85%): `home/readiness-card.tsx`
  - session "stack of cards": `home/session-stack.tsx`
  - week orbit strip
  - "Flow State" minimal logger: `workout/flow-state-view.tsx`
  - "What-If" simulation: `workout/simulation-sheet.tsx`
  - AI Form Coach with a Web Audio metronome: `workout/form-coach-sheet.tsx`
  - **Live partner sync** over Supabase Realtime with a 6-character room code: `workout/partner-sync-sheet.tsx`, `src/services/partnerSync.ts`
  - trophy case, workout DNA, accent themes, ambient rest arc, anatomy orb, radial dial keypad, plate stack visualizer
  - new templates (PHUL, 5/3/1 BBB, 6-day PPL, calisthenics, RP PPLUL, Arnold, PHAT, lengthened)
- **Watch:** Wear OS Tile and watch-face Complication (`watch/android/.../WorkoutTileService.kt`, `WorkoutComplicationService.kt`, `watch/src/tileBridge.ts`)
- **Written but used nowhere except tests (dead code):**
  - `src/lib/` modules: `audio-coach`, `doms-heatmap`, `drop-sets`, `equipment-scanner`, `fatigue-prediction`, `partner-duel`, `velocity`, `volume-landmarks`, `watch-tile-payload`, `equipment-routing`, `progress-index-advanced`
  - component `workout/morphing-workout-header.tsx`

---

## 4. State of the build

**Checks run today on `240d64b` (cloud container, CONFIRMED):**

| Command | Result |
|---|---|
| `npm ci` | OK |
| `npm test` | **303/303 pass** |
| `npm run typecheck` | Pass |
| `npm run build` | Pass (static export to `out/`) |
| `npm run smoke` | **36/36** (headless Chrome, mock backend, folded and unfolded widths) |
| `npm run lint` | **Fails: 7 errors, 79 warnings.** All 7 are in Oct 28-29 files: `home/readiness-card.tsx`, `workout/form-coach-sheet.tsx` (2), `workout/partner-sync-sheet.tsx` (2), `workout/simulation-sheet.tsx` (setState inside an effect), `services/partnerSync.ts` (`any`). The Oct 25 Phase 2 left lint at 0 errors. |

The Android APK and the watch APK can't be compiled in a cloud container, because `dl.google.com` is blocked. GitHub Actions compiled both on `240d64b` successfully. CONFIRMED

**Capacitor flow (CONFIRMED in `package.json`, `capacitor.config.ts`):**
1. `npm run android:sync`, which runs `next build` (to `out/`) and then `cap sync android`.
2. In `android/`: `gradlew assembleRelease` (on Sadiq's PC, `gradlew.bat`).
3. `adb install -r <apk>` over wireless debugging. **Never uninstall first**: that wipes the phone's outbox and its copy of the open workout.

The build needs `.env.production.local` (git-ignored) with the real `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see section 10).

**Signing:**
- **CONFIRMED: the shared Bujo ecosystem release key.** `android/app/build.gradle` uses `IRONLOG_KEYSTORE`, with a default path of `C:/Users/sadiq/Projects/bujo-tasks/android/bujo-release.jks`. The passwords come only from the env vars `IRONLOG_KEYSTORE_PASSWORD`, `IRONLOG_KEY_ALIAS` and `IRONLOG_KEY_PASSWORD`, set with `setx` on SALegion (PR #41).
- With no key present it builds unsigned/debug (Phase 1, `6fa4408`).
- The watch uses the same scheme.
- Package `com.ironlog.app`, versionName `2.0.0`, versionCode `2`.
- CI makes a release APK only if the `ANDROID_KEYSTORE_*` secrets are set. As of 2026-10-25 they weren't, so CI made debug APKs. A debug APK can't install over the release one (different key). INFERRED that nothing has changed since.

**Ship-blockers from the Oct 16 audit:**

| Item | Status |
|---|---|
| **Offline mode**: can you log a workout with no signal today? | **Yes in code.** Each change goes to the phone's IndexedDB copy first (`workout-store.ts`), then to an outbox (`queue.ts`). The outbox retries when the connection returns, when the app comes back on screen, and every 20 s. A "saved offline" banner shows (`sync-banner.tsx`). Starting a workout offline works. Exercise list and programs come from a local cache (`offline/cache.ts`). CONFIRMED in code. **Real airplane-mode run on the phone: NEEDS-DEVICE-TEST.** Risks: section 2 items 1-2. |
| **Onboarding** | `/welcome` appears when `users.onboarded_at` is null (`app-shell.tsx:35`). Sadiq's real profile is already onboarded (CONFIRMED in the database), so he won't see it again. A 4-card tour also exists (`tour.tsx`). CONFIRMED in code. The phone run is NEEDS-DEVICE-TEST. |
| **RLS / Edge Function auth** | RLS is on for all 17 public tables, and every policy is scoped to `auth.uid()` for the `authenticated` role (live, see section 5). CONFIRMED. Edge Functions: `generate-plan`, `suggest-adjustments`, `import-workout` and `weekly-recap` have `verify_jwt` on (CONFIRMED live). `watch-pair`, `gym-calendar` and `claude-connector` have `verify_jwt` off by design: they check a hashed pairing code, a signed OAuth `state`, and a hashed `il_` bearer token instead (CONFIRMED in code). The anon key is baked into the APK, which is fine with these policies. |

---

## 5. Data: Supabase

- **Project ref:** `pyjvdnxewikaoafsoehq` (`https://pyjvdnxewikaoafsoehq.supabase.co`). One auth user (Sadiq).
- **Migrations:** all 22 files in `supabase/migrations/` are applied live, newest `20261026010000_deload_weeks`. CONFIRMED

**Tables (row counts 2026-11-01, CONFIRMED). RLS is ON for every table.**

| Table | Holds | Rows | Who can read / write (authenticated only, anon locked out) |
|---|---|---|---|
| `users` | profile, units, gym, kits, shifts, onboarding | 1 | read and update own row (created by an auth trigger) |
| `exercises` | library (`created_by` null) and custom exercises | 798 | read library and own; insert, update and delete own |
| `routines` | workouts inside programs or standalone | 136 | all own (program must be own) |
| `routine_exercises` | targets: sets, reps, rest, tempo, superset group | 856 | all, through an own routine |
| `programs` | multi-week programs, one active | 5 | all own |
| `workout_sessions` | each workout; `end_time` null = open (unique: one open per user) | 875 | all own (routine must be own) |
| `workout_sets` | each set: kg, reps, type, RPE, notes, sides | 24,959 | all own, and the session must be own |
| `heart_rate_samples` | watch heart rate per session | 1,321 | all own, session must be own |
| `routine_adjustments` | "next time" suggestions | 1 | all own |
| `exercise_prefs` | per-exercise note, rest, one-side flag | 0 | all own |
| `body_measurements` | weight and measurements | 1 | all own |
| `ai_usage` | daily AI call counter | 12 | read own (written by functions) |
| `weekly_recaps` | AI weekly recap | 2 | read own |
| `watch_pairings`, `watch_pair_attempts` | watch link codes (hashed) | 1 / 5 | no client policies (service role only) |
| `calendar_connections` | Google Calendar tokens | 1 | no client policies (service role only) |
| `claude_links` | Claude connector tokens (hashed) | 1 | read and delete own |

The progress-photos storage bucket is private and has 0 objects.

**His workout history:**
- 875 sessions and about 25,000 sets, from 2015-11-20 to 2026-10-28. CONFIRMED
- 872 came from his JEFIT export (`import_key` set, PR #30/#31). The other 3 are a Claude-chat log and the two phone workouts above.
- No workouts on the server come from 2026-10-23 to 2026-10-25, when the phone used the mock backend. Whether the phone had any to upload (the one-time "Upload" banner, Phase 3) is UNKNOWN. Sadiq was asked and never answered. NEEDS-DEVICE-TEST
- **Backup:** in-app `.xlsx` "Back up everything" (More → Import & backup, `src/lib/backup.ts`) and CSV export exist in code. No backup file is known to exist: Sadiq was asked to make one on 2026-10-25 and never confirmed. Whether Supabase keeps automatic backups depends on the plan. UNKNOWN

**Edge Functions (all ACTIVE, CONFIRMED):**

| Function | Does |
|---|---|
| `generate-plan` | AI program builder (Claude, or Gemini if chosen), limited to 5 plans per day |
| `suggest-adjustments` | after a routine workout: next-time weight/rep changes and deload rules, with server-side clamps |
| `import-workout` | photo or text into a finished workout ("Log with AI") |
| `weekly-recap` | Sunday AI recap |
| `watch-pair` | 6-digit watch link: magic-link `token_hash`, then `verifyOtp` on the watch |
| `gym-calendar` | Google OAuth and calendar events for gym workouts over 30 min |
| `claude-connector` | MCP connector so Claude chat can log workouts |

**Auth flow:**
- Email and password, or Google (PKCE, deep link back into the app, `google-sign-in.ts`).
- The session is stored in WebView localStorage (`persistSession`, auto refresh).
- Forgot password uses the standard reset email, which links to `com.ironlog.app://reset-password` (the redirect URL is added by the deploy workflow).
- The watch gets its own session through `watch-pair`.
- Sign-out clears the outbox (`discardPending`).

**Secret / env names (values never in the repo):**
- App build: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- GitHub Actions: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; variable `FEATURE_WATCH`
- Edge Functions: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (the workflow doesn't set this one; whether it's set in Supabase is UNKNOWN)
- PC signing: `IRONLOG_KEYSTORE`, `IRONLOG_KEYSTORE_PASSWORD`, `IRONLOG_KEY_ALIAS`, `IRONLOG_KEY_PASSWORD`
- Watch: `watch/config.json` (git-ignored) with `supabaseUrl` and `supabasePublishableKey`

**Standing rule for future agents: no schema change may orphan or rewrite existing workout history.** No dropping or renaming of `workout_sessions` or `workout_sets` columns, no changing the kg storage unit, and no new non-null columns without defaults. Back up first.

---

## 6. Architecture map

| File | Role |
|---|---|
| `src/lib/offline/workout-store.ts` | **Session lifecycle.** `startPlannedSession` (one-open guard) → `getActiveSession` / `peekActiveWorkout` (12-hour open window, `isOpen`) → `finishSession` (clears the phone copy, queues `finish`) / `discardSession`; the stale-workout prompt helpers. The bug lives here and in the next two files. |
| `src/lib/offline/queue.ts` | Outbox: ordered ops in IndexedDB, upsert-by-id inserts, retries, **drops ops the server refuses** |
| `src/hooks/use-workout.ts` | Logger state: loads the active workout, logs and edits sets, rest, `finish()` (summary, calendar, Health Connect, Bujo sync), stale actions |
| `src/components/workout/workout-screen.tsx` | Logger UI: Finish button, stale-workout prompt, finish summary, Flow State |
| `src/hooks/use-active-workout.ts`, `src/components/active-workout-bar.tsx` | The "workout in progress" bar on every screen |
| `src/lib/supabase/client.ts` | Supabase client; **with no env settings, every call goes to `mock-backend.ts`** |
| `src/components/providers/auth-provider.tsx` | Session and profile, sign-out |
| `src/lib/workout-api.ts` | Reads: exercises, routines, last performance, history |
| `src/lib/set-logic.ts` | Suggested weight, overload, missed reps, warm-up weights |
| `src/lib/workout-logic.ts` | Live volume, e1RM per set, supersets and circuits, chart points |
| `src/lib/one-rm.ts`, `src/lib/stats.ts`, `src/lib/insights.ts` | 1RM math, records and summaries, plateaus and streaks |
| `src/lib/recovery.ts` | Per-muscle recovery model |
| `src/services/ironlogEcosystemSync.ts`, `android/.../IronLogContentProvider` | Bujo Tasks bridge (finished workouts out, `today_plan`) |
| `src/services/wearableBridge.ts`, `watch/src/api.ts` | Phone↔watch; the watch's own server calls and offline queue |
| `supabase/migrations/20261013000000_initial_schema.sql` | Core schema, volume trigger, one-open-workout index |

---

## 7. Known bugs and half-finished work (beyond section 2)

- **Open workout on the server from 2026-10-28** with 0 ticked sets (section 2). It needs Sadiq's decision.
- **Lint has 7 errors** (section 4). `simulation-sheet.tsx` sets state inside an effect, which can cause re-render loops.
- **Volume numbers disagree:**
  - The Bujo/ecosystem `totalVolumeLb` counts warm-up sets, but session volume excludes them (`use-workout.ts` `finish()`). CONFIRMED in code.
  - For one-side sets, the live header adds both sides (`liveVolume` uses reps + repsLeft), but the saved session volume is weight × `reps` (`finishSession`), and the database stores `reps` as the weaker side. So the header and the saved total differ. INFERRED from code.
  - `dailyStrain` sent to Bujo is just sets × 3.5. CONFIRMED
- **Watch offline plan is fake.** `watch/src/api.ts` `DEFAULT_OFFLINE_PLAN` has made-up exercise ids (`e1000000-…`) and fixed weights (100 kg squat). A workout started from it can't sync, because the exercise ids don't exist. INFERRED
- **Watch set → phone, and watch Tile and Complication:** never verified on the watch. NEEDS-DEVICE-TEST
- **Partner sync** broadcasts live sets to anyone who joins the same 6-character room code. Untested.
- **The readiness card** uses numbers typed by hand, not Health Connect sleep.
- **Dead code:** 11 lib modules and 1 component (section 3b).
- **Form demo images** load from GitHub raw URLs, so they don't show without internet.
- **Docs that disagree with the code:**
  - `NOTES.local-backup.md` (committed 2026-10-29) lists "Verified on my phone" items written by an agent, not Sadiq. It also says 227/227 tests and lists Health Connect as "Next" though it's merged.
  - `docs/archive/` has older agent docs that claim "device-verified" and "release-ready".
  - Treat all of these as unverified.
- **Fold8 folded and unfolded:** two-column Home (Phase 19), Progress summary (20) and the logger dock (11) were checked only in a headless browser at 412 and 884 px. The Oct 28-29 visuals (readiness card, session stack, Flow State, trophy case and the rest) were never looked at on either screen. NEEDS-DEVICE-TEST
- **Security items deferred on purpose (Oct 16 triage):** debuggable builds, encrypted token storage (tokens sit in WebView localStorage), App Links instead of custom schemes, certificate pinning.
- **Version is stuck at 2.0.0 / versionCode 2**, so builds can't be told apart.

---

## 8. Decisions already made

- Personal use only: one user, Fold8 and Galaxy Watch, sideloaded. Not for the Play Store.
- **Fix before features:** the finish-workout fix lands and is verified on the phone before any feature work. The Oct 28-29 commits went against this order. Don't repeat that.
- **The approved feature set is the ceiling, not a floor.** Nothing beyond the 21 (plus the already-approved items in 3a) without Sadiq's say-so. The 3b items stay where they are until he rules on them.
- Cloud-backed (Supabase), with offline logging kept (Sadiq, 2026-10-25). The mock backend is only for local tests without env settings.
- Weights are stored in kg, with imperial as Sadiq's display unit.
- Theme is "Cosmic Ruby" (ruby/gold). Number style "Option A (Clean)".
- Sideloaded builds come from Sadiq's PC with the Bujo release key, installed with `adb install -r`, never uninstalling first.
- Sadiq approves review items one at a time. On 2026-10-25 he gave blanket permission for threads to merge, deploy and rebuild without asking. Phone tests and sign-ins still wait for him.
- One PR per feature, merged one at a time.

---

## 9. Pending decisions (waiting on Sadiq)

1. Did the finish-workout bug happen again on the current build, and did he tap Finish on the 2026-10-28 "Day 2 - Heavy Bench" workout? Should it be finished, kept or deleted?
2. Keep, hide or remove the Oct 28-29 scope additions (3b)? This includes the dead code and the partner sync.
3. The 2026-10-27 idea list (F1-F10, U1-U10) has no recorded picks.
4. Did the one-time "Upload" of the Oct 23-25 phone workouts ever run, and what did it say?
5. Bump the version on every build (yes/no)?
6. Add the `ANDROID_KEYSTORE_*` secrets to GitHub so CI can make installable release APKs?
7. Deferred security items (section 7): leave deferred?

**2026-10-16 on-device checklist (section E):**

| Check | Status |
|---|---|
| Sign in → force-close → reopen: session persists | NEEDS-DEVICE-TEST |
| Logout invalidates on device and server | NEEDS-DEVICE-TEST |
| Log a workout end to end | NEEDS-DEVICE-TEST (the server has one finished phone workout from 2026-10-25 23:21 UTC, but Sadiq never said whether it behaved) |
| Voice logging, photo import, AI plan, suggested adjustments, Google Calendar connect | NEEDS-DEVICE-TEST |
| Permission prompts show an in-app rationale first | NEEDS-DEVICE-TEST |
| No tokens or PII in logcat; nothing sensitive in the Recents screenshot | NEEDS-DEVICE-TEST |
| "Forgot password" works at runtime | NEEDS-DEVICE-TEST (asked 3 times on 2026-10-25/26, no answer) |
| `/link-watch` hidden until the watch ships | Superseded: the watch shipped. **Sadiq confirmed the watch links to the phone ("it works", 2026-10-25 23:22 UTC).** That's the only item on this list he has verified. |

Sadiq also reported, before the current build: the phone app installed and signed in (2026-10-13), and a Claude-chat-logged workout arrived (2026-10-15). Those were older builds.

---

## 10. Gotchas

- **A build without real Supabase settings silently ships the mock backend.** `isLocalBackend()` in `client.ts` sends everything to `mock-backend.ts`: any password signs in, and data stays on the phone. The placeholder URL `ironlog.supabase.co` gives "Failed to fetch". Both happened on 2026-10-23 and 2026-10-25. Check `.env.production.local` before every release build.
- **`watch/config.json` is git-ignored.** With wrong values, the watch used to make up a pairing code; since PR #42 it shows the real error. If pairing breaks, check `watch-pair` in the Edge Function logs.
- **Debug and release keys differ.** A CI debug APK won't install over the phone's release app. Uninstalling to "fix" that wipes local, unsynced workouts.
- **Migrations:** `supabase db push` refuses a migration dated earlier than the newest one already applied. Name new ones after `20261026010000`. Deploy with the "Deploy database and functions" GitHub workflow.
- **`SUPABASE_ACCESS_TOKEN` must be a personal `sbp_` token.** Never paste tokens in chat (one was exposed and rotated on 2026-10-25).
- **Hosted Supabase won't let you edit email templates without custom SMTP.** Don't suggest it.
- **Gradle:** Health Connect forced AGP 8.13 and compileSdk 36. AGP 8.x breaks on Gradle 9.6+, so the wrapper is pinned to Gradle 8.14.3.
- **Cloud containers can't build APKs** (`dl.google.com` blocked). Build on SALegion (`C:\Users\sadiq\Projects\ironlog`) or in CI.
- **Next.js 16 differs from older versions** (see `AGENTS.md`). `npm run typecheck` runs `next typegen` first, so plain `tsc` fails on a fresh clone.
- **Parallel PRs touching README and settings conflict.** Merge one, then rebase the others.
- **The database allows one open workout per user** (`workout_sessions_one_active_per_user`). The mock doesn't enforce it, so tests against the mock miss bugs that need it.
- **The outbox deletes refused changes.** A server-side constraint or RLS failure looks like "it saved" on the phone (section 2).

---

## 11. Next step

**The single first task: prove (or fix) the finish-workout lifecycle on Sadiq's phone.**
1. Ask Sadiq about the 2026-10-28 open workout, and whether workouts still reopen after Finish.
2. Reproduce against the real Supabase (not the mock). Cover section 2 paths 1 and 2: a refused `finish` op, and starting offline while another workout is open.
3. If it's broken, fix it in `workout-store.ts` / `queue.ts` / `use-workout.ts`, with a test that runs against a real local Supabase.
4. Bump the versionCode, build a release on SALegion, and `adb install -r`.

**"Done" looks like:** on the Fold8, with the current build, Sadiq starts a workout, logs a set, taps Finish, force-closes and reopens the app, and the workout does not come back. The same works once with signal off, and again after signal returns. The server shows that session with `end_time` set and no open session left over. Sadiq says so in chat, and only then is it moved to "Verified on my phone" in `NOTES.md`.

---

## For the receiving side

> First moves, before changing anything: read this file, read NOTES.md, read the last ~20 git commits, then verify the finish-workout flow in code against section 2. The fix-before-features order is standing: no feature briefs until the session lifecycle is proven on Sadiq's phone. Where this document and the code disagree, trust the code and note the drift in NOTES.md.
