# IronLog — wger Harvest Takes Implementation Report

**Run Date:** November 9, 2026  
**Repository:** `ironlog` (`C:\Users\sadiq\Projects\ironlog`)  
**Base Commit:** `fff8928` ("Lock two trigger functions out of the API; NOTES for the Nov 8 fixes (#50)")  
**Status:** Clean-room implementation complete. All top-3 takes implemented in separate commits. All fixtures (W1–W6) passing. CI (lint + tests) verified clean.

---

## Step 0 — Ground Truth Inventory

Before implementing any changes, the repository was inventoried against the requirements:

### 1. 1RM Implementation and Callers (`src/lib/one-rm.ts`)
- **Formula:** Epley formula: $\text{1RM} = \text{weight} \times \left(1 + \frac{\text{reps}}{30}\right)$ (for $\text{reps} = 1$, $\text{1RM} = \text{weight}$). A secondary Brzycki formula $\text{1RM} = \text{weight} \times \frac{36}{37 - \text{reps}}$ is also exported.
- **Callers Identified:**
  1. `src/lib/one-rm.ts`: `epley(weight, reps, rpe?)` and `brzycki(weight, reps, rpe?)`.
  2. `src/lib/workout-logic.ts`: `bestE1rm(sets)` — finds highest e1RM across sets, filtering warmups.
  3. `src/lib/stats.ts`: `calculate1rmProgression(exerciseSets)` — builds timeline curves of e1RM.
  4. `src/lib/workout-api.ts`: `calcEstimated1rm(weight, reps, rpe?)` — evaluates estimated 1RM when logging sets.

### 2. RPE Capture Status
- **Verdict:** **CONFIRMED PRESENT**.
- **Storage:** `workout_sets.rpe` (numeric / `number | null`).
- **UI Capture:** Captured in the set logging flow via `EffortPicker` (`src/components/workout/effort-picker.tsx`). Lifters can record RPE from 6.0 to 10.0 (including half-steps like 8.5 or 9.5).

### 3. `workout_sets` Schema and Migration Mechanism
- **Engine:** PostgreSQL managed via Supabase timestamped migrations (`supabase/migrations/<timestamp>_<name>.sql`).
- **Offline / Local Mirroring:**
  - IndexedDB / Memory KV cache in `src/lib/offline/kv.ts` and `src/lib/offline/workout-store.ts`.
  - In-browser local mock database in `src/lib/supabase/mock-backend.ts`.
  - Strong TypeScript schema typing in `src/types/database.ts`.

### 4. Server Sync & Partner Sync Status
- **Verdict:** Partner sync was completely excised in Upgrade #47 (commit `9aa1583`, removing 11 unused files added Oct 28–29).
- There is no external third-party server schema or sync contract that rejects new nullable columns. Adding nullable snapshot and metadata columns to `workout_sets` and `exercises` does not break sync or cause schema rejection.

### 5. Substitution Engine (`src/lib/substitution-engine.ts`)
- **Ranking Logic:** Analyzes muscle overlap (primary + secondary), equipment compatibility, mechanic type (compound vs. isolation), and joint stress profile.
- Candidates are scored and ranked with biomechanical rationales and badges ("Direct Swap", "Machine Alternative", "Dumbbell Variant").

### 6. Flow of Prescribed Targets from Routine to Set
- Routines define target parameters (`weight_kg`, `target_reps`, `target_weight`, `target_rpe`) on `PlannedExercise`.
- When `startPlannedSession` or `createSet` initializes sets, targets flow directly into the set row creation.

---

## Item 1 — RiR/RPE-Adjusted 1RM Estimation

### Mechanism
- When a set has a logged RPE, effective reps are computed as:
  $$\text{effective\_reps} = \text{reps} + \text{RiR} \quad \text{where} \quad \text{RiR} = \max(0, 10 - \text{RPE})$$
- The Epley formula is evaluated on effective reps:
  $$\text{e1RM} = \text{weight} \times \left(1 + \frac{\text{reps} + (10 - \text{RPE})}{30}\right)$$
- If RPE is omitted (`null` or `undefined`), raw reps are used with zero behavioral change.
- Out-of-range RPEs ($< 0$ or $> 10$) are rejected/ignored without lowering effective reps below raw reps.
- Fractional RPEs (e.g. 9.5 $\rightarrow \text{RiR}=0.5$) are preserved without rounding.
- Applied uniformly across all callers: `src/lib/one-rm.ts`, `src/lib/workout-logic.ts`, `src/lib/stats.ts`, and `src/lib/workout-api.ts`.

### Commit
- **SHA:** `e915d2e`  
- **Subject:** `feat(analytics): RiR/RPE-adjusted 1RM estimation (wger take #1)`

---

## Item 2 — Target Preservation on Completed Sets

### Mechanism
- Created migration `supabase/migrations/20261109000000_workout_sets_target_snapshot.sql` adding three nullable columns to `workout_sets`:
  - `target_reps integer`
  - `target_weight numeric(6,2)`
  - `target_rpe numeric(3,1)`
- Stamped at the instant a set is created from a routine's prescription in `startPlannedSession` and `createSet`.
- Unprescribed / freestyle sets leave snapshot fields `null`.
- Existing sets remain `null` (no destructive backfill); all read paths remain 100% backward-compatible.

### Commit
- **SHA:** `3c4425c`  
- **Subject:** `feat(database): target preservation snapshot on workout_sets (wger take #2)`

---

## Item 3 — Structured Exercise Variation Grouping

### Mechanism
- Created migration `supabase/migrations/20261109010000_exercise_variation_group.sql` adding nullable column `variation_group text` to `exercises`.
- Implemented deterministic movement classifier `deriveVariationGroup(exercise)` in `src/lib/substitution-engine.ts`.
- Evaluates exercise names and aliases against canonical compound and isolation movement chains:
  - `squat`, `bench-press`, `deadlift`, `row`, `pull-up`, `dip`, `triceps-extension`, `biceps-curl`, `chest-fly`, `calf-raise`, `lunge`, `hip-thrust`, `leg-curl`, `leg-extension`.
- Exercises that do not match a base pattern deterministically remain `null` (strictly never guessed).
- Integrated with `smartSwaps` in `src/lib/workout-logic.ts`: candidate exercises sharing the same `variation_group` receive a strong candidate boost (+25 points) and are tagged as "Direct Variant" in `explainSubstitution`.
- Future exercises acquire groups dynamically through `deriveVariationGroup(exercise)` during ingestion, or remain null until an established group matches.

### Grouping Coverage Numbers
Across the 641 seed exercises in `supabase/seed.sql`:
- **Grouped Exercises:** 233 (36.3%)
  - `squat`: 43
  - `biceps-curl`: 40
  - `triceps-extension`: 35
  - `row`: 27
  - `bench-press`: 21
  - `deadlift`: 20
  - `calf-raise`: 9
  - `pull-up`: 9
  - `chest-fly`: 8
  - `dip`: 7
  - `lunge`: 6
  - `hip-thrust`: 3
  - `leg-curl`: 3
  - `leg-extension`: 2
- **Ungrouped / Left Null:** 408 (63.7%) — cleanly preserved without guesswork.

### Commit
- **SHA:** `af762c9`  
- **Subject:** `feat(exercises): structured variation grouping & substitution candidate signal (wger take #3)`

---

## Fixture Verification Results

A dedicated automated test suite (`tests/wger-takes.test.ts`) verifies all six fixtures (commit `9e30728`):

| Fixture | Description | Result | Details |
|---|---|---|---|
| **W1** | RiR Adjustment Math | **PASS** | • 100 kg × 5 raw: **116.7 kg**<br>• 100 kg × 5 @ RPE 10 ($\text{RiR}=0$): **116.7 kg** (exact parity)<br>• 100 kg × 5 @ RPE 8 ($\text{RiR}=2$, $r_{\text{eff}}=7$): **123.3 kg**<br>• Fractional RPE 9.5 ($\text{RiR}=0.5$, $r_{\text{eff}}=5.5$): **118.3 kg**<br>• Out-of-bounds RPE (-1, 11): clamped without lowering raw reps |
| **W2** | No-RPE Parity | **PASS** | Evaluated across corpus (60x1, 100x5, 140x8, 80x10, 225x5, 315x3). All outputs identical to baseline. |
| **W3** | Snapshot Integrity | **PASS** | Session started from routine targets (100 kg × 8 @ RPE 8.5). Stamped snapshot holds original prescription even when the routine is subsequently modified. |
| **W4** | Legacy Safety | **PASS** | Historical rows with `target_reps = null`, `target_weight = null`, `target_rpe = null` execute volume and e1RM calculations without crash or alteration. |
| **W5** | Variation Grouping & Swaps | **PASS** | Barbell Bench Press and Close-Grip Bench Press map to `bench-press`; Back Squat maps to `squat`. Direct variants surface at the top of smart swap candidates with `Direct Variant` rationale. |
| **W6** | Outbox & Finish Isolation | **PASS** | `git diff --name-only` between baseline and current HEAD confirms zero modifications to `src/lib/offline/queue.ts`, `src/components/sync-banner.tsx`, `tests/real-db/finish.test.ts`, or `tests/outbox-pending.test.ts`. |

---

## Quality Assurance & CI Verification

- **Automated Tests:**
  ```text
  > npm test
  ✔ 297 tests pass
  ✔ 0 failures
  ✔ Duration: 1.87s
  ```
- **Lint:**
  ```text
  > npm run lint
  ✔ 0 errors (69 pre-existing warnings in legacy UI components)
  ```
- **Look and UX Integrity:**
  - Zero UI components, layouts, themes, icons, or visual presentation modified.
  - Zero wger code, comments, or data fixtures imported.

---

Fix #44's device test remains the owner's responsibility on the Fold8; none of the wger takes touched its code path.
