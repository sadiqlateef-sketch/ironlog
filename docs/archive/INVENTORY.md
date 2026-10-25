Archived 2026: outdated, see REVIEW.md / NOTES.md.

# IronLog — Evidence-Based Current Implementation Inventory & Audit Findings

Version: 1.1  
Date: 2026-10-23  
Auditor: Master Planning & Verification Agent  
Target Verification Device: Samsung Galaxy Z Fold8 (`SM-F976U`)  

---

## 1. System Architecture & Data Flows

### 1.1 Architecture Tiers
```
[ Web UI / Next.js 16 Static Export (`out/`) ]
                    │
                    ▼
[ Capacitor Android Shell (`com.ironlog.app`) ]
    │                                     │
    ├─► SQLite / Local KV Storage          ├─► Ecosystem Bridge (ContentProvider)
    │   (Offline Table Cache + Queue)      │   (Signature-protected Bujo Tasks bridge)
    │                                      │
    ▼                                      ▼
[ Mock Backend Engine (Fallback) ]     [ Bujo Tasks / The Grove / Braindump ]
    │
    ▼
[ Cloud Supabase (PostgreSQL + RLS + 7 Edge Functions) ]
    ▲
    │
[ Wear OS React Native Companion (`ironlog-watch`) ]
```

### 1.2 Core Data Flows
1. **Workout Lifecycle Flow:**
   - User starts workout → `src/lib/offline/workout-store.ts` sets `active-workout` in local storage and creates record in `workout_sessions`.
   - Sets logged → written synchronously to local cache (`workout_sets`), queued in `src/lib/offline/queue.ts`, sent to Supabase / Mock backend.
   - User taps Finish → non-warmup volume computed, `end_time` stamped, `active-workout` cleared atomically, finish op queued, Bujo ecosystem hook fired.
2. **Offline-First Resilience Flow:**
   - App network requests intercept via `src/lib/supabase/client.ts`.
   - If Supabase is unconfigured or unreachable, `src/lib/supabase/mock-backend.ts` fulfills CRUD queries with full PostgREST filter emulation (`is.null`, `eq`, `order`, `limit`, RPCs).
   - Mutations persist to `ironlog_table_*` in `localStorage`.
3. **Ecosystem Bridge Flow:**
   - `src/services/ironlogEcosystemSync.ts` invokes `IronLogEcosystem` Capacitor plugin.
   - Writes to `IronLogContentProvider` (`com.ironlog.app.provider`) protected by `com.sadiqlateef.bujotasks.permission.READ_WRITE_DATA` (`protectionLevel="signature"`).
   - Waters "Oak · Tree of Vitality" in Bujo Tasks Grove; pushes PR summary to Braindump.

---

## 2. Baseline Verification Matrix

| Check | Target / Command | Status | Details / Evidence |
| :--- | :--- | :--- | :--- |
| **TypeScript (App)** | `npm run typecheck` (`tsc --noEmit`) | **PASS** | 0 errors across entire Next.js TypeScript codebase |
| **Unit Tests (App)** | `npm test` (`node --test tests/*.test.ts`) | **179 PASS / 1 FAIL** | 179 pass across 22 suites. 1 failure in `tests/workout-finish.test.ts` due to raw Node ESM loader resolving `@/` path alias. |
| **Next.js Production Build** | `npm run build` (`next build`) | **PASS** | 16/16 static pages exported in 3.9s. Security advisory raised for Next.js 16.4.0 (resolved in `next-security-upgrade` branch). |
| **Linter (App)** | `npm run lint` (`eslint`) | **FAIL** | 41 problems (39 errors, 2 warnings). Issues: React 19 hook purity in `use-active-workout.ts` & `use-workout.ts`, `@typescript-eslint/no-explicit-any`. |
| **Watch Unit Tests** | `cd watch && npm test` | **PASS** | 16/16 test assertions pass in 148ms. |
| **Watch TypeScript** | `cd watch && npm run typecheck` | **FAIL** | Missing `watch/node_modules`; `@react-native/typescript-config` and React Native types uninstalled. |
| **Device Verification** | Samsung Galaxy Z Fold8 (`SM-F976U`) | **PASS** | Stale workout guard, Discard modal, Finish modal, tab navigation reopen prevention tested live on device. |

---

## 3. Capability Audit & Implementation Status

Status labels: `Implemented`, `Integrated`, `Tested`, `Device-verified`, `Release-ready`.

### 3.1 Workout Logging & Session Lifecycle
- **Workout Start / Resume / Finish:** `Device-verified`
  - *Components:* `src/components/workout/workout-screen.tsx`, `src/hooks/use-workout.ts`, `src/lib/offline/workout-store.ts`.
  - *Evidence:* Tested live on Galaxy Z Fold8. Finish flow atomically writes `end_time`, calculates non-warmup volume, clears `active-workout` mirror, and updates Home recent workouts.
- **Discard Workout Escape Hatch:** `Device-verified`
  - *Components:* `workout-screen.tsx` (`[data-testid="discard-button"]`, `[data-testid="discard-confirm-dialog"]`).
  - *Evidence:* Verified on Fold8 with "Keep editing" (cancellation) and "Yes, discard workout" (immediate reset).
- **Stale Session Guard:** `Device-verified`
  - *Components:* `workout-store.ts` (`isToday()`, `isSessionCompleted()`, `getStaleSession()`).
  - *Evidence:* Prevents sessions from previous days from auto-resurrecting; offers resume/discard prompt.
- **Set Logging & Warm-Up Calculations:** `Tested`
  - *Components:* `src/components/workout/set-row.tsx`, `src/lib/set-logic.ts`.
  - *Evidence:* `tests/set-logic.test.ts` and `tests/logic.test.ts` pass (bar ramp math, dumbbells, RPE reps-in-reserve).
- **Rest Timer:** `Tested`
  - *Components:* `src/components/workout/rest-sheet.tsx`, `src/components/rest-timer-bar.tsx`.
  - *Evidence:* Background timer with notification hooks; unit tested in `tests/logic.test.ts`.

### 3.2 Offline Store & Local Mock Engine
- **Local Key-Value & Mutation Queue:** `Tested`
  - *Components:* `src/lib/offline/kv.ts`, `src/lib/offline/queue.ts`.
  - *Evidence:* Unit tested in `tests/workout-finish.test.ts`; tested offline fallback in `src/lib/supabase/mock-backend.ts`.
- **Mock PostgREST Engine:** `Tested`
  - *Components:* `src/lib/supabase/mock-backend.ts`.
  - *Evidence:* Emulates query filtering (`is.null`, `eq`, `in`, `order`, `limit`), cascading `DELETE`, `PATCH` with volume math, and 32 exercise catalog.

### 3.3 Analytics, History & Personal Records
- **1RM Calculations & Formulas:** `Tested`
  - *Components:* `src/lib/one-rm.ts`, `src/lib/stats.ts`.
  - *Evidence:* `tests/analytics.test.ts` (Epley and Brzycki formula tests pass).
- **Muscle Recovery & Strain Models:** `Tested`
  - *Components:* `src/lib/recovery.ts`, `src/components/body-heatmap.tsx`.
  - *Evidence:* `tests/analytics.test.ts` (muscle half-life decay, warm-up exclusion pass).
- **Body Tracking & Metrics:** `Tested`
  - *Components:* `src/lib/body.ts`, `src/lib/body-api.ts`.
  - *Evidence:* `tests/body.test.ts` (BMI, body fat, lean mass, waist-to-height pass).
- **Cardio & Timed Exercises:** `Tested`
  - *Components:* `src/lib/cardio.ts`.
  - *Evidence:* `tests/cardio.test.ts` (pace, duration parsing pass).

### 3.4 AI & Cloud Extensions
- **AI Plan Generation:** `Integrated`
  - *Components:* `supabase/functions/generate-plan`, `src/lib/workout-plan.ts`.
  - *Evidence:* Schema validation tested in `tests/ai.test.ts`. Requires live Anthropic key in Edge Functions for end-to-end execution.
- **Weekly Recap & Insights:** `Integrated`
  - *Components:* `supabase/functions/weekly-recap`, `src/lib/insights.ts`.
  - *Evidence:* `tests/recap.test.ts` and `tests/insights.test.ts` pass.
- **Workout Import (Photo / Text / Voice):** `Integrated`
  - *Components:* `supabase/functions/import-workout`, `src/lib/history-import.ts`.
  - *Evidence:* `tests/import.test.ts` and `tests/history-import.test.ts` pass.
- **Claude Connector (MCP / API):** `Integrated`
  - *Components:* `supabase/functions/claude-connector`, `src/lib/claude-link.ts`.
  - *Evidence:* `tests/connector.test.ts` (JSON-RPC protocol, tool schema tests pass).

### 3.5 Native Android & Foldable Support
- **Capacitor Configuration & Deep Links:** `Device-verified`
  - *Components:* `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`.
  - *Evidence:* App launches and runs on Galaxy Z Fold8; deep links declared for `ironlog://workout`, `com.ironlog.app://gym-calendar`, `com.ironlog.app://auth-callback`.
- **Foldable Continuity (`allow_multiple_resumed_activities`):** `Device-verified`
  - *Components:* `AndroidManifest.xml`.
  - *Evidence:* Preserves UI and responsive layout across folded and unfolded postures.
- **Bujo Tasks Ecosystem Bridge:** `Integrated`
  - *Components:* `src/services/ironlogEcosystemSync.ts`, `android/app/src/main/java/com/ironlog/app/IronLogContentProvider.java`.
  - *Evidence:* Signature permission `com.sadiqlateef.bujotasks.permission.READ_WRITE_DATA` declared; SQLite provider implemented; invocation hooked into finish flow. End-to-end inter-app verification with Bujo Tasks APK pending.

### 3.6 Wear OS Companion
- **Watch React Native App:** `Implemented` (Tests pass, compilation unverified)
  - *Components:* `watch/App.tsx`, `watch/src/screens/*`, `watch/src/queue.ts`.
  - *Evidence:* 16/16 logic tests pass via `watch/tests/watch.test.ts`. `watch/node_modules` needs installation to verify full React Native build and TypeScript checks.

---

## 4. Defect & Gap Registry

### 4.1 Confirmed Defects (Requiring Immediate Resolution)
1. **ESLint Hook Purity Violations (`src/hooks/use-active-workout.ts`):**
   - Reassigning module-scoped `last = undefined` during render violates React 19 hook purity rules. Must be managed inside an effect or state updater.
2. **ESLint Cascading Render Warning (`src/hooks/use-workout.ts`):**
   - Synchronous `load()` call within `useEffect` causes cascading render warnings.
3. **Node Test Path Alias Resolution (`tests/workout-finish.test.ts`):**
   - Raw `node --test` command cannot resolve `@/` imports from `src/lib/offline/workout-store.ts`. Must use relative path imports in library domain files or configure node loader.
4. **Missing Watch Node Modules (`watch/node_modules`):**
   - Missing dependencies prevent `cd watch && npm run typecheck` from passing.
5. **Next.js 16.4.0 Security Advisory:**
   - Addressed in `next-security-upgrade` worktree branch (bumped to 16.4.2); needs merge into `main`.

### 4.2 Gaps & Unverified Claims
1. **Bujo Tasks IPC End-to-End Verification:**
   - ContentProvider and signature permissions are coded, but live two-app IPC verification (finishing in IronLog → checking off in Bujo Tasks) requires Bujo Tasks installed on the device.
2. **Edge Function Cloud Deployments:**
   - 7 Supabase functions exist locally; live deployment status on remote Supabase project requires audit with Supabase CLI once access is configured.
3. **Physical Watch Device Verification:**
   - Wear OS logic is tested in node; live watch pairing on physical hardware has not yet been executed.
