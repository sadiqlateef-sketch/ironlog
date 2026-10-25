# IronLog — Master Product & Engineering Backlog

Version: 1.1
Date: 2026-10-23
Status: Proposed — "INVENTORY.md" verification and human approval required

Changelog:
- 1.1 (2026-10-23): Named the reported finish-workout defect in P0.4; added P2.33 Bujo ecosystem bridge. (Priority scheme P0–P3 is the authority; the Master Agent doc was aligned to it.)

## Purpose

Make IronLog a best-in-class strength-training companion across web, Android, and Wear OS.

This backlog covers product features, interaction design, visual polish, personalization, analytics, reliability, security, privacy, accessibility, testing, and release readiness.

Important: Every item starts as a proposal until "INVENTORY.md" verifies the current state. Existing implementations must be improved rather than duplicated. No feature should ship without acceptance criteria, regression coverage, and a clear data/privacy contract.

## Priority definitions

- P0 — Critical: Data integrity, security, broken core flows, release-blocking defects.
- P1 — High: Core workout experience, offline/watch reliability, trust, accessibility, and usability.
- P2 — Medium: Valuable product improvements and customization.
- P3 — Optional: Advanced features, integrations, and experiments.

Status values: "AUDIT", "MISSING", "PARTIAL", "BROKEN", "APPROVED", "IN_PROGRESS", "VERIFIED", "BLOCKED", "DEFERRED".

---

## Phase 0 — Audit, baseline, and product truth

### P0.1 Repository and architecture inventory

- [ ] Inventory all routes, screens, components, hooks, stores, libraries, server functions, database objects, migrations, native modules, and watch modules.
- [ ] Map the real data flow from logger UI through local persistence and Supabase.
- [ ] Map web, Android, and Wear OS differences.
- [ ] Identify duplicate domain logic and competing sources of truth.
- [ ] Map feature flags and undocumented configuration.
- [ ] Find dead code, unreachable UI, abandoned screens, TODOs, stubs, and unused dependencies.
- [ ] Compare README and marketing claims with actual implementation.
- [ ] Identify all externally transmitted data and third-party services.
- [ ] Document architecture and critical data contracts.

### P0.2 Baseline quality

- [ ] Record Git status, branch, recent changes, and existing uncommitted work.
- [ ] Run "npm test", "npm run typecheck", "npm run lint", and "npm run build" where supported.
- [ ] Run relevant Supabase migration/schema checks.
- [ ] Verify "npm run android:sync" and "npm run android:apk" where the environment permits.
- [ ] Verify watch tests/build using "watch/README.md" and actual package scripts.
- [ ] Inspect CI workflows, artifact retention, failure reporting, and required checks.
- [ ] Record exact errors and environment limitations.
- [ ] Capture baseline screenshots of key screens and important responsive sizes.

### P0.3 Product and UX audit

- [ ] Audit first-run setup, navigation, Home, Workout, Progress, Plans, More, Settings, and exercise detail flows.
- [ ] Walk through a complete workout with warm-ups, supersets, drop sets, edits, undo, and finish.
- [ ] Audit offline start, mid-workout disconnection, restart, and reconnection.
- [ ] Audit watch pairing, logging, and phone/watch conflict scenarios.
- [ ] Audit every modal, sheet, form, numeric input, empty state, and error state.
- [ ] Check touch target sizes, keyboard overlap, safe areas, back navigation, and focus behavior.
- [ ] Identify redundant controls, confusing labels, hidden actions, and excessive steps.
- [ ] Build a prioritized defect and friction list with reproducible evidence.

Gate: No product implementation until the baseline report and proposed plan are presented for approval.

---

## Phase 1 — Trust, data integrity, and core reliability

### P0.4 Workout lifecycle correctness

- [ ] Test workout start, resume, finish, cancel, delete, and interrupted-session recovery.
- [ ] Ensure only the intended active workout can receive new sets.
- [ ] Prevent accidental workout completion and silent deletion.
- [ ] Define behavior when an app closes, crashes, loses power, or is force-stopped mid-session.
- [ ] Ensure finishing a workout is idempotent.
- [ ] Preserve user edits made during slow or failed requests.
- [ ] Add explicit unsaved/pending state where needed.
- [ ] Ensure finished workouts cannot accidentally revert to an active state.
- [ ] Reproduce and fix the reported defect: finishing a workout can revert it to an active state (reported 2026-10-22); add a regression test for the exact scenario.
- [ ] Audit time zones, workout dates, start times, durations, and overnight sessions.
- [ ] Add regression tests for concurrent edits and duplicate finish actions.

### P0.5 Set identity and mutation safety

- [ ] Verify stable IDs for sets and exercises across local storage, database, and watch.
- [ ] Verify rapid taps cannot complete a set twice.
- [ ] Verify retries cannot create duplicate sets.
- [ ] Ensure editing weight/reps updates all dependent analytics correctly.
- [ ] Ensure deleting a set removes or recalculates dependent records.
- [ ] Verify undo restores the exact prior state.
- [ ] Test reorder operations with supersets and program targets.
- [ ] Validate warm-up, normal, drop, failure, and timed-set semantics.
- [ ] Ensure a stale server response cannot overwrite a newer local edit.
- [ ] Add property-based or invariant tests for key workout operations where practical.

### P0.6 Offline queue and synchronization

- [ ] Audit mutation ordering, persistence, retries, and deduplication.
- [ ] Test offline workout creation, set editing, deletion, finish, and resume.
- [ ] Test app termination with queued changes.
- [ ] Test reconnection during simultaneous phone/watch edits.
- [ ] Add visible sync status and a clear explanation of unsynced changes.
- [ ] Provide safe retry and actionable failure details.
- [ ] Detect expired authentication without losing pending work.
- [ ] Define conflict rules for updates, deletes, and workout completion.
- [ ] Prevent stale cached plans or exercises from silently replacing newer data.
- [ ] Ensure local IDs map reliably to server IDs.
- [ ] Provide diagnostics that avoid exposing sensitive workout contents.
- [ ] Test duplicate delivery, out-of-order delivery, and intermittent connectivity.

### P0.7 Analytics and training-record integrity

- [ ] Verify volume excludes warm-ups and follows documented drop-set/superset rules.
- [ ] Verify estimated 1RM calculations and assumptions.
- [ ] Verify PR calculations after editing or deleting historical sets.
- [ ] Verify cardio and timed exercise data are excluded from incompatible calculations.
- [ ] Audit bodyweight and relative-strength calculations.
- [ ] Verify date-range boundaries and time-zone handling.
- [ ] Ensure historical charts reflect corrected workouts.
- [ ] Define which changes trigger recomputation.
- [ ] Detect impossible or suspicious imported values without silently rewriting valid records.
- [ ] Add tests that compare aggregate analytics against raw workout data.

### P0.8 Database, migrations, and recovery

- [ ] Audit schema constraints, foreign keys, triggers, indexes, and migration dependencies.
- [ ] Verify migrations apply to both fresh and existing databases.
- [ ] Test rollback or recovery procedures for risky changes.
- [ ] Add migration tests for program history and old records.
- [ ] Verify RLS policies for all tables and relationships.
- [ ] Ensure server functions validate ownership of referenced IDs.
- [ ] Add safe diagnostics for failed migrations.
- [ ] Document backup and recovery procedures.
- [ ] Never run destructive production migrations without explicit approval.

---

## Phase 2 — Make the workout logger exceptional

### P1.1 Logger interaction audit and simplification

- [ ] Measure how many taps are required for common set-entry workflows.
- [ ] Optimize the path from opening a workout to logging the first set.
- [ ] Keep the active set and next action visually obvious.
- [ ] Make numeric entry work well with one hand.
- [ ] Ensure the numeric keyboard never obscures the active set or critical actions.
- [ ] Preserve typed values when changing focus or switching views.
- [ ] Make set completion feedback clear but not distracting.
- [ ] Ensure undo is discoverable and has a predictable lifetime.
- [ ] Audit accidental swipe deletion and provide a safer confirmation/undo strategy.
- [ ] Ensure compact and expanded views preserve the same functionality.
- [ ] Verify rest timers remain visible and usable during navigation.
- [ ] Add a focused logger mode only if the existing focus mode needs improvement.

### P1.2 Set entry enhancements

- [ ] Improve weight/reps steppers and long-press behavior.
- [ ] Make increment sizes configurable by exercise or user preference.
- [ ] Support decimal loads where meaningful.
- [ ] Improve input validation for negative, empty, fractional, and unusually large values.
- [ ] Provide fast repeat-last-set and repeat-last-exercise actions.
- [ ] Offer copy-previous-set and duplicate-set actions with clear semantics.
- [ ] Support configurable default sets, reps, rest, and tracking type.
- [ ] Make warm-up generation editable and transparent.
- [ ] Improve drop-set creation and parent-set relationships.
- [ ] Allow per-set RPE/RIR entry without slowing ordinary logging.
- [ ] Add optional notes on a set, exercise, or workout with clearly defined persistence.
- [ ] Improve support for timed, distance, duration, and bodyweight exercises.

### P1.3 Rest timer polish

- [ ] Verify timer accuracy after backgrounding, sleep, process death, and device time changes.
- [ ] Separate timer end time from UI countdown ticks.
- [ ] Make pause, resume, skip, and ±time controls predictable.
- [ ] Add configurable default rest by exercise type and set type.
- [ ] Add optional auto-start behavior and a setting to disable it.
- [ ] Make sound, speech, and haptics individually configurable.
- [ ] Prevent duplicate rest notifications.
- [ ] Ensure notification actions update the actual workout timer.
- [ ] Handle denied notification/exact-alarm permissions gracefully.
- [ ] Verify battery use and foreground/background behavior.
- [ ] Improve timer visibility on the lock screen and watch where supported.

### P1.4 Exercise and superset flow

- [ ] Make the next exercise and active superset round obvious.
- [ ] Preserve pairing and order when exercises move.
- [ ] Improve swapping for unavailable equipment.
- [ ] Make temporary substitutions distinct from permanent plan edits.
- [ ] Provide alternatives with an explanation of equipment and muscle-group matching.
- [ ] Preserve historical exercise identity when display names change.
- [ ] Add a fast "add next exercise" path.
- [ ] Make exercise removal recoverable.
- [ ] Add explicit support for circuit rounds if the current data model can represent them correctly.
- [ ] Test reordering when sets are partially completed.

### P1.5 Workout finish and recovery

- [ ] Audit the finish screen for clarity and accuracy.
- [ ] Distinguish completed work, skipped sets, warm-ups, and partial workouts.
- [ ] Show PRs with enough context to verify them.
- [ ] Make the post-workout summary shareable without leaking private notes.
- [ ] Allow correcting duration, workout name, and notes after finishing.
- [ ] Ensure finishing a workout does not require AI or a third-party integration.
- [ ] Improve the route from finish screen to next planned workout.
- [ ] Offer a short optional reflection: energy, difficulty, pain/injury flag, and notes.
- [ ] Never infer a medical condition from a reflection.
- [ ] Ensure post-workout prompts can be skipped permanently or configured.

---

## Phase 3 — UI, visual identity, and customization

### P1.6 Design system consistency

- [ ] Audit spacing, typography, radii, borders, elevations, icon styles, and interaction states.
- [ ] Define semantic design tokens for colors and status.
- [ ] Standardize button hierarchy and destructive actions.
- [ ] Standardize dialogs, bottom sheets, cards, inputs, charts, and empty states.
- [ ] Reduce unnecessary nested cards and visual clutter.
- [ ] Improve typography hierarchy for numbers, exercise names, labels, and secondary details.
- [ ] Ensure light and dark themes remain equally legible.
- [ ] Verify loading, disabled, selected, pressed, focused, and error states.
- [ ] Avoid using color alone to represent fatigue, readiness, success, or danger.
- [ ] Improve chart labels and contrast.
- [ ] Verify icon consistency and avoid emoji as a substitute for functional icons.
- [ ] Create screenshot-based visual regression coverage for critical screens.

### P1.7 Home dashboard

- [ ] Audit whether Home prioritizes the next useful action.
- [ ] Keep Resume Workout prominent when a session is active.
- [ ] Make the next planned workout clear without overloading the screen.
- [ ] Let users customize dashboard cards and their order.
- [ ] Add optional quick actions for start workout, history, exercise search, and body measurements.
- [ ] Improve the visual treatment of weekly progress and goals.
- [ ] Make recovery summaries explain their assumptions.
- [ ] Provide useful empty states for new users and returning users.
- [ ] Avoid showing the same information in several cards.
- [ ] Allow hiding or minimizing metrics a user does not use.

### P1.8 Themes and appearance

- [ ] Add a more comprehensive theme system only after auditing the existing appearance controls.
- [ ] Offer curated palettes with accessible contrast.
- [ ] Consider an AMOLED true-black theme.
- [ ] Support system light/dark mode.
- [ ] Support adjustable font size and density without clipping.
- [ ] Consider adjustable card density and spacing.
- [ ] Allow subtle versus high-contrast chart styles.
- [ ] Offer reduced-motion mode and optional animation intensity.
- [ ] Ensure appearance choices persist consistently across web and Android where intended.
- [ ] Avoid proliferating settings that users cannot easily understand.

### P1.9 Navigation and information architecture

- [ ] Audit the four-tab navigation and More menu for discoverability.
- [ ] Reduce repeated routes and duplicate entry points.
- [ ] Make active workout navigation unmistakable.
- [ ] Ensure Android back behavior is consistent for dialogs, nested screens, and active sessions.
- [ ] Improve global search result grouping and empty states.
- [ ] Add recent searches or pinned exercises only if useful.
- [ ] Ensure deep links land on meaningful screens and handle missing content gracefully.
- [ ] Make settings discoverable without burying common logger controls.
- [ ] Review whether the names of screens match user expectations.
- [ ] Create a navigation map and maintain it when adding routes.

### P1.10 Micro-interactions and polish

- [ ] Add restrained haptics for set completion, PRs, and timer completion.
- [ ] Avoid redundant animation after every interaction.
- [ ] Ensure animation respects reduced-motion settings.
- [ ] Make success feedback consistent.
- [ ] Add useful skeleton/loading states where network waits are unavoidable.
- [ ] Avoid skeletons for fast local data that can appear immediately.
- [ ] Improve toast timing, placement, and action affordances.
- [ ] Ensure overlays do not allow unintended background interactions.
- [ ] Prevent double-submit during loading.
- [ ] Verify keyboard focus and Escape/back dismissal behavior.

---

## Phase 4 — Programs and progression intelligence

### P1.11 Program reliability and editing

- [ ] Audit generated program schema validation and persistence.
- [ ] Ensure a generated program never silently replaces an active program.
- [ ] Improve preview and confirmation before starting or replacing a program.
- [ ] Clarify how restarts, missed days, and schedule changes affect progression.
- [ ] Allow users to pause and resume programs if not already supported.
- [ ] Add safe duplication and version history for plans.
- [ ] Distinguish editing one workout from editing all future occurrences.
- [ ] Preview the effect of changes on later weeks.
- [ ] Preserve manual overrides when applying progression suggestions.
- [ ] Test deload weeks, exercise substitutions, missing history, and unusual schedules.
- [ ] Make progression recommendations explain the observed performance behind them.

### P1.12 Progression rules

- [ ] Audit deterministic progression fallbacks.
- [ ] Make progression rules configurable by exercise or program.
- [ ] Support double progression, percentage-based progression, rep targets, and conservative load increases where appropriate.
- [ ] Include equipment increments in suggested loads.
- [ ] Avoid recommending increases based on incomplete workouts or invalid records.
- [ ] Distinguish planned loads from performed loads.
- [ ] Explain why a weight is suggested, repeated, or reduced.
- [ ] Allow accept, edit, dismiss, and disable for future suggestions.
- [ ] Ensure dismissing a suggestion does not silently modify a plan.
- [ ] Track whether a recommendation was accepted and whether it was later edited.
- [ ] Avoid medical claims or guaranteed outcomes.

### P2.13 Training calendar and planning

- [ ] Improve calendar visibility for planned, completed, skipped, and rescheduled workouts.
- [ ] Allow rescheduling without corrupting the program's sequence.
- [ ] Provide a weekly overview of upcoming sessions and rest days.
- [ ] Add optional training block labels and notes.
- [ ] Show missed sessions without shaming users.
- [ ] Support flexible work/life scheduling.
- [ ] Clarify the difference between program day, calendar day, and completed session.
- [ ] Improve calendar integration failure reporting and retry controls.

### P2.14 Exercise library

- [ ] Audit exercise names, aliases, equipment, muscle groups, tracking type, and movement categories.
- [ ] Detect duplicates and inconsistent metadata.
- [ ] Improve exercise search and filtering.
- [ ] Improve exercise detail pages with muscles, equipment, instructions, and alternatives.
- [ ] Make media provenance and license information auditable.
- [ ] Provide safe fallbacks when exercise media is unavailable.
- [ ] Support custom exercises without corrupting historical data.
- [ ] Allow custom exercise categories and aliases if useful.
- [ ] Provide a way to correct a mistaken exercise match in imported workouts.
- [ ] Make equipment availability a first-class filter.
- [ ] Ensure custom exercises survive backup, restore, and device changes.

---

## Phase 5 — Analytics that users can trust

### P1.15 Strength and personal-record analytics

- [ ] Audit estimated 1RM formula and applicability across rep ranges.
- [ ] Make estimation method and limitations visible.
- [ ] Distinguish actual tested max from estimated max.
- [ ] Provide PR history with date, load, reps, and source workout.
- [ ] Allow users to correct an erroneous PR by correcting source data.
- [ ] Improve historical comparison when exercise variations change.
- [ ] Add rep-specific bests only when supported by reliable data.
- [ ] Make chart range and aggregation rules understandable.
- [ ] Provide accessible data tables for every essential chart.
- [ ] Test analytics after imports, deletions, edits, and restores.

### P2.16 Volume and training distribution

- [ ] Show weekly working sets by muscle group.
- [ ] Show exercise frequency and volume trends.
- [ ] Let users compare periods without misleading partial-week comparisons.
- [ ] Distinguish direct from indirect muscle contributions.
- [ ] Document assumptions used in muscle-volume aggregation.
- [ ] Let users filter by program, exercise, muscle, and date range.
- [ ] Identify sudden data gaps without implying training failure.
- [ ] Support export of chart data.
- [ ] Avoid suggesting that one volume target is ideal for everyone.

### P2.17 Recovery and strain model

- [ ] Audit the recovery model's assumptions and documentation.
- [ ] Clearly label estimates and explain the inputs used.
- [ ] Avoid medical or injury-risk claims.
- [ ] Allow users to hide recovery scores.
- [ ] Compare trends with the user's own baseline rather than universal rankings.
- [ ] Make missing heart-rate or RPE inputs visible.
- [ ] Ensure absence of data does not appear as perfect recovery.
- [ ] Test model behavior with unusual schedules and sparse histories.
- [ ] Separate workout-derived strain from wearable-derived measurements.
- [ ] Make recovery-map colors accessible.
- [ ] Provide an optional note that perceived readiness can differ from a model estimate.

### P2.18 Goals, consistency, and motivation

- [ ] Audit streak definitions and time-zone boundaries.
- [ ] Let users configure weekly training targets.
- [ ] Provide non-streak-based progress for users who dislike streaks.
- [ ] Add goals for strength, consistency, and program completion where appropriate.
- [ ] Support goal dates and progress history.
- [ ] Avoid penalizing planned rest days.
- [ ] Let users pause a goal without deleting history.
- [ ] Add milestone summaries based on verified records.
- [ ] Make achievement systems optional and non-manipulative.
- [ ] Ensure no achievement is granted twice due to retries or imports.

### P2.19 Body measurements and photos

- [ ] Audit measurement units and date history.
- [ ] Improve measurement entry and charting.
- [ ] Ensure private photos do not leak through logs, backups, or share sheets.
- [ ] Provide explicit photo storage and deletion behavior.
- [ ] Consider side-by-side photo comparison only with user consent.
- [ ] Avoid automatic body-shape judgments or appearance ratings.
- [ ] Make measurement and photo export/deletion behavior transparent.
- [ ] Ensure empty and permission-denied states are clear.

---

## Phase 6 — AI and smart assistance

### P1.20 AI security and reliability

- [ ] Inventory all AI endpoints, models, prompts, payloads, and data retention.
- [ ] Validate output against strict schemas before use.
- [ ] Treat generated content as untrusted.
- [ ] Prevent AI output from directly executing destructive database changes.
- [ ] Ensure model failure leaves existing plans and workouts intact.
- [ ] Add explicit timeout, retry, and rate-limit behavior.
- [ ] Avoid duplicate AI requests caused by repeated taps or retries.
- [ ] Track cost and usage without logging unnecessary personal data.
- [ ] Add user-visible status for AI availability and limits.
- [ ] Add an easy way to disable AI-assisted features.
- [ ] Ensure deterministic fallback paths are tested.
- [ ] Document which information is sent to an external provider.
- [ ] Test prompt-injection attempts through exercise names, notes, and imported text.

### P2.21 Program generation

- [ ] Improve generated-plan preview and editable parameters.
- [ ] Explain why the plan matches the user's stated goal and equipment.
- [ ] Make unsupported exercises and unavailable equipment visible.
- [ ] Ensure training experience and schedule inputs affect generation predictably.
- [ ] Provide regeneration that does not erase manual edits without confirmation.
- [ ] Add a deterministic starter-plan option.
- [ ] Show which decisions are AI-generated versus rule-based.
- [ ] Test provider outages, malformed output, and incomplete profiles.

### P2.22 Workout import

- [ ] Audit photo, screenshot, voice, typed text, and connector-based imports.
- [ ] Make uncertain exercise matches easy to review.
- [ ] Show a preview of all parsed sets before saving.
- [ ] Preserve original source text/photo only as long as necessary and according to user choice.
- [ ] Validate dates, units, set types, duration, and numeric bounds.
- [ ] Avoid silently dropping ambiguous sets.
- [ ] Add duplicate-import detection with a user override.
- [ ] Provide a recovery path for partially parsed workouts.
- [ ] Add sample fixtures for common notebook and third-party app formats.
- [ ] Make AI usage and cost limits understandable.
- [ ] Keep ordinary workout logging independent of AI availability.

### P2.23 AI recaps and suggestions

- [ ] Make recaps traceable to real logged data.
- [ ] Distinguish facts from interpretations and recommendations.
- [ ] Avoid invented PRs, sessions, or training history.
- [ ] Provide refresh/disable controls and clear update timing.
- [ ] Avoid generating the same recap repeatedly.
- [ ] Make suggestion dismissal durable.
- [ ] Add tests for sparse, contradictory, and missing data.
- [ ] Avoid overconfident claims about recovery, injury, or optimal training.

---

## Phase 7 — Android and Wear OS excellence

### P1.24 Android lifecycle and native behavior

- [ ] Audit app resume, pause, process death, and task removal during a workout.
- [ ] Verify deep links, OAuth return paths, and notification navigation.
- [ ] Test notification permissions and exact-alarm denial.
- [ ] Ensure rest alerts are scheduled, cancelled, and rescheduled correctly.
- [ ] Verify haptic and sound settings.
- [ ] Verify screen-on behavior does not drain battery unnecessarily.
- [ ] Audit back button, predictive back, system bars, and safe areas.
- [ ] Test Android 8+ compatibility against the declared minimum API and actual dependency requirements.
- [ ] Check large font settings and system display scaling.
- [ ] Audit camera/photo picker permissions and temporary file cleanup.
- [ ] Test upgrades over an existing install without losing data.
- [ ] Verify offline behavior with airplane mode and restricted background activity.

### P1.25 Wear OS synchronization and usability

- [ ] Audit pairing code generation, expiry, rate limits, and revocation.
- [ ] Verify pairing cannot link the wrong account or watch.
- [ ] Test logging a set from the watch while the phone is also editing.
- [ ] Test duplicate delivery and reconnect after a long offline period.
- [ ] Define how deleted or renamed exercises appear on the watch.
- [ ] Verify workout finish and cancel state across devices.
- [ ] Audit heart-rate permission and sensor availability.
- [ ] Test watch battery use and screen-off behavior.
- [ ] Evaluate a proper Wear OS exercise session for screen-off tracking if justified.
- [ ] Ensure missing sensors do not break ordinary workout logging.
- [ ] Provide understandable sync status on both devices.
- [ ] Make key watch controls usable with large touch targets and minimal navigation.
- [ ] Verify the watch can recover when the phone app is terminated.

### P2.26 Watch UX

- [ ] Improve glanceable current-exercise and next-set presentation.
- [ ] Reduce the number of taps to log a set.
- [ ] Improve weight/reps adjustment for small screens.
- [ ] Make rest countdown and vibration settings consistent with the phone.
- [ ] Provide a clear fallback if a routine is unavailable offline.
- [ ] Consider configurable quick-add set and exercise navigation.
- [ ] Verify ambient, always-on, and screen-off behavior against actual platform constraints.

---

## Phase 8 — Accessibility, localization, and inclusion

### P1.27 Accessibility

- [ ] Audit every primary screen with TalkBack and keyboard navigation.
- [ ] Add semantic labels to custom numeric controls, charts, buttons, and icon-only actions.
- [ ] Announce set completion, timer completion, sync status, and errors appropriately.
- [ ] Ensure focus moves logically when dialogs open and close.
- [ ] Support text resizing without clipping or hidden controls.
- [ ] Ensure sufficient contrast in both themes.
- [ ] Respect reduced motion.
- [ ] Provide non-color indicators for recovery and set types.
- [ ] Avoid gestures as the only way to access important actions.
- [ ] Ensure destructive swipe actions have undo or an accessible alternative.
- [ ] Test accessible tables for chart data.
- [ ] Audit form error announcements and focus placement.

### P2.28 Units and localization

- [ ] Audit lb/kg conversion and display precision.
- [ ] Test plate math with mixed plate sizes and different bar weights.
- [ ] Centralize number, date, and duration formatting.
- [ ] Avoid hard-coded assumptions about decimal separators.
- [ ] Prepare user-facing strings for localization.
- [ ] Verify imported data preserves canonical units.
- [ ] Test changes to preferred units after workouts already exist.
- [ ] Make calendar week start and time formatting locale-aware where appropriate.

---

## Phase 9 — Security, privacy, integrations, and user ownership

### P0.29 Authentication and backend security

- [ ] Audit sign-up, sign-in, password reset, Google OAuth, session expiration, and sign-out.
- [ ] Verify RLS and ownership checks on every table and server function.
- [ ] Verify foreign IDs cannot reference another user's private records.
- [ ] Audit watch-pairing and external connector authentication.
- [ ] Test token rotation, revocation, expiry, replay, and rate limits.
- [ ] Verify no provider secret is included in client bundles or APKs.
- [ ] Audit redirect URI validation and OAuth state handling.
- [ ] Review dependency vulnerabilities and security advisories.
- [ ] Add abuse protection for expensive AI and import endpoints.
- [ ] Ensure authentication errors do not leak account information.
- [ ] Review all externally callable endpoints and their authorization boundaries.

### P1.30 Data ownership and privacy

- [ ] Audit data collection and transmission by feature.
- [ ] Add a clear privacy/data screen showing enabled integrations.
- [ ] Explain which AI data leaves the device and why.
- [ ] Provide explicit disconnect and revoke controls for integrations.
- [ ] Audit account deletion and associated data cleanup.
- [ ] Define retention behavior for photos, body measurements, notes, AI logs, and connector tokens.
- [ ] Verify export includes the intended data and excludes secrets.
- [ ] Verify backup/restore behavior and validation.
- [ ] Test malformed, oversized, duplicated, or incompatible imports.
- [ ] Consider encrypted backups with a well-defined recovery/key-loss model.
- [ ] Ensure restore can preview and validate data before replacing anything.
- [ ] Avoid implying that local data is cloud-synchronized when it is not.
- [ ] Document third-party integrations and their data access.
- [ ] Review privacy policy and store disclosures before release.

### P1.31 Google Calendar and external integrations

- [ ] Audit token storage, refresh, expiry, and disconnect behavior.
- [ ] Verify event creation is idempotent.
- [ ] Test event edits, deletion, retries, and permission revocation.
- [ ] Avoid duplicate events after reinstall or delayed synchronization.
- [ ] Make failed calendar sync visible and recoverable.
- [ ] Ensure workout logging never depends on Calendar availability.
- [ ] Minimize data included in calendar event titles and descriptions.
- [ ] Clarify permissions before connecting an account.

### P2.32 External connector management

- [ ] Make connection creation, one-time secret display, rotation, and revocation clear.
- [ ] Show the user which actions the connector can perform.
- [ ] Verify read, create, and delete permissions are scoped correctly.
- [ ] Require confirmation for potentially destructive external actions where appropriate.
- [ ] Ensure connector retries cannot create duplicate workouts.
- [ ] Provide a recent activity log without exposing the secret.
- [ ] Ensure disconnect takes effect immediately.

### P2.33 Bujo ecosystem bridge — IronLog as "the body"

IronLog is "the body" in the user's app ecosystem; Bujo Tasks is the hub.

- [ ] Sign release builds with the shared Bujo release keystore; never commit, log, or hardcode the password.
- [ ] Declare the shared signature permission "com.sadiqlateef.bujotasks.permission.READ_WRITE_DATA" and enforce it on the bridge.
- [ ] Read today's planned workout from Bujo and offer one-tap logger pre-fill; handle missing, deleted, or stale tasks gracefully.
- [ ] On workout finish, write back completion (duration, total volume, PR count) attributed "source=IronLog"; check in the training habit and update goal progress.
- [ ] Make completion writes idempotent — finishing twice must not duplicate records in Bujo.
- [ ] Support the "ironlog://workout/<id>" deep link from Bujo tasks (or resume-active); land on the correct workout or a clean empty state.
- [ ] Keep IronLog fully usable with Bujo uninstalled — the bridge is enhancement, never a dependency.
- [ ] Test that a foreign-signature app is denied access to the bridge.
- [ ] Verify all transfers are local; no workout data leaves the device through this path.

Acceptance criteria:

- Finishing a workout checks in the Bujo training habit within 60 seconds, tagged "source=IronLog"; repeating finish does not duplicate it.
- A Bujo task deep link opens the correct workout.
- With Bujo uninstalled, logging works normally.
- Unauthorized caller access is rejected.

---

## Phase 10 — Performance and maintainability

### P1.33 Runtime performance

- [ ] Profile Home, Workout, Progress, exercise search, and large histories.
- [ ] Reduce unnecessary re-renders during set entry and timer updates.
- [ ] Avoid expensive chart/recovery calculations on every keystroke.
- [ ] Add indexes for verified query bottlenecks.
- [ ] Audit N+1 queries and repeated network requests.
- [ ] Keep the logger usable under slow network conditions.
- [ ] Optimize exercise media loading and image memory use.
- [ ] Avoid unnecessary background polling.
- [ ] Measure bundle size and Android package size before optimizing.
- [ ] Add performance budgets for key routes and interactions.
- [ ] Test with large histories and large custom exercise libraries.

### P1.34 Code quality

- [ ] Identify duplicate domain logic between UI, Edge Functions, and watch.
- [ ] Centralize canonical rules only where a shared contract is practical.
- [ ] Keep database types synchronized with migrations.
- [ ] Remove dead code after verifying no hidden references.
- [ ] Improve error typing and avoid swallowed exceptions.
- [ ] Add unit tests for pure domain functions.
- [ ] Add integration tests for critical database behavior.
- [ ] Document complex calculations and synchronization contracts.
- [ ] Avoid adding large dependencies for small features.
- [ ] Keep commits focused and reviewable.

### P1.35 Observability and diagnostics

- [ ] Add privacy-safe error reporting appropriate to the deployment model.
- [ ] Make failed sync and integration operations diagnosable.
- [ ] Record build version and relevant diagnostic context without sensitive data.
- [ ] Add a user-shareable diagnostic report with explicit preview and consent.
- [ ] Avoid logging raw notes, tokens, photos, or full workout payloads unnecessarily.
- [ ] Document support and recovery procedures.

---

## Phase 11 — Backup, portability, and long-term trust

### P1.36 Backup and restore

- [ ] Audit current export format and schema versioning.
- [ ] Ensure export contains all intended workouts, sets, routines, programs, and custom exercises.
- [ ] Decide explicitly whether photos, measurements, notes, and integration settings are included.
- [ ] Never export active secrets or session tokens.
- [ ] Validate import before writing data.
- [ ] Make restore atomic or recoverable.
- [ ] Prevent accidental duplicate imports.
- [ ] Provide conflict resolution when importing into a non-empty account.
- [ ] Test backups from previous supported versions.
- [ ] Add a clear backup date and validation summary.
- [ ] Document migration and compatibility guarantees.

### P2.37 Portability and user control

- [ ] Make workout history exportable in a readable format.
- [ ] Provide structured data export for analysis.
- [ ] Allow export of selected date ranges where appropriate.
- [ ] Clarify what is local-only versus server-synced.
- [ ] Ensure account deletion and data export do not depend on AI.
- [ ] Document how users move to a new phone or watch.
- [ ] Test restore after reinstall and account reauthentication.

---

## Phase 12 — Optional high-value product expansion

These features should be considered only after core reliability and UX are strong.

### P2.38 Advanced workout tools

- [ ] Rest-pause and myo-rep set types if the data model can represent them correctly.
- [ ] Better tempo and pause tracking.
- [ ] Custom warm-up templates by lift.
- [ ] Configurable superset/circuit templates.
- [ ] Plate calculator improvements for limited plate inventory.
- [ ] Barbell setup visualization.
- [ ] Exercise-specific target ranges and notes.
- [ ] Training max and percentage-based load tables.
- [ ] Personal exercise history comparison.
- [ ] Session templates for quick-start workouts.

### P2.39 Training review and reflection

- [ ] Weekly review with completed sessions, goals, and trend summaries.
- [ ] Optional perceived effort and energy trends.
- [ ] User-written training notes and searchable reflections.
- [ ] Compare planned versus performed training.
- [ ] Highlight meaningful changes without overinterpreting noise.
- [ ] Allow users to correct or dismiss generated observations.
- [ ] Keep reflection data private and exportable.

### P3.40 More advanced analytics

- [ ] Training block comparison.
- [ ] Rep-max trend by exercise.
- [ ] Training frequency and volume distribution.
- [ ] Estimated strength trend confidence indicators.
- [ ] Plateaus based on configurable definitions.
- [ ] Custom dashboards and saved chart filters.
- [ ] CSV export for training history.
- [ ] Compare program adherence across blocks.
- [ ] Optional fatigue and readiness journaling.
- [ ] Clearly label assumptions and avoid universal fitness prescriptions.

### P3.41 Integrations and platform extensions

- [ ] Evaluate Health Connect support and required permissions.
- [ ] Import supported training histories from other apps.
- [ ] Improve watch complication/tile access if supported by the chosen architecture.
- [ ] Consider richer wearable data only when permissions and battery implications are justified.
- [ ] Consider additional calendar providers only if users need them.
- [ ] Add external integrations through explicit, revocable permission boundaries.
- [ ] Do not add cloud sync or social features merely for parity with competitors.

### P3.42 Optional motivation and sharing

- [ ] Configurable milestone badges.
- [ ] Shareable workout cards with privacy controls.
- [ ] Optional personal challenges.
- [ ] Non-punitive consistency summaries.
- [ ] Personal records timeline.
- [ ] Optional weekly training recap.
- [ ] Avoid manipulative streaks, forced sharing, or public exposure of body metrics.

---

## Phase 13 — Release readiness and ongoing quality

### P0.43 Release gate

- [ ] Confirm baseline and all phase-specific tests pass.
- [ ] Run unit tests, typecheck, lint, production build, and relevant integration tests.
- [ ] Verify migrations and backend function versions.
- [ ] Verify Android and watch builds where applicable.
- [ ] Verify app versioning and release notes.
- [ ] Verify signing keys and secrets are stored safely.
- [ ] Confirm release artifacts are reproducible and correctly labeled.
- [ ] Test fresh install and update over an existing installation.
- [ ] Review app permissions and data safety declarations.
- [ ] Review privacy notice and external-provider disclosures.
- [ ] Verify account deletion and data export paths.
- [ ] Perform a final security and dependency review.
- [ ] Record actual device-test results.
- [ ] Confirm known issues and limitations are disclosed.

### P1.44 Regression and automation

- [ ] Establish a reliable CI gate for unit tests, typecheck, lint, and build.
- [ ] Add regression tests for every confirmed critical bug.
- [ ] Add database/RLS tests for authorization-sensitive features.
- [ ] Add synchronization tests for duplicate, retry, and conflict scenarios.
- [ ] Add browser tests for the most important user journeys.
- [ ] Add Android device/emulator tests for critical native behavior where feasible.
- [ ] Add watch tests for shared state contracts and logging behavior.
- [ ] Add accessibility checks and manual audit checklists.
- [ ] Add visual regression coverage for stable high-value screens.
- [ ] Keep CI secrets scoped and unavailable to untrusted code paths.

---

## Definition of Done

A backlog item is complete only when:

1. The current implementation and intended behavior are understood.
2. Acceptance criteria are explicit and satisfied.
3. The change is integrated into the actual user workflow.
4. Tests cover success, failure, and relevant edge cases.
5. Relevant type, lint, unit, build, and integration checks pass.
6. Data migrations and existing records are handled safely.
7. Web, Android, and Wear OS impact is reviewed.
8. Security, privacy, and external data flow are reviewed where relevant.
9. Accessibility and responsive behavior are checked.
10. Documentation accurately reflects the shipped behavior.
11. The master agent reviews the actual diff independently.
12. Device checks and unverified items are explicitly recorded.
13. The phase history is updated.

## Final prioritization rule

Fix confirmed data-loss, security, synchronization, and release-blocking defects first. Then make workout logging faster and more dependable. Next improve usability, accessibility, and the visual system. Only then invest heavily in new analytics, AI, and optional integrations.

IronLog should earn trust through correctness and thoughtful design—not through feature count alone.
