# IronLog notes

Full review (2026-10-25): see `REVIEW.md`. Mockups and screenshots: project files `ironlog-review/`.

## Decisions
- Personal app: one user, Galaxy Z Fold8 (folded + unfolded) and Galaxy Watch.
- Nothing from the review gets built until Sadiq approves it item by item (REVIEW.md section 7).
- 2026-10-25: Sadiq chose cloud-backed again (Supabase), with offline logging kept. The app has been phone-only since Oct 23 (mock backend).
- Theme is now ruby/gold "Cosmic Ruby" (replaced the Oct 14 navy glass look).

## Verified on my phone
- (Nothing verified from this review yet. Add items here after testing on the Fold8.)

## Known bugs / half-finished
- All sign-in, data and AI calls are answered by `src/lib/supabase/mock-backend.ts`; cloud history not shown.
- Previous-day workout: Resume does nothing; closing the prompt deletes it; workouts vanish at midnight.
- Two open workouts: finishing one opens the other (no one-active rule locally).
- Watch-logged weight dropped on the phone (`weight_kg` vs `weight`).
- Periodization auto-apply on by default, rewrites program targets.
- Planned warm-up rows prefill 0 weight. Lint has 4 errors.
- Phone APK build on GitHub Actions is red: debug build signs with a release key path on the PC.
- Open PRs not on main: #18 reset email, #20 Health Connect, #22 deload weeks.

## Next
- Follow FIX_PLAN.md phase by phase (Phase 1 D10 done in 6fa4408). Test checkpoint after every phase: `node scripts/smoke-test.mjs`.
