# IronLog notes

Full review (2026-10-25): see `REVIEW.md`. Mockups and screenshots: project files `ironlog-review/`.

## Decisions
- Personal app: one user, Galaxy Z Fold8 (folded + unfolded) and Galaxy Watch.
- Nothing from the review gets built until Sadiq approves it item by item (REVIEW.md section 7).
- 2026-10-25: Sadiq chose cloud-backed again (Supabase), with offline logging kept. The app has been phone-only since Oct 23 (mock backend).
- Theme is now ruby/gold "Cosmic Ruby" (replaced the Oct 14 navy glass look).

## Verified on my phone
- (Nothing verified from this review yet. Add items here after testing on the Fold8.)

## Done (awaiting phone check)
- D1 cloud-backed again, D2 previous-day workout, D3 one open workout, D8 lint/typecheck, D10 APK build.
- D5 watch weight, D6 periodization off by default, D7 warm-up rows, D4 failed saves shown (in PR, not yet on the phone).
- Batch 3 (Phases 11-18, merged): logger dock, header volume, plates, set notes, AMRAP + tempo (database deployed 2026-10-25), Home header, "Programs" naming, Progress colours. Phase 11 needs a one-handed phone check.
- Batch 4 (merged): P1 two-column Home when unfolded (Phase 19), P2 Progress summary first (20), P3 two missed sessions drop the weight 10% (21), P4 circuit mode (23), P7 old agent files archived to `docs/archive/` (25). Check Home and Progress folded and unfolded on the Fold8.

## Known bugs / half-finished
- Keystore password still written in the Gradle files (D9, FIX_PLAN Phase 10, needs Sadiq's OK).
- Open PRs not on main: #22 deload weeks (#18 reset email and #20 Health Connect are merged; they need the Supabase redirect URL and an APK rebuild).
- Local PC builds need real Supabase settings in `.env.production.local` (placeholders cause "Failed to fetch").

## Next
- Phase 10 (keystore password out of the Gradle files) is skipped until Sadiq says go.
- Phase 24 (below) waits for Sadiq's yes before anything is built.

### Bujo Tasks reads "today's plan" from IronLog (Phase 24, built)
Today IronLog only pushes finished workouts out. This adds the reverse: Bujo Tasks can show what IronLog plans for today.
- **Table:** a new `today_plan` table in `IronLogContentProvider` (one row per date): `date`, `routineName`, `programName`, `week`, `day`, `exercisesJson` (name, sets, reps, weight), `updatedAt`. The provider's `DB_VERSION` must be bumped, because `onUpgrade` only re-runs `CREATE TABLE IF NOT EXISTS`. New URI: `content://com.ironlog.app.provider/today_plan`.
- **Writing:** Home pushes the plan whenever the active program changes (and when the app opens) through `IronLogEcosystemPlugin`, like `upsertWorkoutRecord`: a new plugin method `upsertTodayPlan` called from `src/services/ironlogEcosystemSync.ts`. It sends `program.next_routine_name`, the week and day, and the exercise list from `getRoutineTargets`. A rest day or no program writes a row with an empty list.
- **Reading:** Bujo Tasks queries the URI (read-only, same signature permission as the other tables). It shows today's workout name on the Gym task and lists the exercises in the task's detail. Nothing is written back; finishing the workout still uses `completeBujoWorkoutAndWaterOak`.
- **Decisions (defaults, easy to change):** weights are included (`weightLb`, null when the routine has none). Older rows are deleted each time a new day is written, so a skipped day never shows up; Bujo should only read the row whose `date` is today. Needs an APK rebuild; `DB_VERSION` is now 2.
