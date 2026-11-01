# IronLog notes (2026-11-01). Full detail: `HANDOFF.md`. Older review: `REVIEW.md`, `FIX_PLAN.md`.

## Decisions
- Personal use only: one user, Galaxy Z Fold8 (folded and unfolded) and Galaxy Watch, sideloaded.
- Fix before features: the finish-workout fix lands and is verified on the phone before any feature work.
- The 21 approved features are the ceiling. Nothing new without Sadiq's say-so (Oct 28-29 additions await his ruling).
- Cloud-backed (Supabase) with offline logging (2026-10-25). Weights stored in kg. Release builds use the Bujo key from the PC.
- Never orphan workout history in a schema change. Install with `adb install -r`, never uninstall.

## Verified on my phone
- Watch links to the phone (Sadiq, 2026-10-25, phone 2.0.0 / watch 1.0.0).
- Nothing else on the current build. Headless-browser results are under bugs below.

## Known bugs / half-finished
- Finish-workout bug (Sadiq, Oct 22/23): fixes merged (8ee1e56, a3afa77, 78b4db1), NOT verified on the phone.
- Server still has an open workout from 2026-10-28 (0 sets ticked). Ask Sadiq.
- Possible remaining causes: the outbox drops refused changes; starting offline while another workout is open (INFERRED).
- Lint: 7 errors from the Oct 28-29 commits. Tests 303/303, build, typecheck, smoke 36/36 pass (browser only, not phone).
- Volume mismatches: Bujo total counts warm-ups; one-side sets differ between live header and saved total.
- Watch offline plan has fake exercise ids. Watch set → phone not tested. 11 unused lib modules.
- Installed build on the Fold8: unknown since 2026-10-29 (last known 010e968). Version stuck at 2.0.0.
- Oct 23-25 phone-only workouts: upload never confirmed. No backup file known to exist.
- Fold8 layouts and the Oct 16 checklist: all still NEEDS-DEVICE-TEST (HANDOFF section 9).

## Next
- Prove or fix the finish-workout lifecycle on the Fold8 (HANDOFF section 11). No feature work before that.
