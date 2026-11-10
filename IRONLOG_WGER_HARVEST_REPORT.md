# IronLog — wger Harvest Report

**Study Run Date:** 2026-11-09  
**Harvest Target:** [wger Workout Manager](https://github.com/wger-project/wger) (Python/Django, AGPL-3.0)  
**Donor Location:** `C:\Users\sadiq\Projects\_donors\wger`  
**Donor HEAD Commit:** `c6ee8a740137c498ee7221e6cd3d8ad84b4a9304` (Sun Nov 8 21:51:26 2026 +0100)  
**IronLog Repo Status:** Branch `main`, clean working tree (`backups/` untracked), HEAD commit `fff8928903aabf5d7bc5a12a91b29fbbb83db624` (Sat Nov 7 23:34:12 2026 -0500)  
**IronLog Repo Commit Count / Version:** 169 commits (`git rev-list --count HEAD`)  
- Phone (Web / Capacitor): `versionName "2.1.169"`, `versionCode 169`, Settings string `"2.1.169 (fff8928)"`  
- Watch (Wear OS): `versionName "1.1.169"`, `versionCode 169`  

---

## Step 0.5 — Verification of Outstanding Upgrades (Nov 8, 2026 Fix Series)

The table below verifies the outstanding upgrade items from the Nov 8, 2026 fix series (#44–#50) against the current state of this repository.

| PR / Issue | Upgrade Description | Status | Evidence / In-Repo Verification |
|---|---|---|---|
| **#44** | Finished workouts stop coming back (finish-workout lifecycle fix) | **NEEDS-DEVICE-TEST** (Code verified: **RESOLVED-IN-CODE**) | Commit `f412dacd7e823c3a32fd84656b00bd966e79a8cf`. Fixed stale `hasPending()` in `src/lib/offline/queue.ts:16-17` and `queue.ts:98-103`; prevented dropping refused changes (`queue.ts:182-198`); added pause banner with Retry/Discard in `src/components/sync-banner.tsx:44-78`; verified server row closure in `src/lib/offline/workout-store.ts:251-260`; added real-DB finish tests in `tests/real-db/finish.test.ts`. Per assignment hard rules, end-to-end device behavior requires physical phone verification on the Galaxy Z Fold8. |
| **#45** | 7 lint errors fixed; lint and tests run in CI | **RESOLVED** | Commit `fdbbb516d52bb0481d49ff36f163289af8c6f7d9`. Stabilized What-If simulation re-render loop in `src/components/workout/simulation-sheet.tsx:75-92`; escaped apostrophes in `src/components/home/readiness-card.tsx:32`, `src/components/workout/form-coach-sheet.tsx:84`, and `partner-sync-sheet.tsx:78`; added `npm run lint` and `npm test` pre-build steps to `.github/workflows/android.yml:29-30`. |
| **#46** | Every build gets its own version number, shown in Settings | **RESOLVED** | Commit `f5b758e4c47e68fc959642f662b062bb1d93d5ea`. Dynamic git commit count configured in `android/app/build.gradle:7-25` (`versionCode gitCommitCount`, `versionName "2.1.${gitCommitCount}"`) and `watch/android/app/build.gradle:78-99` (`versionName "1.1.${gitCommitCount}"`); injected into `next.config.ts:5-18` as `NEXT_PUBLIC_APP_VERSION`; displayed in `src/components/settings-screen.tsx:268`; full checkout history enabled in `.github/workflows/android.yml:26` and `.github/workflows/watch.yml:24`. |
| **#47** | Partner sync removed, along with 11 unused files added Oct 28–29 | **RESOLVED** | Commit `f938cbbfaf5b806d5a0636514eeb61cd37f4442f`. Removed partner sync UI, service, and duel logic (`src/components/workout/partner-sync-sheet.tsx`, `src/services/partnerSync.ts`, `src/lib/partner-duel.ts`); removed 11 unapproved/dead modules (`audio-coach.ts`, `doms-heatmap.ts`, `drop-sets.ts`, `equipment-routing.ts`, `equipment-scanner.ts`, `fatigue-prediction.ts`, `velocity.ts`, `volume-landmarks.ts`, `watch-tile-payload.ts`, `morphing-workout-header.tsx`, and unused tests), deleting 2,266 unused lines across 18 files. |
| **#48** | Watch: no fabricated offline plan; refused changes are kept | **RESOLVED** | Commit `7940bcac38f66a16fa9ec4f237dbe7e6e3126c77`. Removed hardcoded synthetic plan (100 kg squat with nonexistent exercise UUIDs) in `watch/src/api.ts:57-96`; displays clear no-signal status in `watch/src/screens/HomeScreen.tsx:127-133`; stores up to 100 refused changes in offline quarantine in `watch/src/queue.ts:18-28`; deleted obsolete `watch/tests/tile.test.ts`. |
| **#49** | Volume numbers consistent everywhere: one rule for header, saved workout, and Bujo | **RESOLVED** | Commit `a1a3e42dbd7a43de4da01616a529a431c4cd4995`. Consolidated volume calculation into centralized `setVolume()` in `src/lib/workout-logic.ts:8-23` (uses min reps across unilateral limbs, excludes warm-ups); wired into active header in `src/hooks/use-workout.ts:258-270`; aligns Bujo broadcast payload with DB trigger volume; unit tests added in `tests/logic.test.ts:47-66`. |
| **#50** | Two trigger functions locked out of the API | **RESOLVED** | Commit `fff8928903aabf5d7bc5a12a91b29fbbb83db624`. Added migration `supabase/migrations/20261108000000_lock_trigger_functions.sql:1-11`, revoking `EXECUTE` on functions `public.handle_new_auth_user()` and `public.refresh_session_volume()` from roles `anon`, `authenticated`, and `public`, preventing unauthorized direct REST execution via `/rest/v1/rpc`. Documented in `NOTES.md:14-18`. |

*Note on repository visibility: The repository's public/private visibility setting is an OWNER action in GitHub settings and cannot be queried or altered from inside the repository.*

---

## Step 0 — IronLog Baseline Inventory

Before evaluating wger, IronLog's existing implementation was surveyed:

- **Exercise Data:**
  - Table `public.exercises` in `supabase/migrations/20261013000000_initial_schema.sql` and `20261014010000_exercise_library.sql`.
  - Schema: `id` (UUID), `name`, `slug`, `primary_muscle` (enum `muscle_group`), `secondary_muscles` (array), `equipment` (enum `equipment_type`), `mechanic` (enum `exercise_mechanic`), `aliases` (text array), `image_urls` (text array), `instructions` (text), `created_by` (UUID, null = built-in).
  - Exercise preferences: table `public.exercise_prefs` (`goal_weight_kg`, `favorite`, `notes`).
  - Dataset: 642 built-in exercises sourced from `free-exercise-db` (Unlicense / Public Domain), including 2-frame static illustration URLs.
- **Workout and Program Logic:**
  - Plan definitions: `public.routines` and `public.routine_exercises` in `20261013000000_initial_schema.sql`.
  - Multi-week programs: `public.programs` and `public.program_weeks` in `20261014000000_programs.sql`.
  - Exercise prescriptions: `target_sets`, `target_reps`, `target_reps_max`, `target_weight_kg`, `target_rpe`, `warmup_sets`, `rest_seconds`, `superset_group`.
  - Advanced prescriptions: AMRAP and tempo (`tempo_eccentric`, `tempo_pause`, `tempo_concentric`) in `20261026000000_amrap_tempo.sql`.
  - Periodization & Overload: `src/lib/periodization.ts` (deload weeks, volume reduction, RPE reduction) and `src/lib/set-logic.ts` (`suggestWeight`).
- **History & Logging Model:**
  - Sessions: `public.workout_sessions` (`id`, `user_id`, `routine_id`, `name`, `start_time`, `end_time`, `volume`, `source`, `avg_hr`, `max_hr`, `notes`).
  - Sets: `public.workout_sets` (`id`, `session_id`, `user_id`, `exercise_id`, `exercise_order`, `set_number`, `set_type`, `weight`, `reps`, `rpe`, `superset_group`, `parent_set_id`, `is_completed`, `completed_at`, `estimated_1rm`, `notes`, `client_id`).
  - Metrics: Epley 1RM formula stored on each completed set (`estimated_1rm = weight * (1 + reps / 30.0)` in SQL generated column and `src/lib/one-rm.ts`).
- **Weight and Nutrition:**
  - Weight & Body tracking: `public.body_measurements` in `supabase/migrations/20261014030000_body_tracking.sql` (`measured_on`, `weight_kg`, `body_fat_pct`, `waist_cm`, and private progress photos in `storage.buckets`).
  - Nutrition: **None**. IronLog has no nutrition, calorie, macro, or meal tracking (intentionally excluded per scope boundary in `NOTES.md`).

---

## Harvest Item 1: Exercise Database

### What it is
wger's exercise library is a relational, multilingual catalog structured around an `Exercise` base model (`wger/exercises/models/base.py`), with separate models for translations (`ExerciseTranslation` in `translation.py`), muscles (`Muscle` in `muscle.py`), equipment (`Equipment` in `equipment.py`), categories (`ExerciseCategory` in `category.py`), aliases (`ExerciseAlias` in `exercise_alias.py`), images (`ExerciseImage` in `image.py`), and videos (`ExerciseVideo` in `video.py`).

### Donor Evidence (Paths)
- Base model: `wger/exercises/models/base.py:73-125`
- Translations model: `wger/exercises/models/translation.py:32-75`
- Images & styles: `wger/exercises/models/image.py:46-85` (supports styles: Line Art, 3D, Low-Poly, Photo)
- Videos & validation: `wger/exercises/models/video.py:46-75`
- Variation groups: `wger/exercises/models/base.py:112-117` (`variation_group = models.UUIDField(...)`)
- Fixture data:
  - `wger/exercises/fixtures/exercise-base-data.json` (872 base records)
  - `wger/exercises/fixtures/translations.json` (2,429 translation records across 10 languages: 872 English, 270 Spanish, 214 German, 140 Italian, 70 French, 68 Portuguese, etc.)
  - `wger/exercises/fixtures/categories.json` (7 categories: Arms, Legs, Abs, Chest, Back, Shoulders, Calves)
  - `wger/exercises/fixtures/equipment.json` (10 equipment types: Barbell, Dumbbell, Gym mat, Swiss Ball, Pull-up bar, Bench, Incline bench, Kettlebell, None/Bodyweight, Cable)
  - `wger/exercises/fixtures/muscles.json` (15 primary and secondary muscles)
- Versioning / history: `wger/exercises/models/base.py:124` (`history = HistoricalRecords()`), UUIDv4 primary identifiers, and `last_update` timestamps.

### What to take
- **Take:** The architectural pattern of `variation_group` (grouping exercise variations together with a shared UUID to structure substitutions and progressions).
- **Do NOT take:** The bulk exercise data fixture files or image assets.

### Adaptation into IronLog
IronLog already possesses 642 exercises in `public.exercises` with 2-frame form images and instructions. If desired in a future schema migration, IronLog could add an optional `variation_group uuid` column to `public.exercises` to link mechanical variants (e.g., standard bench press, close-grip bench press, paused bench press) rather than relying exclusively on muscle tag heuristics in `src/lib/substitution-engine.ts`.

### License Note
- **Code License:** AGPL-3.0-or-later (`LICENSE.txt:1-15`, `README.md:99`).
- **Data License:** Creative Commons, per individual record as declared in `README.md:100` ("*Exercise/Ingredient Data: Creative Commons (see individual entries)*"). Every exercise base, translation, and media item implements `AbstractLicenseModel` (`wger/utils/models.py:46-65`). In the repo fixtures:
  - Exercise bases: 719 records are **CC-BY-SA 4.0** (pk 2), 133 are **CC-BY-SA 3.0** (pk 1), 20 are **CC0** (pk 3).
  - Translations: 1,606 records are **CC-BY-SA 4.0**, 344 are **CC-BY-SA 3.0**, 85 are **CC0**, 394 are null/unspecified.
  - Importing wger's exercise data would require compliance with CC-BY-SA (TASL attribution: Title, Author, Source, License) and ShareAlike copyleft for any derivative dataset. IronLog's existing exercise data is public domain (Unlicense).

### UI Impact
**NONE.** Any adaptation is strictly a database schema field or substitution logic refinement.

### Verdict
**SKIP** (bulk data import) / **TAKE** (variation_group structural pattern only).  
*Reason:* IronLog already has a comprehensive 642-exercise library in the public domain (Unlicense); importing wger's data would introduce CC-BY-SA ShareAlike and attribution burdens without functional necessity.

---

## Harvest Item 2: Workout and Program Logic

### What it is
wger models workout routines as multi-level hierarchies:
1. `Routine` (`wger/manager/models/routine.py`): Top-level program container with start/end dates, template flags (`is_template`, `is_public`), and weekly fit rules.
2. `Day` (`wger/manager/models/day.py`): Training day within a routine. Supports `DayType` (custom, EMOM, AMRAP, HIIT, Tabata, EDT, RFT, AFAP), rest days (`is_rest = True`), progression gating (`need_logs_to_advance = True`), and JSON configurations.
3. `Slot` (`wger/manager/models/slot.py`): Groups exercises in a day. A slot with more than one exercise entry is automatically treated and executed as a superset (`is_superset = len(entries) > 1`). Provides `set_data_gym()` to interleave sets across exercises during a live session.
4. `SlotEntry` (`wger/manager/models/slot_entry.py`): Connects an exercise to a slot. Defines exercise type (`normal`, `warmup`, `dropset`, `myo`, `partial`, `forced`, `tut`, `iso`, `jump`), target sets, reps, weight, RiR (Reps in Reserve), rest time, and units.
5. Mathematical Progression Engine (`wger/manager/models/abstract_config.py`, `slot_entry.py:160-209`): Implements `AbstractChangeConfig` across 5 parameters: `WeightConfig`, `RepetitionsConfig`, `SetsConfig`, `RestConfig`, and `RirConfig`. Each configuration specifies an `iteration` (cycle step), `value`, `operation` (`+`, `-`, or replace `r`), and `step` (`abs` for absolute values or `percent` for percentages). The `_WalkState` machine walks across iterations to dynamically evaluate prescribed weight/reps/rest/RiR, supporting linear progression, percentage deloads, and double progression.

### Donor Evidence (Paths)
- Routine model: `wger/manager/models/routine.py:64-160`
- Day model & DayType: `wger/manager/models/day.py:24-99`
- Slot & superset interleaving: `wger/manager/models/slot.py:12-100` (`set_data_gym`)
- Slot entry & exercise types: `wger/manager/models/slot_entry.py:58-76` (`ExerciseType`), lines 81-109 (`PROGRESSION_FIELDS`)
- Progression configuration & operators: `wger/manager/models/abstract_config.py:48-100` (`OperationChoices`, `StepChoices`, `AbstractChangeConfig`)
- Iteration walking engine: `wger/manager/models/slot_entry.py:160-209` (`_WalkState`, `advance`, `apply`)
- Typed change models: `wger/manager/models/weight_config.py:21-34`, `repetitions_config.py:21-34`, `sets_config.py:21-34`, `rest_config.py:21-34`, `rir_config.py:21-34`

### What to take
- **Take:** The mathematical representation of progression and deload rules as declarative step operations: `(iteration, value, operation: '+', '-', 'replace', step: 'absolute', 'percent')`.
- **Do NOT take:** wger's complex 6-table normalized Django ORM relational layout for configurations.

### Adaptation into IronLog
IronLog already has multi-week programs (`public.programs`, `public.program_weeks` in `20261014000000_programs.sql`), supersets/circuits (`superset_group` in `public.routine_exercises`), AMRAP/tempo (`20261026000000_amrap_tempo.sql`), and deload calculations (`src/lib/periodization.ts`).  
The clean adaptation for IronLog's program generator / AI planner is to express program progressions using a lightweight JSON schema attribute on routine items or program weeks (e.g., `progression: { type: "linear", delta_kg: 2.5 }` or `deload: { type: "percent", delta_pct: -10 }`), directly matching the math of wger's `AbstractChangeConfig` without requiring extra database tables.

### License Note
- **Code License:** AGPL-3.0-or-later (`LICENSE.txt`).
- **Data License:** Not applicable (logic / algorithmic structure). Mathematical progression formulas and state machine concepts are ideas and algorithms, not subject to copyright copyleft under 17 U.S.C. § 102(b), provided they are independently authored in TypeScript.

### UI Impact
**NONE.** Algorithmic and logic representation only.

### Verdict
**TAKE** (declarative progression math) / **ALREADY PRESENT** (program structure, multi-week programs, deload weeks, supersets, and AMRAPs).  
*Reason:* IronLog already has program structures and deload weeks; taking wger's clean operation-based math (`+`/`-`/`replace`, `abs`/`percent`) improves programmatic progression modeling without changing any UI.

---

## Harvest Item 3: Logging Model

### What it is
wger's workout recording architecture splits session metadata from individual set logs:
1. `WorkoutSession` (`wger/manager/models/session.py`): Tracks the execution session with `id` (UUIDv7), `user`, `routine`, `day`, `datetime_start`, `datetime_end`, `notes`, and a categorical session `impression` (`1: Bad`, `2: Neutral`, `3: Good`). Calculates `local_day` based on the user's timezone to correctly handle workouts that cross midnight.
2. `WorkoutLog` (`wger/manager/models/log.py`): Records an individual set. Features include:
   - UUIDv7 primary keys for natural temporal sorting.
   - Dual tracking of **prescribed targets vs. actual performed values**: `repetitions` vs `repetitions_target`, `weight` vs `weight_target`, `rir` vs `rir_target`, and `rest` vs `rest_target`.
   - `next_log`: Self-referential foreign key linking drop-set sequences.
   - `iteration`: The cycle iteration of the routine being executed.
3. Statistics & 1RM Engine (`wger/manager/one_rep_max.py`):
   - Computes 1RM estimates using the Brzycki formula: $\text{1RM} = \text{weight} \times 36 / (37 - \text{reps})$.
   - **RiR-adjusted 1RM calculation** (`estimate_from_log`): Adds Reps in Reserve (`log.rir`) to actual logged reps before calculating 1RM: `brzycki(weight, reps + (log.rir or 0))`. If an athlete performs 100 kg for 8 reps with 2 RiR (RPE 8), the formula estimates 1RM based on their true physical limit of 10 reps.
   - Intensity calculation (`brzycki_intensity`): Computes relative intensity as $\text{weight} / \text{1RM}$.

### Donor Evidence (Paths)
- WorkoutSession: `wger/manager/models/session.py:32-155`
- WorkoutLog: `wger/manager/models/log.py:48-260`
- Target vs actual columns: `wger/manager/models/log.py:145-155` (`repetitions_target`), lines 179-190 (`weight_target`), lines 203-212 (`rir_target`), lines 222-228 (`rest_target`)
- Drop-set self-reference: `wger/manager/models/log.py:73-83` (`next_log`)
- Timezone-safe date normalization: `wger/manager/models/session.py:132-154` (`local_day_in`)
- One-Rep Max and RiR integration: `wger/manager/one_rep_max.py:33-84` (`brzycki`, `brzycki_intensity`, `estimate_from_log`)

### What to take
1. **RiR/RPE Integration into Estimated 1RM:** Adjusting the 1RM estimation to include unused capacity when RPE is logged.
2. **Snapshotting Target Values on Completed Sets:** Recording target reps and weight on the set record itself rather than relying on dynamic joins back to routines that may be modified later.

### Adaptation into IronLog
1. **1RM Calculation:** In `src/lib/one-rm.ts`, IronLog currently implements standard Epley: `weight * (1 + reps / 30)`. IronLog already logs RPE on sets (`workout_sets.rpe`, `src/components/workout/effort-picker.tsx`). When `rpe` is present and $\le 10$, $\text{effective reps} = \text{reps} + (10 - \text{rpe})$. Adapting this math into `src/lib/one-rm.ts` gives:
   $$\text{epleyWithRpe}(w, r, \text{rpe}) = w \times \left(1 + \frac{r + \max(0, 10 - \text{rpe})}{30}\right)$$
   This improves the accuracy of IronLog's PR tracking and charts without modifying any UI components.
2. **Target Snapshotting:** IronLog's `workout_sets` table already stores `reps`, `weight`, and `rpe`. In `src/lib/offline/workout-store.ts`, when prefilling planned sets from a routine, the prescribed targets can be retained as set attributes for adherence analytics.

### License Note
- **Code License:** AGPL-3.0-or-later (`LICENSE.txt`).
- **Data License:** Not applicable. Mathematical formulas (Brzycki, Epley) and data structure concepts are public domain / clean-room reimplementations.

### UI Impact
**NONE.** Calculations occur internally in utility functions (`one-rm.ts`) and background database storage.

### Verdict
**TAKE** (RiR-adjusted 1RM calculation and target snapshotting) / **ALREADY PRESENT** (workout sessions, sets, volume tracking, Epley 1RM, drop-set parent references, and offline queueing).  
*Reason:* Adapting RiR into 1RM estimates refines IronLog's existing analytics cleanly with zero UI impact.

---

## Harvest Item 4: Weight and Nutrition Model

### What it is
wger provides a comprehensive nutrition tracking subsystem in `wger/nutrition`:
- `Ingredient` (`wger/nutrition/models/ingredient.py`): Sourced from Open Food Facts (`README.md:17-18`), tracking energy (kJ and kcal), protein, carbohydrates, carbohydrates of which sugars, fat, fat of which saturated, dietary fiber, and sodium.
- `Meal` & `MealItem` (`wger/nutrition/models/meal.py`, `meal_item.py`): Composes ingredients into specific meals.
- `NutritionPlan` (`wger/nutrition/models/plan.py`): Defines daily macronutrient and caloric targets.
- Body measurements in `wger/measurements` (`category.py`, `measurement.py`): Generalized measurement framework supporting arbitrary body sites (biceps, chest, thigh, neck, calves).

### Donor Evidence (Paths)
- Nutrition models: `wger/nutrition/models/ingredient.py:32-150`, `meal.py:20-60`, `plan.py:30-80`
- Open Food Facts attribution: `wger/README.md:17-18`
- Measurement models: `wger/measurements/models/category.py:30-120`, `measurement.py:25-80`

### What to take
**Nothing.**

### Adaptation into IronLog
None. IronLog deliberately bounds its scope to strength training, workout tracking, body weight, body fat %, waist circumference, and progress photos (`src/lib/body.ts`, `supabase/migrations/20261014030000_body_tracking.sql`). Per `NOTES.md:6` ("*The 21 approved features are the ceiling. Nothing new without Sadiq's say-so*"), nutrition tracking is not an approved feature and fills no existing gap in IronLog.

### License Note
- **Code License:** AGPL-3.0-or-later.
- **Data License:** Open Food Facts data is licensed under the Open Database License (ODbL).

### UI Impact
**NONE.**

### Verdict
**SKIP.**  
*Reason:* Nutrition tracking is outside IronLog's scope and disallowed by the 21-feature ceiling in `NOTES.md`; IronLog's existing body tracking in `body_measurements` already handles weight, body fat, waist, and progress photos.

---

## Harvest Item 5: API Surface

### What it is
wger exposes a REST API via Django REST Framework (DRF) mounted under `/api/v2/` (`wger/urls.py:53-245`):
- **Authentication:** Dual support for HTTP session auth, simplejwt Bearer tokens (`/api/v2/token/verify`, `/api/v2/token/refresh`), allauth headless REST endpoints (`/allauth/`), and OIDC OAuth2 provider (`/identity/o/authorize`).
- **Core Endpoints:**
  - `/api/v2/exerciseinfo/`: Compound endpoint returning exercise base data, localized translations, images, videos, muscles, and equipment in a single query.
  - `/api/v2/routine/`, `/api/v2/day/`, `/api/v2/slot/`, `/api/v2/slot-entry/`: Hierarchical plan CRUD.
  - `/api/v2/workoutsession/`, `/api/v2/workoutlog/`: Workout logging endpoints.
  - `/api/v2/weight-config/`, `/api/v2/repetitions-config/`, etc.: Progression step endpoints.
- **Mobile Offline Sync:** wger integrates PowerSync endpoints (`/api/v2/powersync-token`, `/api/v2/upload-powersync-data` in `wger/core/powersync.py`) to replicate PostgreSQL tables to SQLite on mobile clients (used by wger's Flutter companion app).

### Donor Evidence (Paths)
- Root API router and endpoints: `wger/urls.py:53-155`
- Auth and token endpoints: `wger/urls.py:165-175`
- Compound exercise info view: `wger/urls.py:115-118`, `wger/exercises/api/views.py`
- PowerSync offline sync integration: `wger/urls.py:195-210`, `wger/core/powersync.py:25-90`
- DRF OpenAPI / Swagger schema: `wger/urls.py:215-235` (`drf-spectacular`)

### What to take
- **Take:** The concept of an aggregated exercise query endpoint (analogous to `/api/v2/exerciseinfo/`) for bulk hydration.
- **Do NOT take:** wger's Django REST Framework or PowerSync sync services.

### Adaptation into IronLog
IronLog is built on Supabase (PostgREST, Auth, and Storage). Its offline capability is implemented via IndexedDB/LocalStorage outbox queueing (`src/lib/offline/queue.ts`, `workout-store.ts`). If IronLog ever supported importing data from a user's self-hosted wger instance, IronLog's `src/lib/history-import.ts` could add a "wger REST" import parser consuming `/api/v2/workoutlog/` and `/api/v2/workoutsession/` using standard personal API tokens.

### License Note
- **Code License:** AGPL-3.0-or-later (`LICENSE.txt`).
- **Data License:** Endpoint data payloads carry the underlying licenses of the stored data (CC-BY-SA for exercises).

### UI Impact
**NONE.**

### Verdict
**SKIP** (no self-hosted wger sync required) / **ALREADY PRESENT** (IronLog already has Supabase REST API, offline outbox, and CSV/XLSX/JEFIT/Strong/Hevy importers in `src/lib/history-import.ts`).  
*Reason:* IronLog's existing Supabase backend and offline queue meet all personal requirements; wger's API endpoints are only relevant if building an external migration bridge.

---

## Harvest Item 6: AGPL Consequences, Stated Plainly

### What it is
Analysis of the GNU Affero General Public License version 3 (AGPL-3.0) and Creative Commons terms governing wger, evaluated specifically for IronLog as a personal, sideloaded, single-user mobile application.

### Donor Evidence (Paths)
- License text: `LICENSE.txt:1-668`
- Declared project terms: `README.md:97-101`:
  - Application Code: AGPL-3.0-or-later (`LICENSE.txt`)
  - Exercise/Ingredient Data: Creative Commons (see individual entries)
  - Documentation: CC-BY-SA-4.0
- Model attribution framework: `wger/utils/models.py:46-65` (`AbstractLicenseModel` implementing CC TASL)
- Licenses fixture: `wger/core/fixtures/licenses.json:1-55`

### Plain-Language Legal Assessment

#### 1. Running wger As-Is (e.g. self-hosting on a personal server)
- **AGPL-3.0 Section 13 (Remote Network Interaction):** AGPL-3.0 requires offering source code only if you modify the software and provide it over a network to users.
- **Personal Use Consequence:** Running an unmodified wger instance for personal use triggers no disclosure requirements. Even if modified, if the instance is strictly private (only used by the owner with no third-party network users), there are no downstream recipients to whom source must be offered.

#### 2. Importing wger's Exercise Data
- **Data vs Code Separation:** wger explicitly separates code license (AGPL) from data license (Creative Commons) in `README.md:99-100`. The exercise data does **not** inherit AGPL copyleft.
- **Creative Commons Terms (CC-BY-SA 4.0 / 3.0):**
  - The vast majority of exercise bases (719 of 872) and translations (1,606 of 2,429) are CC-BY-SA.
  - ShareAlike (SA) copyleft triggers upon **distribution or public communication** of adapted database materials.
  - In a strictly personal, sideloaded app that is not distributed, copyright restrictions on private copying do not restrict the personal user.
  - However, if the app or its seed data were ever published or distributed, any database derived from wger's CC-BY-SA entries would legally require TASL attribution and reciprocal CC-BY-SA licensing for that data. AGPL does not infect the app code through CC-BY-SA data.

#### 3. Adapting wger's Code into IronLog
- **AGPL-3.0 Section 5 (Conveying Modified Source Versions):** If expressive code from wger were directly copied, translated, or ported into IronLog, IronLog would legally become a derivative work under AGPL-3.0.
- **Copyleft Scope:** If an AGPL-derived app is distributed or operated over a network for others, the entire combined work must be licensed under AGPL-3.0.
- **Clean-Room Implementation (Safe Harbor):** Adapting abstract training concepts, mathematical formulas (such as Brzycki's formula or Epley with RiR), and state-machine logic independently written in TypeScript does **not** trigger AGPL-3.0. Under copyright law (17 U.S.C. § 102(b)), ideas, procedures, systems, methods of operation, and mathematical concepts are not copyrightable; only the specific code expression is protected.

### UI Impact
**NONE.**

### Verdict
**TAKE** (clean-room mathematical ideas and logic) / **SKIP** (copying donor code or importing CC-BY-SA data).  
*Reason:* Direct code porting is strictly prohibited by AGPL copyleft and project guidelines; clean-room algorithmic reimplementation carries zero copyleft obligation.

---

## Ranked Shortlist: The 3 Highest-Value Takes for IronLog

The following three high-value items can be adapted into IronLog in a future run. In accordance with Hard Rule 1, each take has **ZERO UI impact** and represents a pure background logic, algorithmic, or data-integrity improvement:

1. **RiR/RPE-Adjusted One-Rep Max Estimation (from `wger/manager/one_rep_max.py:84`)**
   - *Why it matters:* IronLog already collects RPE on completed sets (`workout_sets.rpe`, `src/components/workout/effort-picker.tsx`), but its 1RM formula (`src/lib/one-rm.ts`) currently ignores RPE, calculating 1RM solely on actual reps. Factoring in unused reps ($\text{RiR} = 10 - \text{RPE}$) before estimating 1RM creates true exertion-adjusted strength curves and accurate PR tracking.
   - *Implementation:* Internal pure-function refinement in `src/lib/one-rm.ts`.
   - *UI Impact:* **NONE.**

2. **Target Preservation on Completed Sets (from `wger/manager/models/log.py:145-190`)**
   - *Why it matters:* In wger's `WorkoutLog`, the targets prescribed by the plan (`repetitions_target`, `weight_target`, `rir_target`) are recorded alongside the actual performance. In IronLog, targets live on `routine_exercises`. If the user updates or edits a routine later, historical sets lose their original prescription context. Snapshotting prescribed target values directly on `workout_sets` stabilizes training history and adherence metrics permanently.
   - *Implementation:* Background field population during set initialization in `src/lib/offline/workout-store.ts`.
   - *UI Impact:* **NONE.**

3. **Structured Exercise Variation Grouping (from `wger/exercises/models/base.py:112`)**
   - *Why it matters:* wger assigns a `variation_group` UUID to cluster mechanical variants of an exercise (e.g. flat bench, close-grip bench, incline dumbbell press). IronLog's substitution engine (`src/lib/substitution-engine.ts`) currently relies on broad muscle and equipment filtering. Introducing explicit variation groups enables deterministic, high-quality exercise substitutions without modifying the UI picker.
   - *Implementation:* Optional `variation_group` metadata tag in `public.exercises` consumed by `substitution-engine.ts`.
   - *UI Impact:* **NONE.**
