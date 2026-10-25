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
- Batch 3 (Phases 11-18, in PR): logger dock, header volume, plates, set notes, AMRAP + tempo (needs Deploy database and functions), Home header, "Programs" naming, Progress colours. Phase 11 needs a one-handed phone check.

## Known bugs / half-finished
- Keystore password still written in the Gradle files (D9, FIX_PLAN Phase 10, needs Sadiq's OK).
- Open PRs not on main: #18 reset email, #20 Health Connect, #22 deload weeks.
- Local PC builds need real Supabase settings in `.env.production.local` (placeholders cause "Failed to fetch").

## Next
- Follow FIX_PLAN.md phase by phase (Phases 1-9 and 11-18 done; Phase 10 skipped for now). Test checkpoint after every phase: `node scripts/smoke-test.mjs`.
