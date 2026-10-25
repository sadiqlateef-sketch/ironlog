# IronLog — Master Implementation Plan & Phase Rollout

Version: 1.1  
Date: 2026-10-23  
Status: Proposed for Approval  

---

## 1. Rollout Strategy & Execution Contract

Per **MASTER_AGENT.md**:
- Each phase is bounded, focused, and independently verified.
- Implementation is delegated to fresh executor agents to minimize token consumption and maintain clean boundaries.
- No new phase begins until the preceding phase satisfies its exit criteria and passes independent master verification.
- Target device for device verification: Samsung Galaxy Z Fold8 (`SM-F976U`), tested folded and unfolded.

---

## 2. Phase Schedule

### Phase 0: Read-Only Audit & Baseline Quality (Current Phase)
- **Status:** **COMPLETE** (Awaiting User Sign-Off)
- **Goal:** Baseline inventory, toolchain health check, defect mapping, and architecture documentation.
- **Deliverables:**
  - `MASTER_AGENT.md` (v1.1 operating contract)
  - `BACKLOG.md` (v1.1 prioritized backlog)
  - `INVENTORY.md` (evidence-based system inventory)
  - `PLAN.md` (this rollout roadmap)
- **Exit Gate:** Explicit user review and approval of the audit and proposed plan.

---

### Phase 1: Baseline Quality & Toolchain Health (P0)
- **Goal:** Eliminate all lint errors, fix test runner path resolution, resolve Next.js security advisory on `main`, and bring watch typecheck to green.
- **Scope:**
  - Merge `next-security-upgrade` branch into `main` (Next.js 16.4.2, `agentUpgrade: "security"`).
  - Refactor `use-active-workout.ts` to eliminate React 19 render-time mutation of module-scoped `last`.
  - Fix `use-workout.ts` cascading `setState` warning in `useEffect`.
  - Fix `@/` import resolution in domain modules imported by `tests/workout-finish.test.ts` so `npm test` achieves 100% pass rate (180/180).
  - Install dependencies in `watch/` and resolve `tsc --noEmit` errors.
- **Exit Gate:**
  - `npm test`: 100% pass (180/180 tests).
  - `npm run typecheck`: 0 errors.
  - `npm run lint`: 0 errors.
  - `npm run build`: 0 warnings, clean static export.
  - `cd watch && npm run typecheck`: 0 errors.

---

### Phase 2: Core Workout Lifecycle & Mutation Safety Hardening (P0 / P1)
- **Goal:** Harden the active workout engine against process termination, backgrounding, and rapid user input.
- **Scope (Ref: Backlog P0.4, P0.5):**
  - Verify set completion debounce to prevent double-tap duplicate sets.
  - Implement crash recovery: verify unfinished sessions restore cleanly after system kill (`am force-stop`) with accurate elapsed clock.
  - Ensure reordering sets with warm-ups and supersets preserves calculation invariants.
  - Hardened unit conversion precision (lb ↔ kg) without drift over multiple edits.
- **Exit Gate:**
  - Automated regression tests for process death recovery and rapid set completion.
  - Physical Galaxy Z Fold8 verification of crash recovery and timer continuity.

---

### Phase 3: Bujo Ecosystem Bridge Live Verification (P2.33)
- **Goal:** Validate end-to-end local IPC between IronLog and Bujo Tasks / Braindump on the physical Galaxy Z Fold8.
- **Scope (Ref: Backlog P2.33):**
  - Verify shared signature permission `com.sadiqlateef.bujotasks.permission.READ_WRITE_DATA`.
  - Verify `IronLogContentProvider` queries and inserts from ecosystem apps.
  - Verify that finishing a workout invokes `onWorkoutCompleted`, checks off the Bujo gym task, waters the Oak Tree of Vitality, and pushes summary context to Braindump.
  - Verify standalone resilience: app functions with zero degradation when Bujo Tasks is uninstalled or closed.
- **Exit Gate:**
  - Live device test on Galaxy Z Fold8 verifying Bujo Task completion and Oak Tree watering.

---

### Phase 4: Foldable Interaction & Layout Polish (P1.1, P1.6)
- **Goal:** Perfect the Galaxy Z Fold8 user experience across folded (< 600dp) and unfolded (> 600dp) postures.
- **Scope (Ref: Backlog P1.1, P1.6):**
  - Folded posture: verify one-handed touch targets (min 48dp), zero numeric keyboard overlap on active sets, sticky finish bar.
  - Unfolded posture: verify responsive dual-pane layout, navigation rail alignment, and muscle heatmap scaling.
  - Continuity: verify seamless transition when unfolding mid-workout without losing input focus or unsaved set values.
- **Exit Gate:**
  - Screenshots and interaction verification across folded and unfolded device states.

---

### Phase 5: Wear OS Companion Verification & Sync (P1.25)
- **Goal:** Validate watch pairing, real-time set logging, and offline queue synchronization.
- **Scope (Ref: Backlog P1.25, P2.26):**
  - Verify pairing handshake and secure token storage.
  - Verify set logging from watch syncs to phone active workout session.
  - Verify watch offline queue drain upon reconnection.
- **Exit Gate:**
  - Watch APK builds cleanly via `./gradlew assembleDebug`.
  - All watch tests pass with 0 TypeScript errors.

---

## 3. Top 10 Priority Ranking (User Impact vs Risk)

1. **P0: Merge Security Upgrade (Next.js 16.4.2)** — Resolves published security advisory.
2. **P0: Fix React 19 Hook Purity in Active Workout Hook** — Eliminates render-phase mutation race conditions.
3. **P0: Fix Test Runner Path Alias Import Failure** — Restores 100% CI/test suite pass rate.
4. **P1: Galaxy Z Fold8 Unfold Continuity & Keyboard Clearance** — Essential for gym logging on primary device.
5. **P1: Process Death & Low-Memory Workout Recovery** — Prevents data loss if Android OS kills app in background during rest interval.
6. **P1: Rapid-Tap Set Debouncing** — Eliminates accidental double-logging under sweaty gym conditions.
7. **P2: Bujo Ecosystem Bridge Live Verification** — Connects workout completion to Bujo Tasks habit tracking and Oak tree watering.
8. **P2: Watch TypeScript & Build Integrity** — Brings Wear OS companion to a compilable, verifiable baseline.
9. **P2: Rest Timer Background Alarm & Notification Resilience** — Ensures rest intervals fire even when screen is locked.
10. **P3: Supabase Cloud Edge Function Deployment Audit** — Verifies remote backend parity with local functions.
