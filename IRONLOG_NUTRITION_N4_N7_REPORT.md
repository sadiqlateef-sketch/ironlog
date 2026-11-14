# IronLog Nutrition — N4 to N7 report (2026-11-14)

Built on `main` from 9deadf5 to d5cd017, one commit per stage, every stage gated (npm test green, tsc 0 errors, lint 0 errors, build OK, fenced files byte-identical to 657bd57). Tests: 516 → 655. Release **2.1.211** installed on the Fold8 with `adb install -r` (same signing cert, no data wiped).

## What was built

| Stage | Commit | What |
|---|---|---|
| N4.1 | 308df4c | Kitchen data layer + migration `20261114000000_nutrition_kitchen.sql`; schema check keeps writes to not-yet-deployed tables on the phone; outbox `shapeOp` hook drops undeployed columns |
| N4.2 | a6a477e | Recipes (ingredients as jsonb), log a serving in one tap |
| N4.3 | 4af51d0 | Meal-prep batches and pantry (scan into pantry) |
| N4.4 | dbb9a7e | Usuals grouped by place, restaurant pre-log ("Plan it") |
| N5.1 | 3749c3f | Goals model: training/rest day, bulk/cut phase, weekly calorie banking; migration `20261114010000_nutrition_logs.sql` |
| N5.2 | 8732bb8 | Goals screen, goal bars, protein spread across meals |
| N5.3 | 7f06df8 | Water, supplements, caffeine (opt-in cutoff reminder), fasting window |
| N6.1 | 1b54e1e | Day view next to workouts, day story, shift-driven food day |
| N6.2 | 74f6c82 | Post-workout fuel prompt (finish-summary UI only), evening nudge, shift fuel plan |
| N6.3 | 8987f1b | Week report, logging streak, clinician CSV export, `content://com.ironlog.app.provider/nutrition` |
| N7.1 | fb6184f | Voice logging (on-phone parsing, confirm before logging), photo capture inbox (photos stay on the phone) |
| N7.2 | a1c739e | Protein per dollar, use-soon leftovers, Student lens + quiz (cited, "Educational, not medical advice") |
| N7.3 | d5cd017 | Home-screen widget (deep link to Add food) |

Earlier the same day: phone-test fixes and quick-log extras (861c4f4, 68e9456, 18a8783, 9deadf5).

## Checked on the phone (2.1.211)
Food diary, Goals, Recipes, Pantry, Day view, Week, Inbox and Student lens pages all open and render. Earlier builds verified quick add, live Open Food Facts search, barcode lookup, the Google scanner (a real scan was made by the owner), Settings → Nutrition and delete.

## Not yet verified (needs the owner or the live database)
- Anything that saves to the server: all nutrition migrations (`20261112000000`, `20261114000000`, `20261114010000`) are **not deployed**; food changes wait on the phone until the "Deploy database and functions" workflow runs.
- Week page showed "Loading…" during the short check; re-check after deploy.
- Dictation, photo capture, notifications (caffeine cutoff, evening nudge, leftovers), the widget on home and cover screens, the CSV share sheet, the provider query, the finish-screen layout.

## Deferred on purpose (needs the owner's decision)
Cloud AI routes (plate estimate, AI voice/photo parsing, nutrition in the Claude weekly recap) and cloud label OCR; progress-photo location; grocery list destination; Basecamp card; staples list content; widget on the cover screen; Health Connect nutrition writes.
