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

## Known bugs / half-finished
- Watch-logged weight dropped on the phone (`weight_kg` vs `weight`).
- Periodization auto-apply on by default, rewrites program targets.
- Planned warm-up rows prefill 0 weight.
- Open PRs not on main: #18 reset email, #20 Health Connect, #22 deload weeks.
- Local PC builds need real Supabase settings in `.env.production.local` (placeholders cause "Failed to fetch").

## Next
- Follow FIX_PLAN.md phase by phase (Phases 1-5 done). Test checkpoint after every phase: `node scripts/smoke-test.mjs`.
