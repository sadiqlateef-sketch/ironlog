# IronLog nutrition, Phase N2 report (food diary)

Baseline `34ac5ba` (N1). Everything below is built and tested locally. Nothing was applied to the live database.

## Stages

| Stage | SHA | Files | What is proven |
|-------|-----|-------|----------------|
| N2.1 data model and pure logic | `ba9f634` | `supabase/migrations/20261112000000_nutrition_diary.sql`, `src/lib/nutrition/{day,diary-types,entry-math,staples}.ts`, `src/types/database.ts`, `tests/nutrition-{day,math,migration,staples}.test.ts`, `tests/real-db/nutrition.test.ts` | Unit conversions, per-100 scaling, "unknown" propagation into totals, food-day rule (incl. night-shift start, DST), meal windows, prefs cleanup, empty staples mechanism. Migration text checked for RLS, own-row policies, no anon grants. Real-DB isolation test skips without a DB. |
| N2.2 outbox and phone store | `5235ff3` | `src/lib/offline/nutrition-{outbox,store}.ts`, `src/hooks/use-nutrition-sync.ts`, `auth-provider.tsx` (sign-out wipe), `mock-backend.ts` (2 profile fields), `tests/nutrition-{outbox,store}.test.ts` | Offline keeps entries, reconnect sends in order with no duplicates, a refused head is kept and blocks later sends, auth error refreshes session, sign-out empties the nutrition queue, the workout queue key is never touched. |
| N2.3 settings | `ab1fef5` | `key-store.ts`, `search-service.ts`, `nutrition-settings.tsx`, `meal-slots-sheet.tsx`, `nutrition-sync-chip.tsx`, `use-nutrition-prefs.ts`, `settings-screen.tsx`, `tests/nutrition-key.test.ts` | USDA key never shown in full, redacted from errors, not in backup/export, outbox or kv. |
| test fix | `ac1a0e1` | `tests/live-workout-flow.test.ts`, `tests/wger-takes.test.ts` | See below. |
| N2.4 diary, quick add, nav, Home card | `ecb5c1e` | `src/app/food/page.tsx`, `src/components/food/{diary-screen,totals-card,meal-section,entry-row,entry-sheet,meal-chips,quick-add-sheet}.tsx`, `use-nutrition-day.ts`, `home/nutrition-card.tsx`, `display.ts`, `nav.ts`, `app/page.tsx`, `tests/nutrition-display.test.ts` | Display formatting tested. Screens proven by the smoke test. |
| N2.5 add food | `f83d026` | `src/app/food/add/page.tsx`, `src/components/food/{add-food-screen,amount-sheet,custom-food-sheet,food-result-row}.tsx` | Smoke test adds a custom food with an amount and checks the diary total. |
| N2.6 smoke test and report | (this commit) | `scripts/smoke-test.mjs`, `NOTES.md`, this report | 62/62 smoke checks on both phone widths. |

## Owner decisions applied

1. Meal slots are editable with time windows; four seeded (Breakfast 06-10, Lunch 10-15, Dinner 15-21, Snacks all day).
2. USDA key is pasted in Settings and lives only on the phone (localStorage). Never synced, logged, or backed up.
3. "My food day starts at" is a setting (default 00:00 = normal calendar day).
4. Separate nutrition queue (`nutrition-outbox.ts`). The workout queue and sync banner are unchanged (byte-identical, imported only).
5. Navigation: More has a "Nutrition" section, plus a Home card. The tab bar still has 4 tabs.
6. Staples: the seeding mechanism exists, the list is empty. No nutrient value was invented anywhere.

## The test-fix commit (`ac1a0e1`)

Three old type errors in two test files (two in `live-workout-flow.test.ts`, one in `wger-takes.test.ts`) made `tsc` fail and also broke `npm run build`. They were fixed with tiny test-only changes so "zero type errors" and a working build could be real gates. No app code changed.

## Migration

File: `supabase/migrations/20261112000000_nutrition_diary.sql` (adds `foods`, `food_entries`, and two profile columns).

**NOT deployed — owner deploys via the manual workflow; until then food changes are refused and kept on the phone with a message.** The message reads: "The database hasn't been updated for food yet. Run "Deploy database and functions" on GitHub, then tap Retry." The diary still works on the phone meanwhile.

## How to try it (beginner steps)

1. Open the app and sign in. On Home, scroll down to the "Food today" card and tap "Log food" (or open More, then "Food diary").
2. Tap the three dots at the top right, then "Quick add". Type a name (for example "Toast") and calories (for example 150). Tap "Add to ...". It appears in a meal and the big total updates.
3. Back out and tap "+ Add" on a meal. Tap "Add your own food", fill in the name and calories, protein, carbs and fat per 100 g from a label, and tap "Save and choose amount". Type how many grams you ate and tap "Add to ...".
4. Look at the Food total at the top of the diary, and at the Home card.
5. Use the arrows beside "Today" to look at other days. Tap an entry to change the amount, move it to another meal, or delete it.
6. Open Settings and scroll to Nutrition. Set "My food day starts at" (for night shifts, try 04:00), paste a free USDA key if you want USDA search, or edit your meal names and times.
7. Turn on airplane mode and add something. It shows at once. A small note says changes are waiting. Turn airplane mode off and the note goes away. Until the database update is deployed, you will instead see the "database hasn't been updated" note with Retry and Discard buttons.

## What was NOT verified

- Anything on the real device (Fold8, Android build, CapacitorHttp search). Only a headless Chrome at phone width was used.
- The live database: no migration run, no real sync, no real RLS check (the real-DB test is written but skipped without a database).
- Open Food Facts and USDA over the network (not tested; offline path and local foods only).
- Barcode scanning (not built; the screen says it arrives later).

## Known limits

- Staples list is empty by design. Search and your own foods are the only sources for now.
- The USDA key survives sign-out on purpose (it belongs to the phone, not the account). Use "Remove key" in Settings.
- Navigation entries (More, search, tab highlight) are covered by the smoke test, not unit tests.
- Quick-add entries mark unspecified nutrients as unknown, so day totals for fiber, sugars, sodium show a dash or "≥" once a quick entry exists.
- Amounts use number boxes with minus/plus buttons, not the workout keypad.

## Gates at the final commit

- `npm test`: 445 pass, 0 fail (365 at baseline plus 80 new).
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors (69 old warnings, none in N2 files).
- `npm run build`: succeeds; `/food/` and `/food/add/` are in `out/`.
- `node scripts/smoke-test.mjs` (built with no `.env` files): 62/62.
- Fenced files (`queue.ts`, `sync-banner.tsx`, `tests/real-db/finish.test.ts`, `tests/outbox-pending.test.ts`) identical to baseline.
- No API key committed. `DEMO_KEY` only appears as text in the old N1 report.
