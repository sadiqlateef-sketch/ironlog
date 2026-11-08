# IronLog notes (2026-11-08). Full detail: `HANDOFF.md`. Older review: `REVIEW.md`, `FIX_PLAN.md`.

## Decisions
- Personal use only: one user, Galaxy Z Fold8 (folded and unfolded) and Galaxy Watch, sideloaded.
- Fix before features: the finish-workout fix lands and is verified on the phone before any feature work.
- The 21 approved features are the ceiling. Nothing new without Sadiq's say-so (Oct 28-29 additions await his ruling).
- Cloud-backed (Supabase) with offline logging (2026-10-25). Weights stored in kg. Release builds use the Bujo key from the PC.
- Never orphan workout history in a schema change. Install with `adb install -r`, never uninstall.

## Verified on my phone
- Watch links to the phone (Sadiq, 2026-10-25, phone 2.0.0 / watch 1.0.0).
- Nothing else on the current build. Headless-browser results are under bugs below.

## Nov 7-8 review fixes (PRs #44-#50, merged; NOT yet verified on the phone)
- #44 Finish-workout: `hasPending()` was stale since Oct 16 (read the outbox as at app start), so a queued Finish looked synced and the server's open copy came back. Fixed. The outbox no longer deletes refused changes: it pauses with a Retry / Discard banner. Finish checks the row really closed. `npm run test:db` runs finish tests against a real local Supabase.
- #45 Lint errors fixed (What-If sheet re-fetch loop); CI runs lint + tests. #46 Version = 2.1.<commit count>, shown in Settings.
- #47 Partner sync and 11 unused modules removed. #48 Watch: fake offline plan removed; refused changes kept. #49 Volume: one rule everywhere (weaker side for one-side sets, no warm-ups). #50 Two trigger functions no longer callable via the API.

## Known bugs / half-finished
- Finish-workout fix (#44) needs Sadiq's phone check: start, log a set, Finish, force-close, reopen.
- Server still has an open workout from 2026-10-28 (0 sets ticked). Ask Sadiq. No workouts reached the server Oct 28 - Nov 7 though the phone signed in Nov 1 and Nov 4.
- Watch set → phone not tested.
- Installed build on the Fold8: unknown since 2026-10-29 (last known 010e968). Builds from #46 on show their version in Settings.
- Oct 23-25 phone-only workouts: upload never confirmed. No backup file known to exist.
- Fold8 layouts and the Oct 16 checklist: all still NEEDS-DEVICE-TEST (HANDOFF section 9).

## Next
- Prove or fix the finish-workout lifecycle on the Fold8 (HANDOFF section 11). No feature work before that.
