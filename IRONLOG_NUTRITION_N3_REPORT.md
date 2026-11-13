# IronLog nutrition, Phase N3 report (barcode scan)

Baseline `8b23046` (N2). Everything below is built and tested locally. No migration in N3, and nothing was applied to the live database.

## Stages

| Stage | SHA | Files | What is proven |
|-------|-----|-------|----------------|
| N3.1 plugin, pure barcode rules, scanner wrapper, camera rationale | `7991d9c` | `package.json`, `package-lock.json` (`@capacitor-mlkit/barcode-scanning` pinned `8.2.1`), `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`, `src/lib/nutrition/barcode.ts`, `src/lib/barcode-scanner.ts`, `src/lib/rationale.ts`, `tests/nutrition-barcode.test.ts` | 19 tests: cleaning junk input, GS1 check digits (EAN-13, UPC-A, EAN-8 vectors worked by hand), UPC-E expansion, one key for UPC-A / EAN-13 with leading 0 / GTIN-14, Open Food Facts lookup forms, local match ignores archived foods and prefers your own, "pending food" rule. No CAMERA permission added (Google's scanner needs none). |
| N3.2 lookup flow and scan sheet | `c3ca27d` | `src/lib/nutrition/barcode-lookup.ts`, `src/components/food/scan-sheet.tsx`, `src/components/food/add-food-screen.tsx`, `src/lib/barcode-scanner.ts` | 16 tests: phone match makes no network call, UPC-A finds a stored EAN-13, 12-digit then 13-digit OFF tries, not found, offline makes no calls, rate limit gives a message with no URL, network failure acts like offline, a typo'd check digit warns but still looks up. |
| N3.3 create from barcode, offline pending food, enrichment | `0e13f68` | `src/lib/nutrition/enrich.ts`, `src/hooks/use-barcode-enrichment.ts`, `src/components/food/{custom-food-sheet,add-food-screen,scan-sheet,diary-screen}.tsx`, `tests/nutrition-enrich.test.ts` | 10 tests: pending food shape, enrichment keeps the id, skips a food you renamed meanwhile, skips when the product is already a food on the phone, batch cap and once-per-session rule. |
| N3.4 polish, web fallback and report | (this commit) | `src/lib/offline/nutrition-store.ts` (`findFoodBySource`), `src/hooks/use-barcode-enrichment.ts`, `src/components/food/{scan-sheet,add-food-screen}.tsx`, `tests/nutrition-store.test.ts`, `scripts/smoke-test.mjs`, this report | 2 new tests (server-only duplicate found and copied to the phone; none / offline-unknown / self ignored). Smoke test 82/82 including 9 new barcode checks per phone width. |

Unit tests: 492 pass (490 after N3.3, plus 2).

## The enrichment fix in N3.4

Risk left by N3.3: before turning a pending food into an Open Food Facts food, the duplicate check only looked at foods on the phone. The phone keeps at most 500 foods, so the same product could exist only on the server; the update would then hit the server's "one food per source and id" rule, and a refused change pauses the food sync queue.

Fix (the smaller of the two options, no change to the queue): a new store helper `findFoodBySource(source, sourceId, exceptId)` checks the phone's list and then asks the server. The enrichment hook calls it right before saving:
- another food already has that product: the pending food is left as it is (the same "duplicate" skip N3.3 does for phone matches), and the server's food is copied to the phone so the next scan finds it there;
- none: the pending food is filled in;
- the server can't be asked (offline, error): nothing is written, and the food is tried again on the next pass.

## Web fallback (proven in a headless Chrome)

The scanner plugin is loaded only inside the scan functions (`import()` in `src/lib/barcode-scanner.ts`), and they return "not available" on the web before loading it. On the web the scan sheet has no camera button; it shows the typed-barcode field and the line "Camera scanning works in the Android app."

`scripts/smoke-test.mjs` now also checks, at 412 px and 884 px wide, with every Open Food Facts call answered "not found" (no real network calls):
1. The scan button opens the sheet; no camera button; the Android-app line shows.
2. Junk ("12ab") shows the "doesn't look like a barcode" hint.
3. Closing the sheet puts focus back on the scan button.
4. An unknown code shows "No product found" and Create food; Create food opens the custom food sheet with the barcode filled in; the food lands in the diary.
5. The same code typed in its 14-digit form finds that food on the phone and opens the amount sheet.
6. Offline, a new code offers to save it for later; "Save only" stores "Unknown product (code)" on the phone.

Codes used are in-store numbers (prefix 20), never real products.

## Polish in N3.4

- Scan sheet: bottom padding respects the phone's gesture bar; button rows wrap with large text; the camera button grows with its label; the status line is announced to screen readers; a failure message is an alert; an unexpected lookup error shows "Couldn't look that up" instead of a stuck spinner; focus returns to the scan button when the sheet closes.
- Add food: typing a barcode into the search box now matches a saved food in any of its forms (UPC-A, EAN-13 with a leading 0, GTIN-14), and the empty state mentions scanning.
- All buttons in the sheet are at least 44 px tall.

## Gates at this commit

`npm test` 492/492; `npx tsc --noEmit` 0 errors; `npm run lint` 0 errors; `npm run build` succeeds with `/food/` and `/food/add/` in `out/`; fence diff vs `657bd57` empty for `src/lib/offline/queue.ts`, `src/components/sync-banner.tsx`, `tests/real-db/finish.test.ts`, `tests/outbox-pending.test.ts`.

## How to try it on the phone

1. Build and install the Android app as usual (`npm run android:sync`, then run it from Android Studio). The scanner only works in the Android app, not in a browser.
2. Open Food (More, then "Food diary"), tap "+ Add" on a meal.
3. Tap the barcode button to the right of the search box.
4. Tap "Scan with camera". The first time, the phone may show "Getting the scanner ready" while Google downloads the scanner (needs internet once).
5. Point the camera at the barcode on a food package. When it reads it, IronLog looks for the food: first on your phone, then on Open Food Facts.
6. If it is found, choose the amount and tap "Add to ...".
7. If it is not found, tap "Create food". The barcode is already filled in. Type the label's numbers and save. Next time the scan finds it straight away.
8. No camera handy? Type the numbers under the bars into "Barcode numbers" and tap "Look up".
9. Offline (airplane mode): after a scan, tap "Save and log it" or "Save only". It is saved as "Unknown product (numbers)". When you are back online and open the food diary, the name and nutrition fill in by themselves. Entries you already logged keep the amounts they had.

## NEEDS-DEVICE-TEST (Fold8, inner and cover screens; none of this can be proven on the web)

1. Real scans on the inner screen and the cover screen: an EAN-13 (grocery), a UPC-A (US import) and a UPC-E (small can). The system scanner is full screen and returns to the IronLog sheet on both screens. Fold or unfold while the scanner is open.
2. Google scanner module download on first use: wording and time of "Getting the scanner ready"; with airplane mode ON at first use it must fall back to typing, not hang.
3. App killed mid-scan (Android reclaims memory while the scanner is open): when IronLog restarts, the scan should still arrive and the sheet reopens with the lookup.
4. Cover screen: scan sheet, not-found text and the barcode field fit with the keyboard open; no sideways scroll.
5. Camera permission: whether `scan()` asks for it at all on this phone; if it does, the IronLog explanation card shows first; deny, allow in Android settings, retry.
6. Torch, low light and a damaged barcode (the "may have a typo" warning).
7. Offline pending food: airplane mode, scan, save and log; back online, open the diary; the name turns real within about 10 seconds and the old entry keeps its numbers.
8. Back button during the scanner and during each sheet state: closes the sheet first, no stuck overlay.
9. A UPC-A product that Open Food Facts only has under its 13-digit form.

## Known limits

- Entries logged against a pending food keep their original (incomplete) numbers after it fills in. Deliberate; re-scoring old entries is out of scope.
- When the product is already saved as another food, the pending food stays "Unknown product" (no automatic merge). You can log the real food instead and archive the pending one.
- Each pending food is looked up once per app session; a product Open Food Facts does not know stays pending until the next app start.
- The sheet's close (X) button is the shared dialog's, smaller than 44 px; the sheet also closes with the back button or a swipe outside.
- Open Food Facts lookups over the real network were not run (smoke test answers them "not found"); covered by unit tests with fakes.
- Nothing in this report is device-verified.
