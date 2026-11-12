# IronLog × FoodYou — Nutrition Module Map

**Study only.** This document builds nothing and authorizes nothing. It is the working spec that the nutrition build scripts would be written from, once the owner has answered the DECISIONS list at the end.

- **IronLog baseline:** `main` at `657bd5782a1d48db4b0e5a7450ff837858c18054` ("docs: add wger takes implementation report", 2026-11-09). Local `main` is 0 ahead / 0 behind `origin/main` (checked after `git fetch` on 2026-11-12).
- **Donor:** FoodYou, `https://github.com/maksimowiczm/FoodYou`, commit `00637df98ef36b6503e796f7d5152275b201022b` ("chore: release 3.4.9 (#427)", 2026-06-27). License GPL-3.0 (`LICENSE`). Cloned to `C:\Users\sadiq\Projects\_donors\foodyou`.
- **What transfers:** API contracts, nutrient IDs and field names, data shapes, diary math, described in my own words and re-expressed in IronLog's TypeScript + Supabase stack. No FoodYou Kotlin is copied here or anywhere in IronLog.
- **Convention:** FoodYou paths are relative to `app/src/commonMain/kotlin/com/maksimowiczm/foodyou/` unless they start with `shared/` or `app/`. IronLog paths are relative to the IronLog repo root.
- **Out of scope:** owner features 18 (exam-week mode), 24 (shared table) and 27 (electrolyte watch) were rejected on 2026-11-12. They are not planned anywhere below.

---

## Step 0.5 — Outstanding IronLog work, classified

The nutrition design depends on the offline and RLS rows, so "what the code shows" and "what only the live project or the phone can prove" are kept apart.

| Item | Status | What the code shows | What it cannot show |
|---|---|---|---|
| **#44 finish-workout device test** | **NEEDS-DEVICE-TEST** | The fix is merged (`f412dac`). `hasPending()` now reads the live outbox (`src/lib/offline/queue.ts`, `hasPending`), refused changes are kept with Retry/Discard instead of deleted (`flush`, `discardRefused`), and `finish` verifies the row really closed (`sendOnce`, case `"finish"`, throws `finish_missing`). `NOTES.md:14-20` records "merged; NOT yet verified on the phone" and the test steps (start, log a set, Finish, force-close, reopen). | Whether it works on the Fold8. `NOTES.md:8` and `NOTES.md:27-28` make this a gate: "Fix before features … No feature work before that." **Nutrition Phase N1 cannot start until this row is RESOLVED** (see section 6). |
| **Offline mode** | **RESOLVED in code for workout logging only; NEEDS-DEVICE-TEST** | Workout logging is offline-first: the workout in progress is mirrored in IndexedDB (`src/lib/offline/workout-store.ts:1-5`, key `active-workout`), every change goes to an ordered outbox in IndexedDB (`src/lib/offline/queue.ts`, key `outbox`) that retries on reconnect, on screen return and every 20 s, with id-based upserts so retries cannot duplicate. Reads fall back to the last cached answer via `cachedRead` (`src/lib/offline/cache.ts`), used for exercises, last/earlier performance, prefs, routines, programs, progress and the workout log (`src/lib/workout-api.ts:31,60,73,105,155,189,316,334,347,552`) and the profile (`src/components/providers/auth-provider.tsx:63`). **The outbox only knows two tables:** `type Table = "workout_sessions" \| "workout_sets"` (`queue.ts:13`). Everything else writes straight to Supabase with no queue, e.g. body measurements and photos (`src/lib/body-api.ts:28-75`). | Whether it behaves on the phone with no signal. The "critical gap" in the owner's backlog is accurate for everything that is not a workout. |
| **RLS on Supabase tables** | **RESOLVED in code; CANNOT TELL live** | Every table created in `supabase/migrations/` enables RLS (`20261013000000_initial_schema.sql:328-334` and each later `create table`), and the lockdown migration revokes everything from `anon`, restricts policies to `authenticated`, and makes every foreign reference "must be yours" (`20261016000000_lockdown.sql:1-15`, policies from line 62). Server-only tables are closed to signed-in users (`lockdown.sql:32-37`). | Live state. The Supabase connector available to me lists only one project (`lpn-masterguide`), not IronLog's, so I could not query the live policies. |
| **wger takes' two migrations live** (`20261109000000_workout_sets_target_snapshot.sql`, `20261109010000_exercise_variation_group.sql`) | **CANNOT TELL** | Both files exist and are additive/nullable. `HANDOFF.md:183` confirmed 22 migrations live as of 2026-11-01 (newest `20261026010000_deload_weeks`). Migrations deploy only by manually running the "Deploy database and functions" workflow: `.github/workflows/supabase.yml` has `workflow_dispatch` and no `push` trigger. Nothing in the repo records a run after 2026-11-01. The same applies to `20261108000000_lock_trigger_functions.sql` (#50). | Whether any of the three post-Nov-1 migrations were pushed. `gh` is not installed on this PC and the live project is not reachable from my connector. The owner can check in the Supabase dashboard (Database → Migrations) or the repo's Actions tab. |

---

## Step 0 — Ground truth

### IronLog

- **Working tree:** clean for tracked files. `git status` shows one untracked folder, `backups/` (two watch APKs and a watch `RKStorage` copy from 2026-11-08). It is not mine and is not touched or committed by this run.
- **Version:** `package.json` says `0.1.0`, but the shipped version is computed from commit count: phone `versionName "2.1.${gitCommitCount}"` (`android/app/build.gradle:25-26`), watch `"1.1.${gitCommitCount}"` (`watch/android/app/build.gradle:99-100`). At this head the count is 175, so **phone 2.1.175, watch 1.1.175**.
- **Tests:** `npm test` (`node --test "tests/*.test.ts"`) → **297 tests, 297 pass, 0 fail, 0 skipped** (~2.9 s). `npm run test:db` (`tests/real-db/finish.test.ts`) was **not run: CANNOT TELL**. It needs `SUPABASE_TEST_URL` and `SUPABASE_TEST_KEY` for a running local Supabase (`tests/real-db/finish.test.ts:8-15`), which this PC session does not have set.
- **Framework and entry points:** Next.js 16.4.2 + React 19.3 + Tailwind 4, statically exported (`out/`) and wrapped by Capacitor 8.5 for Android (`capacitor.config.ts`, `package.json` scripts `android:*`). App routes live in `src/app/*/page.tsx`: `/`, `/workout/`, `/log/`, `/progress/`, `/more/`, `/exercises/`, `/plans/`, `/settings/`, `/search/`, `/import/`, `/link-watch/`, `/login/`, `/welcome/`. The signed-in shell is `src/components/app-shell.tsx`.
- **Navigation a nutrition module would join:** four bottom tabs Home / Workout / Progress / More (`src/lib/nav.ts:31-36`), rendered as a 4-column glass bar (`app-shell.tsx:69`, `grid grid-cols-4`). Everything else lives under More, grouped in `MORE_SECTIONS` (`nav.ts:58-88`: Training, Log and import, Devices, App). The file says "To add a screen to More, add one entry to MORE_SECTIONS" (`nav.ts:2`). Progress has internal tabs overview / lifts / body / activity (`src/app/progress/page.tsx:66,80`). Home is built from cards in `src/components/home/` (today, next session, last session, readiness, recovery chips, week strip, session stack).
- **Supabase schema (25 migrations):** `users` (with `physical_stats` jsonb, `unit_system`, plates, rest; later `work_shifts` jsonb, onboarding), `exercises` (+ library, demos, `variation_group`), `routines`, `routine_exercises`, `workout_sessions`, `workout_sets` (+ timed sets, smarter sets, AMRAP/tempo, `target_reps/target_weight/target_rpe` snapshot), `heart_rate_samples`, `routine_adjustments`, `ai_usage`, `watch_pairings`, `watch_pair_attempts`, `programs` (+ deload weeks), `exercise_prefs`, `body_measurements` (+ private storage bucket `progress-photos`), `calendar_connections`, `claude_links`, `weekly_recaps`. Files: `20261013000000_initial_schema.sql` through `20261109010000_exercise_variation_group.sql`; the two wger-takes migrations are the last two.
- **How workouts, sets and goals are modeled:** a `workout_sessions` row (start/end time, volume, routine, kit) owns `workout_sets` rows (exercise, set number, weight in kg, reps, set type, completion, targets). Plans are `programs` → `routines` → `routine_exercises`. There is **no nutrition, calorie or energy goal anywhere**: a case-insensitive search for `calorie|kcal` across `src/` and `supabase/migrations/` returns zero files. "Goals" today means strength/progress goals in `src/components/progress/goal-bits.tsx` and periodization in `src/lib/periodization.ts`.
- **Offline queue shape:** see the Step 0.5 table. Ops are `insert | update | delete | finish | adjust` on the two workout tables (`queue.ts:15-22`), entries carry a sequence number and an optional `refused` reason (`queue.ts:24-30`), status is published to `SyncBanner` via `subscribeSync`/`getSyncStatus` (`src/components/sync-banner.tsx:5`). Storage is `src/lib/offline/kv.ts` (IndexedDB `ironlog-offline`, store `kv`, memory fallback). Sign-out wipes both the outbox and all kv keys (`auth-provider.tsx:44-45,109-110`).
- **Health Connect:** present (PR #20). Native plugin `android/app/src/main/java/com/ironlog/app/HealthConnectPlugin.kt` with four permissions: write exercise sessions, write distance, read heart rate, read weight (`HealthConnectPlugin.kt:50-55`; manifest `AndroidManifest.xml:22-25`; dependency `androidx.health.connect:connect-client:1.1.0`, `android/app/build.gradle:98`). Web side `src/lib/health.ts` (workouts out, heart rate and weight in; weight lands in `body_measurements` via `saveMeasurement`). **No nutrition, hydration or sleep permission exists.**
- **AI plumbing already in place:** Supabase Edge Functions `generate-plan`, `import-workout`, `suggest-adjustments`, `weekly-recap`, `claude-connector`, `gym-calendar`, `watch-pair` (`supabase/functions/`). Claude calls go through `_shared/claude.ts` (key in the function's secrets, `MODEL = "claude-opus-5-5"`, every call logged to `ai_usage` with a daily limit); a Gemini path exists in `_shared/gemini.ts` (`gemini-3.8-flash`, used by `generate-plan`). Photo import shrinks images on the phone before sending (`src/lib/import-image.ts`). Dictation uses the phone's speech recognizer via `@capacitor-community/speech-recognition` (`src/lib/speech.ts:1-8`).
- **Cross-app plumbing:** `IronLogEcosystemPlugin.java` reads/writes Android content providers of the owner's other apps: Bujo Tasks (`content://com.sadiqlateef.bujotasks.provider/habits`, `/entries`), Braindump (`…braindump.provider/entries`), Budget (`…budget.provider/subscriptions`), and exposes IronLog's own `content://com.ironlog.app.provider/{workouts,today_plan,recovery}` (`IronLogEcosystemPlugin.java:56-216`, manifest `queries` at `AndroidManifest.xml:37-40`). There is **no grocery-list provider and no Basecamp provider** referenced anywhere in IronLog.

### FoodYou

- Kotlin Multiplatform + Compose; modules `:app`, `:shared:barcodescanner`, `:shared:resources` (`settings.gradle.kts`). 600 `.kt` files. Local storage is Room (SQLite) plus DataStore preferences; networking is Ktor.
- Feature packages: `food/` (products, recipes, remote sources, search), `fooddiary/` (meals, entries), `goals/`, `importexport/` (CSV, Swiss DB), `sponsorship/`, `poll/`, `changelog/`, `settings/`, `app/ui/…`.

### Mapping checks

| Check | Result | Evidence |
|---|---|---|
| **M1** Both repos inventoried; SHAs; suite count | **PASS** | IronLog `657bd57…`, FoodYou `00637df…`; 297/297 unit tests; `test:db` not runnable here (no local Supabase env), marked CANNOT TELL above. |
| **M2** Every FoodYou network call catalogued | **PASS** | **6 network calls** (5 food-data + 1 sponsorship), section 1.1, each with endpoint and consumed fields. Search method in 1.1. |
| **M3** Nutrient tables cover energy/protein/carbs/fat/fiber/sugars/sodium for both sources | **PASS** | Section 2a (USDA numbers from `food/infrastructure/usda/USDANutrientId.kt`) and 2b (OFF fields from `food/infrastructure/openfoodfacts/model/OpenFoodFactsNutrients.kt`). |
| **M4** Barcode answered with file evidence | **PASS** | Section 3.9: ZXing scanner in `shared/barcodescanner`, scan → digits-only search → OFF product endpoint; USDA has no barcode lookup. |
| **M5** Weight tracking and Health Connect for both apps | **PASS** | FoodYou: neither exists (searches in 3.8). IronLog: both exist (`body_measurements`, `health.ts`, `HealthConnectPlugin.kt`). |
| **M6** Map ends with plan + DECISIONS; only this file changed; branch pushed, not merged | **PASS** (verified at commit time) | `git status` before commit showed only `IRONLOG_FOODYOU_MAP.md` new (plus the pre-existing untracked `backups/`, not added). Committed alone on `docs/foodyou-map` and pushed; no merge, no PR. |
| **M7** All 34 features with dependencies, effort, phase; 18/24/27 absent; off-device features flagged and in DECISIONS | **PASS** | Section 4.2 (F1–F37, 34 rows), section 6 distribution, off-device flags on F4, F5, F14, F17, F33, F36 (and F26's existing cloud photos), each with a DECISIONS item. |

---

## 1. FoodYou food-data layer — complete catalogue

### 1.1 Every network call

How I found them: searched all `.kt`/`.kts` for `https?://` literals, `HttpClient(` constructions, and `client.get|post`; also for `OkHttp|Retrofit|HttpURLConnection|URL(|coil|AsyncImage` (none). Three Ktor clients exist: OFF (`food/infrastructure/openfoodfacts/OpenFoodFactsModule.kt:20`), USDA (`food/infrastructure/usda/USDAModule.kt:15`), sponsorship (`sponsorship/infrastructure/SponsorshipInfrastructureModule.kt:21-22`). Other `https://` strings are links opened in the browser (privacy policies, Crowdin, Ko-fi, a Google Form poll), not app requests.

**Count: 6 calls.**

| # | Source | Method + endpoint | Parameters sent | Auth | Limits / backoff / timeout | Response fields consumed | Where |
|---|---|---|---|---|---|---|---|
| 1 | Open Food Facts | `GET https://world.openfoodfacts.org/api/v2/product/{barcode}` | `fields` (the list in 1.2); `countries` only if given (never given in practice) | None | Client-side sliding window **100 product requests / minute**, refused locally with a RateLimit error; **60 s** request/connect/socket timeout; HTTP 404 → "product not found" | `product.product_name`, `code`, `brands`, `nutriments.*` (section 2b), `product_quantity`, `product_quantity_unit`, `serving_quantity`, `serving_quantity_unit` (quantity fields tolerate numbers sent as strings) | `OpenFoodFactsRemoteDataSource.kt` `getProduct`; limiter `OpenFoodFactsRateLimiter.kt` |
| 2 | Open Food Facts | `GET https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1` | `search_terms`, `countries` (null in practice: the mediator factory passes no country), `page`, `page_size=50`, `sort_by=product_name`, `fields` | None (see #3 fallback) | **10 search requests / minute** client-side; 60 s timeout; HTTP 503 → retry once after logging in (#3), second 503 → "service unavailable" | `count`, `page`, `page_size`, `products[]` with the same per-product fields as #1 plus `url` | `OpenFoodFactsRemoteDataSource.kt` `queryProducts`; paging `food/search/infrastructure/openfoodfacts/OpenFoodFactsRemoteMediator.kt` |
| 3 | Open Food Facts | `POST https://world.openfoodfacts.org/cgi/session.pl` (form-urlencoded) | `user_id`, `password` | The user's own OFF account, entered in settings, stored **encrypted** in DataStore under keys `openFoodFacts:login` / `openFoodFacts:password` | Only called on a 503 search; non-2xx → error. Session cookie kept by `HttpCookies` with accept-all storage (`OpenFoodFactsModule.kt:23`) | Status code only (cookie) | `OpenFoodFactsRemoteDataSource.kt` `login`; `OpenFoodFactsCredentialsRepositoryImpl.kt` |
| 4 | USDA FoodData Central | `GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}` | `api_key`, `format=abridged`, optional `nutrients` (never passed) | `api_key` = the user's key from search preferences, else the literal public placeholder `DEMO_KEY` | No client limiter. HTTP 429 → rate-limit error; 403 → parses `API_KEY_MISSING / INVALID / DISABLED / UNAUTHORIZED / UNVERIFIED` into specific errors; 400 → bad request; 404 → not found. Timeout plugin installed with defaults | `fdcId`, `dataType`, `description`, `brandOwner`, `gtinUpc`, `foodNutrients[]` → `number` (int or string), `name`, `amount`, `unitName` | `USDARemoteDataSource.kt` `getFood`; only reached by pasting an FDC link (`USDAProductRequest.kt`, `DownloadProductUseCase.kt`) |
| 5 | USDA FoodData Central | `GET https://api.nal.usda.gov/fdc/v1/foods/search` | `api_key`, `query`, `pageSize=200`, `pageNumber`; `dataType`, `sortBy`, `sortOrder`, `brandOwner` supported but never passed (so all data types are searched) | Same as #4 | Same handling as #4 | `totalHits`, `currentPage`, `totalPages`, `foods[]` → `fdcId`, `description`, `dataType`, `brandOwner`, `gtinUpc`, `servingSize`, `servingSizeUnit`, `foodNutrients[]` → `nutrientNumber` (string), `name`, `value`, `unitName` | `USDARemoteDataSource.kt` `getFoodsSearch`; paging `food/search/infrastructure/usda/USDARemoteMediator.kt` |
| 6 | Maintainer's sponsors list (not food data) | `GET https://sponsors.maksimowiczm.com/{year}/{month}.json` | none | None | Client limiter 10 requests / 1 s; 404 → empty list | List of sponsorship records | `sponsorship/infrastructure/github/GithubSponsorsApiClient.kt` — **SKIP** for IronLog |

**User-Agent:** every food call sends `Food You/<version> (<maintainer contact>)` (`app/infrastructure/FoodYouConfig.kt:19`). Open Food Facts asks API clients to identify themselves this way. **IronLog builder note:** a WebView `fetch` cannot set `User-Agent` (it is a forbidden header), so IronLog needs either Capacitor's native HTTP (`CapacitorHttp`, part of `@capacitor/core`) or a Supabase Edge Function proxy to send an honest UA. Whether OFF and FDC answer browser CORS preflights from the app's origin is **CANNOT TELL** from either codebase; Phase N1 must check it with a live request before choosing.

**Committed keys:** searched the donor for any `api_key|apikey|secret|token` assigned a 12+ character literal in `.kt/.kts/.properties/.json/.toml`: none. The only key literal is the public USDA placeholder `DEMO_KEY` (`USDARemoteDataSource.kt:38,66`), which api.data.gov rate-limits heavily; it is not a secret.

### 1.2 The OFF `fields` list (both OFF calls)

`product_name, code, nutriments, brands, serving_quantity, serving_quantity_unit, product_quantity, product_quantity_unit, url` (constant at the bottom of `OpenFoodFactsRemoteDataSource.kt`). The v2 product response has no `url`; FoodYou builds `https://world.openfoodfacts.org/product/{code}` itself (`model/v2/OpenFoodFactsProductV2.kt`).

### 1.3 Merge, rank, dedupe

- **No cross-source merge.** Each source is a separate filter in search: Recent (default), Your food, Open Food Facts, USDA, Swiss DB (`app/ui/food/search/FoodFilter.kt`). The view model keeps one paged list per source (`app/ui/food/search/FoodSearchViewModel.kt:69-125`).
- **Remote results are written into the local database, then the UI reads the local database.** Remote mediators fetch a page, convert each item, and insert it into the Room `Product` table, tagged with its source type, and record a "Downloaded" history event (`OpenFoodFactsRemoteMediator.kt`, `USDARemoteMediator.kt`, `insert` helpers). A source is only queried remotely if it is enabled in preferences (`food/search/domain/FoodSearchUseCase.kt`, `remoteMediatorFactory`).
- **Ranking:** local full-text search (`ProductFts MATCH query*`) filtered by source, ordered **alphabetically by headline** (name + brand), case-insensitive (`food/search/infrastructure/room/FoodSearchDao.kt:85-113`). There is no relevance or popularity ranking. The Recent filter is the only usage-aware list (1.5).
- **Dedupe:** on insert, a product is skipped if one already exists with the same name, the same brand (or none given), the same barcode (or none given) and the same source type (`food/infrastructure/room/ProductDao.kt:38-76`). Cross-source duplicates (same food from OFF and USDA) are kept as two rows.
- **Items that fail conversion are skipped, not shown:** a product with no name, or with no `nutriments` object at all, throws during conversion and is dropped with a debug log (`food/infrastructure/network/RemoteProductMapper.kt`, `toModel`; caught by `runCatching` in both mediators). If a whole page is skipped, the mediator loads the next page.

### 1.4 Barcode lookup vs text search

- A query made only of digits is classified as a barcode; anything else is text (`common/domain/search/SearchQuery.kt`, `searchQuery`).
- **Local:** barcode queries match `barcode LIKE %digits%` on stored products (`FoodSearchDao.kt:154-176`); text queries use FTS.
- **Open Food Facts:** barcode → one call to #1 (product endpoint), then end of paging; not found ends quietly with no row (`OpenFoodFactsRemoteMediator.kt`, the `isBarcode` branch). Text → paged #2.
- **USDA:** there is no barcode endpoint. A digits-only query still goes to #5 as a text `query` (`USDARemoteMediatorFactory` creates a mediator for any non-blank query). FDC's `gtinUpc` field is stored but never searched by.

### 1.5 Caching and lifetimes

- **Products never expire.** Everything downloaded stays in Room until the user deletes it. There is no TTL and no refresh: the mediators return "success" on REFRESH without refetching (comments in both mediators).
- **Paging keys** remember, per query (and country for OFF), how many results were fetched out of the total, so a repeated search continues instead of re-downloading (`food/search/infrastructure/room/OpenFoodFactsPagingKey.kt`, `USDAPagingKeyEntity.kt`).
- **No HTTP cache** plugin is installed on any client.
- **Recents:** the latest measurement used per food, kept in `MeasurementSuggestion` and reduced to one row per food by the `LatestMeasurementSuggestion` view (`food/infrastructure/room/LatestMeasurementSuggestion.kt`); the Recent filter shows foods used in the last **30 days (2,592,000 s)**, newest first (`FoodSearchDao.kt:180-215`). A suggestion is written whenever a diary entry is created (`food/domain/event/FoodDiaryEntryCreatedEventHandler.kt`).

### 1.6 What works with no network

Everything except the remote fetch: the diary, goals, recipes, quick add, the user's own foods, every previously downloaded OFF/USDA product, the Swiss DB once imported, recents, and local barcode match. Remote failures surface as an error card in search (`app/ui/food/search/FoodSearchErrorCard.kt`).

### 1.7 Non-network food sources

- **Swiss Food Composition Database:** bundled CSV files (`app/src/commonMain/composeResources/files/swiss-food-composition-database/data.csv`, `data-de-DE.csv`, `data-fr-FR.csv`, `data-it-IT.csv`, ~300 KB each, plus `COPYRIGHT`), imported locally on demand by language (`app/ui/database/swissfoodcompositiondatabase/`). No network.
- **CSV import/export** of the user's products (`importexport/domain/usecase/ImportCsvProductUseCase.kt`, `ExportCsvProductsUseCase.kt`).
- **Link download:** paste an OFF product URL (regex on `openfoodfacts.org/…/{digits}`) or an FDC URL (`fdc.nal.usda.gov/food-details/{id}`) to fetch that one item via #1 or #4 (`food/domain/usecase/DownloadProductUseCase.kt`, `food/infrastructure/network/RemoteProductRequestFactoryImpl.kt`).

---

## 2. Nutrient mapping tables

FoodYou's internal model is one record of 43 nutrients per 100 g (or 100 ml for liquids), each value either complete or incomplete (`common/domain/food/NutritionFacts.kt:5-47`, `NutrientValue.kt`). **Energy is stored in kcal; every other nutrient is stored in grams**, including vitamins and minerals (so 2.3 g sodium, 0.0000024 g B12). Display converts kcal to kJ with ×4.184 (`common/domain/food/NutrientsHelper.kt`).

### 2a. USDA FoodData Central

**Important:** FoodYou matches the legacy **nutrient number** (`number` in the abridged detail response, `nutrientNumber` in search results), **not** the FDC nutrient `id` (for example energy is number 208 here, which FDC also exposes as id 1008). A builder must key on the same field. Source: `food/infrastructure/usda/USDANutrientId.kt`, applied in `USDAMapper.kt`.

| FoodYou field | USDA nutrient number | Notes |
|---|---|---|
| Energy (kcal) | **208**, fallback **957** | If both missing and protein, carbs and fat are all present, energy = 4·P + 4·C + 9·F (`NutrientsHelper.calculateEnergy`). Energy amount is taken as-is (not unit-normalized). |
| Protein | **203** | |
| Carbohydrate | **205** | |
| Total fat | **204** | |
| Saturated fat | 606 | |
| Trans fat | 605 | |
| Monounsaturated fat | 645 | |
| Polyunsaturated fat | 646 | |
| Sugars | **269** | |
| Added sugars | 539 | |
| Dietary fiber | **291** | |
| Cholesterol | 601 | |
| Caffeine | 262 | |
| Vitamin A | 320 | |
| B1 thiamin | 404 | |
| B2 riboflavin | 405 | |
| B3 niacin | 406 | |
| B5 pantothenic acid | 410 | |
| B6 | 415 | |
| B7 biotin | 416 | |
| B9 folate | 417 | |
| B12 | 418 | |
| Vitamin C | 401 | |
| Vitamin D | 324 | |
| Vitamin E | 323 | |
| Vitamin K | 430 | |
| Manganese | 315 | |
| Magnesium | 304 | |
| Potassium | 306 | |
| Calcium | 301 | |
| Copper | 312 | |
| Zinc | 309 | |
| **Sodium** | **307** | |
| Iron | 303 | |
| Phosphorus | 305 | |
| Selenium | 317 | |
| Omega-3, omega-6, salt, soluble/insoluble fiber, iodine, chromium | — | Always empty for USDA foods. |

**Unit normalization:** every non-energy amount is converted to grams using `unitName`: `g` ×1, `mg` ×0.001, `ug`/`µg`/`mcg` ×0.000001 (`food/infrastructure/network/MapperHelper.kt`). **Any other unit (for example `IU`) returns nothing, so that nutrient is dropped.**

**Portions and servings (the `foodPortions` question):** FoodYou **does not read `foodPortions` at all**. The detail call asks for `format=abridged`, which does not carry portions, and the mapper sets serving weight to null for detail results (`USDAMapper.kt`, first `toRemoteProduct`). For search results, the serving weight is `servingSize` only when `servingSizeUnit` is one of `g, GRM, ml, MLT`; `ml/MLT` also marks the food as liquid (`USDAMapper.kt:13-14` and the second `toRemoteProduct`). In practice only Branded foods carry `servingSize`. **Turning FDC household portions ("1 cup", "1 medium") into servings is new work for IronLog, not a harvest:** it would need `format=full` on the detail call and a mapping of `foodPortions[].gramWeight` + `portionDescription`/`modifier`/`amount`. Package weight is always null for USDA.

**Fields kept per food:** `description` → name, `brandOwner` → brand, `gtinUpc` → barcode, source URL `https://fdc.nal.usda.gov/food-details/{fdcId}/nutrients`.

### 2b. Open Food Facts

All values are read from the `nutriments` object on a **per-100 g basis** (the `_100g` suffixed keys) and **used as-is**: FoodYou assumes OFF's `_100g` values are already in grams (kcal for energy). `proteins_unit` is parsed but never used. Source: `food/infrastructure/openfoodfacts/model/OpenFoodFactsNutrients.kt`, mapped in `OpenFoodFactsProductMapper.kt`.

| FoodYou field | OFF `nutriments` key |
|---|---|
| Energy (kcal) | **`energy-kcal_100g`** (no kJ fallback, no 4/4/9 fallback for OFF) |
| Protein | **`proteins_100g`** |
| Carbohydrate | **`carbohydrates_100g`** |
| Fat | **`fat_100g`** |
| Saturated fat | `saturated-fat_100g` |
| Trans fat | `trans-fat_100` ← **donor bug: the key lacks the `g`, so OFF trans fat is never filled.** IronLog should read `trans-fat_100g`. |
| Monounsaturated fat | `monounsaturated-fat_100g` |
| Polyunsaturated fat | `polyunsaturated-fat_100g` |
| Omega-3 | `omega-3-fat_100g` |
| Omega-6 | `omega-6-fat_100g` |
| Sugars | **`sugars_100g`** |
| Added sugars | `added-sugars_100g` |
| Salt | `salt_100g` |
| Fiber | **`fiber_100g`** |
| Soluble fiber | `soluble-fiber_100g` |
| Insoluble fiber | `insoluble-fiber_100g` |
| Cholesterol | `cholesterol_100g` |
| Caffeine | `caffeine_100g` |
| Vitamin A | `vitamin-a_100g` |
| B1 | `vitamin-b1_100g` |
| B2 | `vitamin-b2_100g` |
| B3 | `vitamin-pp_100g` |
| B5 | `pantothenic-acid_100g` |
| B6 | `vitamin-b6_100g` |
| B7 | `biotin_100g` |
| B9 | `vitamin-b9_100g` |
| B12 | `vitamin-b12_100g` |
| C | `vitamin-c_100g` |
| D | `vitamin-d_100g` |
| E | `vitamin-e_100g` |
| K | `vitamin-k_100g` |
| Manganese | `manganese_100g` |
| Magnesium | `magnesium_100g` |
| Potassium | `potassium_100g` |
| Calcium | `calcium_100g` |
| Copper | `copper_100g` |
| Zinc | `zinc_100g` |
| **Sodium** | **`sodium_100g`** |
| Iron | `iron_100g` |
| Phosphorus | `phosphorus_100g` |
| Selenium | `selenium_100g` |
| Iodine | `iodine_100g` |
| Chromium | `chromium_100g` |

**Salt vs sodium:** both are stored independently as delivered; FoodYou never derives one from the other. (IronLog may choose to derive sodium = salt ÷ 2.5 when only salt is present; that is a new rule, listed in DECISIONS #6.)

**Serving size parsing:** FoodYou does **not** parse the free-text `serving_size`. It uses the numeric `serving_quantity` with `serving_quantity_unit`, and `product_quantity` with `product_quantity_unit` for the package; zero or negative values are discarded (`OpenFoodFactsProductMapper.kt`). A product is liquid when either unit equals `ml` (case-insensitive). Note the unit is not used to convert anything: a serving in `ml` is treated as that many ml of a per-100 ml record.

**Missing / partial nutriments:**
- No `nutriments` object → product dropped (1.3).
- No `product_name` (or blank) → dropped.
- Any single missing key → that nutrient is "incomplete (unknown)". Totals that include an unknown nutrient are flagged incomplete but still sum the known parts (`NutrientValue.kt`, `plus`). The UI can therefore show "≥ X g" style partial totals. IronLog should keep this two-state idea.

---

## 3. FoodYou diary mechanics

### 3.1 Day and meal structure
- A diary day is a calendar date (`epochDay` on each entry, `fooddiary/infrastructure/room/MeasurementEntity.kt`). There is no configurable day boundary.
- Meals are **a user-editable list**, not fixed: each has id, name, start time, end time, rank (`fooddiary/domain/entity/Meal.kt`). On first database creation the app seeds them from `composeResources/files/meals/meals.json` (or a localized `meals-<lang>.json`): Breakfast 06:00–10:00, Lunch 10:00–15:00, Dinner 15:00–21:00, Snacks 00:00–00:00 (equal start/end means "all day") (`fooddiary/infrastructure/room/InitializeMealsCallback.kt`, `fooddiary/infrastructure/compose/ComposeLocalizedMealsProvider.kt`).
- Optional time-based ordering puts meals whose window contains "now" first; windows that cross midnight are handled; all-day meals can be excluded from that ordering (`fooddiary/domain/usecase/ObserveDiaryMealsUseCase.kt`, `fooddiary/domain/entity/MealsPreferences.kt`). Entries inside a meal are sorted by name.

### 3.2 Product (food) model
- Per-100 g storage (per 100 ml if liquid), plus optional package weight and serving weight in grams/ml, name, brand, barcode, note, liquid flag, source type + URL (`food/domain/entity/Product.kt`). Display headline is "name (brand)".
- Sources: `User`, `OpenFoodFacts`, `USDA`, `SwissFoodCompositionDatabase` (`common/domain/food/FoodSource.kt`).
- History events per food: Created, Downloaded, Imported, Edited, ImportedFromFoodYou2 (`food/infrastructure/room/FoodEventType.kt`).

### 3.3 Diary entry math
- Measurement units: gram, milliliter, ounce, fluid ounce, package, serving (`common/domain/measurement/MeasurementType.kt`). Conversions to metric: oz ÷ 0.03527396, fl oz ÷ 0.0338140227, package × package weight, serving × serving weight (`Measurement.kt`, `WeightCalculator.kt`).
- Entry nutrition = food's per-100 values × (grams ÷ 100) (`fooddiary/domain/entity/FoodDiaryEntry.kt`). Meal total = sum of its entries; day total = sum of meals (`DiaryMeal.kt`).
- Validation on create: g/oz only for non-liquids, ml/fl oz only for liquids, package needs a package weight, serving needs a serving weight, meal must exist (`fooddiary/domain/usecase/CreateFoodDiaryEntryUseCase.kt`).
- **Diary entries keep a snapshot of the food**, so editing or deleting a library food never rewrites history: entries point at `DiaryProduct` / `DiaryRecipe` copy tables holding name, all nutrients, package/serving weight, liquid flag, source and note (`fooddiary/infrastructure/room/DiaryProductEntity.kt`, `MeasurementDao.kt:62-73`).
- **Quick add:** a manual entry is just a name plus nutrition values in a meal on a date, no food record (`fooddiary/domain/entity/ManualDiaryEntry.kt`, UI `app/ui/food/diary/quickadd/`).

### 3.4 Recipe model and rollup
- A recipe has a name, an integer number of servings, a note, a liquid flag, and ingredients (any food, including other recipes, each with a measurement) (`food/domain/entity/Recipe.kt`, `RecipeIngredient.kt`).
- Total weight = sum of ingredient weights; serving weight = total ÷ servings; per-100 g nutrition = (sum of ingredient nutrition) ÷ total weight × 100.
- Recipes can nest; search excludes a recipe from its own ingredient picker and any recipe that already contains it (`FoodSearchDao.kt`, `RecipeAllIngredientsView`).
- "Unpack": a logged recipe can be split into its ingredients scaled by the eaten fraction (`Recipe.unpack`, `fooddiary/domain/usecase/UnpackFoodDiaryEntryUseCase.kt`).
- Cooked-weight yield (water loss) is not modeled: total weight is the raw ingredient sum.

### 3.5 Goals model
- One `DailyGoal` per weekday, or one shared goal when separate goals are off (`goals/domain/entity/WeeklyGoals.kt`).
- Energy and the three macros are set either in grams or as percentages of energy (default **2000 kcal, protein 20 %, fat 30 %, carbs 50 %**) (`goals/domain/entity/MacronutrientGoal.kt`, `DailyGoal.kt`).
- Every other nutrient has its own daily target with built-in defaults, e.g. fiber 30 g, sugars 50 g, added sugars 25 g, salt 5 g, sodium 2.3 g, potassium 4.7 g, caffeine 0.4 g, saturated fat 18 g (`DailyGoal.kt`, `defaultGoals`).
- Stored as JSON in DataStore under key `fooddiary:weekly_goals_2` (`goals/infrastructure/DataStoreGoalsRepository.kt`).

### 3.6 Favorites, recents, quick paths
- **Favorites: none.** Case-insensitive search for `favou?rite` across the donor finds no domain or UI code.
- **Recents:** see 1.5 (30-day window, newest first, with the last-used amount prefilled).
- **Copy a day / copy a meal: none.** Search for `copy(Day|Meal|Entries)` finds nothing; "duplicate" only appears in the changelog and the insert-unique helper.
- Quick add (3.3), link download (1.7), CSV import (1.7).

### 3.7 Search UI
Default filter is Recent; the barcode button sits in the search bar (`app/ui/food/search/FoodSearchApp.kt:98-113`).

### 3.8 Weight tracking and Health Connect
- **FoodYou has no body-weight tracking.** Searched `bodyweight|body ?weight|WeightEntry|weightKg|WeightRecord` (case-insensitive) across all `.kt`: zero hits. (All "weight" code is food weight.)
- **FoodYou has no Health Connect.** Searched `health ?connect|healthconnect|androidx\.health` across `.kt`, `.kts`, `.xml`, `.toml`: zero hits.

### 3.9 Barcode flow end to end
1. Scanner library: **ZXing via `com.journeyapps:zxing-android-embedded` 4.3.0** (`gradle/libs.versions.toml:36,79`; `shared/barcodescanner/build.gradle.kts`). Camera permission through Accompanist. Single-shot decode with a torch toggle (`shared/barcodescanner/src/androidMain/.../ZxingCameraBarcodeScannerScreen.kt:57-78`).
2. Screen flow: the search bar's barcode button opens a full-screen scanner (`app/ui/common/component/FullScreenCameraBarcodeScanner.kt`); a successful scan closes it and runs the scanned string as the search query (`FoodSearchApp.kt:98-104`). The product form also has a scan button to fill a barcode field (`app/ui/food/product/ProductForm.kt`).
3. Lookup: digits-only → barcode query → local `LIKE` match plus OFF product call (1.4).
4. Failure states: OFF 404 → no result, no error card (`FoodSearchErrorCard.kt:59`, not-found maps to nothing); OFF rate limit or 503 → error card; USDA cannot look up barcodes; offline → only local matches.

---

## 4. Translation table — FoodYou → IronLog

### 4.1 Mechanisms

Effort: S (≤1 day), M (2–4 days), L (a week or more). IronLog expressions are proposals.

| FoodYou mechanism | IronLog expression | Effort / risk |
|---|---|---|
| OFF product by barcode (#1) | `src/lib/nutrition/sources/off.ts` exporting `offProduct(barcode)` returning a `RemoteFood`; uses `CapacitorHttp` on Android (UA header), plain `fetch` in the browser build; 100/min sliding-window limiter in memory | S — risk: CORS/UA behavior unverified (N1 gate) |
| OFF text search (#2) | `offSearch(query, page)` with `page_size=50`; **never search-as-you-type** (10/min); search on submit only | S — risk: 10/min is easy to hit; debounce + submit button |
| OFF login fallback (#3) | **SKIP** | Storing a third-party password on the phone is not worth it for one user; on 503 show "Open Food Facts is busy, try again". |
| USDA search (#5) | `usdaSearch(query, page)` with `pageSize=200`; key from the owner's own FDC key (DECISIONS #3) | S — risk: key handling (below) |
| USDA detail (#4) | `usdaFood(fdcId)`; use `format=full` instead of abridged when portions are wanted (2a) | M — portions mapping is new work |
| USDA key storage | Phone-only setting in `localStorage` like other prefs (pattern: `src/lib/logger-prefs.ts`, `readiness.ts:38`), **or** an Edge Function secret with the function proxying FDC calls | S — risk: key in the APK if baked in; never commit it |
| Sponsors list (#6) | **SKIP** | Not food data. |
| Swiss Food Composition DB | **SKIP** | Swiss/European foods in de/fr/it; little overlap with the owner's diet; its CSV license would need its own review. |
| CSV product import/export | **SKIP for v1**; IronLog's backup (`src/lib/backup.ts`) and F30 export cover the need | Revisit if the owner wants to bring in an old food log. |
| Link download (paste OFF/FDC URL) | **SKIP for v1** | Low value on a phone; barcode + search cover it. |
| Unified result model + nutrient mapping (section 2) | `src/lib/nutrition/nutrients.ts`: one `NutrientKey` union (energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sugars_g, sodium_mg, …) with two lookup tables (USDA number → key, OFF key → key) and unit normalization; values unknown vs known kept distinct (`number \| null`) | M — risk: unit mistakes; fixture-tested per nutrient |
| Merge/rank/dedupe | Unlike FoodYou, **one merged list**: local foods first (own, staples, history-ranked F20), then OFF, then USDA; dedupe by barcode, then by normalized name+brand within a source | M — risk: noisy USDA results; cap per source |
| Local cache of downloaded foods | Store chosen remote foods in the user's `foods` table (cloud) and mirror the list in kv (`cachedRead("foods", …)` pattern) so search works offline | S |
| Recents (30 days) | Derived from the user's own `food_entries` (latest per food), not a separate table | S |
| Meals (editable list with time windows) | `meal_slots` kept in a `users.nutrition_prefs` jsonb column (like `work_shifts`), default Breakfast/Lunch/Dinner/Snacks; or free-form (DECISIONS #1) | S |
| Day boundary (calendar date) | `food_entries.food_day date` computed on the phone at log time; supports F3 rollover | S — risk: must be decided before any data is written |
| Product model (per-100 g, package, serving, liquid) | Table `foods`: `id uuid` (phone-made), `user_id`, `source` (`user \| off \| usda \| staples \| estimate`), `source_ref` (barcode or fdcId), `name`, `brand`, `barcode`, `is_liquid`, `package_g`, `serving_g`, `servings jsonb` (named portions), `per100 jsonb` (NutrientKey → number), `is_estimate bool`, `price_cents`/`price_qty_g` (F9), timestamps | M |
| Entry math + validation | `src/lib/nutrition/math.ts`, pure functions, ported as behavior (grams from measurement, per-100 scaling, liquid/solid unit rules, incomplete propagation) | S — easy to fixture-test with node:test |
| Entry snapshot | `food_entries.snapshot jsonb` (name, brand, per100, serving_g, is_liquid, source) written at log time | S |
| Quick add | `food_entries` row with `food_id null` and `nutrients` given directly | S |
| Recipes + rollup + unpack | Tables `recipes` (servings, note, is_liquid, `cooked_weight_g` optional) and `recipe_ingredients` (food or recipe + measurement); rollup in `math.ts`; nested recipes allowed with a cycle check | M |
| Goals (per weekday, grams or %, micro targets) | `users.nutrition_goals jsonb` (base goal + per-weekday overrides + micros), plus the flex rules of F1/F23/F37 | M |
| Barcode scanner (ZXing in Compose) | IronLog has no scanner. Options: an ML Kit Capacitor plugin (on-device) or a JS decoder on the camera stream in the WebView (DECISIONS #4) | M — risk: new native dependency, camera permission, Fold cover-screen layout |
| Weight tracking | **Already in IronLog**: `body_measurements` + Body tab + Health Connect weight import (`src/lib/health.ts`). Reuse; no new table | S |

### 4.2 Owner features (34)

Phase names refer to section 6. "Off-device" means data leaves the phone and Supabase for a third party (an AI provider or similar). Syncing to IronLog's own Supabase is the existing norm (NOTES.md:7) and is not counted as off-device here.

| # | Feature | Needs from food layer / diary core | IronLog systems touched | Effort | Phase | Flags |
|---|---|---|---|---|---|---|
| F1 | Training-day targets | Goals model with a "training day" and "rest day" profile | Today's plan (`src/lib/today-plan.ts`), `workout_sessions` (did a session happen today), programs | M | N5 | — |
| F2 | Post-workout log prompt | Diary core, usuals (F7) as quick picks | Finish screen `src/components/workout/finish-summary.tsx` (UI only) | S | N6 | **Near a fence:** must not change the finish op in `queue.ts` or `workout-store.ts finishSession`; hook only the summary UI. |
| F3 | Shift-day rollover | `food_day` assigned by a rule, not by midnight | `users.work_shifts` + `src/lib/shifts.ts` (night shift 19:00–07:30 preset) | M | N2 (rule in the data model), N6 (schedule-driven) | Source is DECISIONS #10. |
| F4 | Label snap (photo → OCR → food) | Food creation form, nutrient keys | Camera (Capacitor), `import-image.ts` resize helper | L | N7 | **Off-device if cloud OCR/AI.** DECISIONS #9. |
| F5 | AI plate estimate | Foods with `is_estimate`, quick add with an estimate badge | Edge Function pattern (`_shared/claude.ts` or `gemini.ts`), `ai_usage` daily limit | L | N7 | **Off-device (photo or text to an AI provider).** DECISIONS #8. |
| F6 | Pantry mode | Barcode (N3), foods table, `pantry_items` (food, qty, added_on, opened_on) | kv mirror, nutrition outbox | M | N4 | — |
| F7 | My usuals (grouped by place) | Saved meal templates (`usuals`: name, items, place) | `@capacitor/geolocation` (already a dependency) and the gym/places logic in `src/lib/gym-logic.ts`; location stays on the phone | M | N4 | Location use needs a one-line rationale like the existing ones (`src/lib/rationale.ts`). |
| F8 | Meal-prep batches | Recipes with cooked weight; a `batches` table (recipe, made_on, portions left) | Diary, nutrition outbox | M | N4 | — |
| F9 | Protein-per-dollar | `foods.price_cents` per package; protein per 100 g | Budget app provider `content://com.sadiqlateef.budget.provider/…` via `IronLogEcosystemPlugin.java` — today it only reads `subscriptions` (line 216); grocery prices there are **CANNOT TELL** | S (manual price) / M (Budget) | N7 | Manual price works without Budget. |
| F10 | Grocery gap list | Micros (N5), weekly totals vs goals, food suggestions | "His existing shared grocery list": **no grocery provider is referenced anywhere in IronLog** (only Bujo, Braindump, Budget in `AndroidManifest.xml:37-40`) | M + unknown | **Stranded until the list app is named** | DECISIONS #14. |
| F11 | Hydration card | Liquid entries or a water quick-add; daily water goal | Home card (`src/components/home/`) | S | N5 | Health Connect hydration is optional (DECISIONS #7). |
| F12 | Supplement stack | `supplements` (name, dose, schedule) + `supplement_logs` (date, taken) | Home card, streak helper (`src/lib/stats.ts` has `weekStreak`) | S | N5 | — |
| F13 | Fasting window (shift-aware) | First/last entry timestamps per food day | `shifts.ts`, local notifications (`src/lib/native.ts:48-76`) | S | N5 | — |
| F14 | Weekly report card | Weekly totals, adherence vs goals | Existing `weekly-recap` Edge Function + `weekly_recaps` table (uses Claude via `askStructured`, `supabase/functions/weekly-recap/index.ts:7`) or a local-only card | M | N6 | **Off-device if added to the Claude recap.** DECISIONS #8. |
| F15 | Basecamp home card + logging streak | Day totals, streak | IronLog Home card; Basecamp is a separate app: IronLog would publish a `nutrition` path on its own provider `content://com.ironlog.app.provider` (today: workouts, today_plan, recovery) | M (+ Basecamp-side work outside this repo) | N6 | Basecamp changes are a separate project. |
| F16 | Caffeine tracker | Caffeine nutrient (USDA 262 / OFF `caffeine_100g`), entry times, half-life math | Planned sleep time: shifts (`shifts.ts`) or a setting; notifications | M | N5 | Half-life default is a parameter, not medical advice. |
| F17 | Voice logging | Food search, quantity parsing | `src/lib/speech.ts` (Android speech recognizer), parsing either local (like `src/lib/voice-set.ts`) or AI (like `import-workout`) | M (local) / M (AI) | N7 | **Off-device if parsed by AI**; the phone recognizer itself may use Google's servers: **CANNOT TELL** from code whether it runs on-device. DECISIONS #8. |
| F19 | Copy-a-day templates | Copy entries from a day or saved template into another day | Diary core | S | N2 | Not in FoodYou (3.6). |
| F20 | Your-history search ranking | Frequency + recency score over own `food_entries` | Search screen; computed on the phone | S | N2 | — |
| F21 | Offline-proof logging | Everything in N2: kv mirror, nutrition outbox, local food cache; a "pending enrichment" state for foods typed while offline | `src/lib/offline/kv.ts`, new outbox; **fence pressure on `queue.ts` and `sync-banner.tsx`** (section 5.4) | L | N2 | DECISIONS #15. |
| F22 | Denco staples pack | Seeded user foods with `source = staples`, `is_estimate = true`, editable | Seed via app code on first use (not a global DB table), per-user copy | S (code) + M (content) | N2 | Values must cite a source; DECISIONS #13. |
| F23 | Calorie banking | Weekly energy budget = sum of daily goals; running balance | Goals; Progress or Home card | M | N5 | — |
| F25 | Restaurant pre-log | `food_entries.status = planned`; one-tap confirm turns it into `logged` with the real time | Diary, usuals | S | N4 | — |
| F26 | Measurements + progress photos (private, on-device) | — (body data, not food) | **Already exists, but photos are in the cloud**: `body_measurements` table and private Supabase bucket `progress-photos` (`20261014030000_body_tracking.sql:1-41`, `src/lib/body-api.ts:55-80`). "On-device" would mean moving photos to `@capacitor/filesystem` (already a dependency) | M | N6 | **Today's photos already leave the phone (to IronLog's own Supabase).** DECISIONS #11. |
| F28 | Evening nudge | "Nothing logged today" check, usuals | Local notifications with action buttons (`src/lib/native.ts`, `RestActionReceiver.java` shows the action pattern) | S–M | N6 | — |
| F29 | Quick-log widget (cover screen) | Calories remaining, top usuals | **IronLog has no Android home-screen widget** (searched `AppWidgetProvider\|appwidget` in `android/app/src/main`: none). Needs native widget code reading IronLog's provider or shared prefs | L | N7 | Native Android work. |
| F30 | Clinician export | Date-range totals, per-day table | CSV pattern in `src/lib/export-csv.ts`; PDF needs a new library (none in `package.json`); share via `@capacitor/share` | M | N6 | Export file leaves the phone only when he shares it. |
| F31 | Roster-aware fuel planning | Meal slots, goals | **Reads `users.work_shifts`** (jsonb array of `{date, type, start, end}`, `20261018233000_kits_shifts_home.sql:8-20`, typed in `src/lib/shifts.ts:9-15`). **If absent:** fall back to the default meal windows and say "Add your shifts to plan around them" | M | N6 | DECISIONS #12. |
| F32 | The day story | Food entries with times, caffeine (F16) | Workouts (`workout_sessions`), food, caffeine, sleep. **Sleep source today: only a manual single value** in `localStorage` key `ironlog:readiness-metrics` (`src/lib/readiness.ts:38-55`), not a per-night history, and Health Connect sleep is not requested (`HealthConnectPlugin.kt:50-55`). **If absent:** the timeline omits sleep and shows "No sleep data" | L | N7 | DECISIONS #12. |
| F33 | Capture now, log later | Photo inbox (`food_entries.status = inbox` with a local photo path) | `@capacitor/filesystem` for the photo, kv for the inbox; batch processing by hand or by F5 | M | N7 | **Off-device only if batch processing uses AI.** DECISIONS #8. |
| F34 | Student lens | Food → nutrient → annotation lookup | Static, versioned content file shipped with the app; shown on food detail | M (code) + L (content) | N7 | Educational, sourced, never advice; DECISIONS #16. |
| F35 | Leftover intelligence | Batch (F8) and pantry (F6) dates | Local notifications | S–M | N7 | Depends on F6, F8. |
| F36 | Estimates that learn him | F5 results + his corrections, stored per dish (`estimate_corrections`) | Same Edge Function as F5; corrections sent as context | M | N7 | **Off-device (corrections go with the prompt).** DECISIONS #8. |
| F37 | Phase-aware goals (bulk/cut/maintain synced to training blocks) | Goals with a phase multiplier | `programs` table + deload weeks (`20261026010000_deload_weeks.sql`), `src/lib/periodization.ts` | M | N5 | — |

---

## 5. IronLog integration design questions — answered from code

### 5.1 Where nutrition entries live so intake sits next to training
- **IronLog does not model calories burned anywhere** (zero `calorie|kcal` hits in `src/` and migrations). The closest numbers are volume, heart rate and a 0–100 "strain" (`src/lib/insights.ts`, `workoutStrain`, used in `finish-summary.tsx`). Any "net calories" view would need an energy-expenditure estimate that does not exist today; this map does not propose one.
- Proposal: new Supabase tables (`foods`, `food_entries`, `recipes`, `recipe_ingredients`, plus feature tables) keyed by `user_id`, and a per-day phone mirror in kv (`nutrition-day:<food_day>`), the same "phone first, then server" shape as `workout-store.ts`. `food_entries.food_day` is a plain date, so a shared day view can join it to `workout_sessions.start_time::date` (and to `body_measurements.measured_on`).

### 5.2 What a shared day view requires
- A single "day key" rule used by both sides. Workouts use the local calendar day (`dayKey` in `shifts.ts:28`). If F3 rollover is adopted, the food day and the workout day can differ after a night shift; the day view must use the food-day rule for both or show the boundary.
- Data: that day's `workout_sessions` (already cached via `cachedRead("workout-log")`), the day's `food_entries`, the day's goals (F1 flex), and optionally `heart_rate_samples`. A new card on Home (`src/components/home/today-card.tsx` is the natural host) and a day page reachable from it.

### 5.3 What Health Connect would add and what it costs
- Already there: workouts out, heart rate in, weight in (section Step 0). Weight tracking therefore needs **no new code** for the nutrition module.
- Could add: writing `NutritionRecord` (per entry or per meal) and `HydrationRecord`, and reading `SleepSessionRecord` for F16/F32. Cost: new permissions in `AndroidManifest.xml` and `HealthConnectPlugin.kt` (`permissions` map, new methods), new methods in `src/lib/health.ts`, the permission rationale screen already exists (`HealthPrivacyActivity.kt`). Neither file is fenced. Effort M. Writing nutrition to Health Connect makes it readable by any app he grants, which is his call (DECISIONS #7).

### 5.4 What nutrition needs from the offline queue (and the fence)
- Logging food with no signal (F21) needs exactly what workouts have: a phone copy, an ordered outbox, id-based upserts, retry on reconnect, refused changes kept.
- **The existing outbox cannot carry nutrition without editing it:** its table type is closed to `"workout_sessions" | "workout_sets"` (`queue.ts:13`) and its sender switch only knows those ops (`queue.ts`, `sendOnce`). **That file is fenced.**
- **Design that respects the fence (recommended):** a separate `src/lib/offline/nutrition-outbox.ts` with the same mechanics, storing under its own kv key (`nutrition-outbox`), and **importing** (not editing) the helpers `isNetworkError`, `isAuthError`, `explainRefusal` from `queue.ts`. Its own retry timer and online/visibility listeners. Its pending/refused state is shown inside the food screens, because showing it in the bottom `SyncBanner` would require editing **`src/components/sync-banner.tsx` (fenced)**.
- Sign-out already wipes every kv key (`auth-provider.tsx:45,110`), so a nutrition outbox stored in kv is cleared with it; it should also clear its in-memory copy, which needs a small hook in `auth-provider.tsx` (not fenced).
- `tests/real-db/finish.test.ts` and `tests/outbox-pending.test.ts` are untouched by this design. New tests go in new files (`tests/nutrition-*.test.ts`).
- **Flag:** a unified banner and a single outbox would be cleaner long-term, but that means editing two fenced files. That is DECISIONS #15, not an assumption.

### 5.5 RLS the new tables would need
Follow `20261016000000_lockdown.sql` exactly:
- Every table: `enable row level security`; `user_id uuid not null default auth.uid() references public.users(id) on delete cascade`; one policy `for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))`.
- `recipe_ingredients`: no `user_id`; policy "via own recipe" like `routine_exercises` (`lockdown.sql:87`), plus a check that the referenced food/recipe belongs to the same user (a `can_use_food(uuid)` helper shaped like `can_use_exercise`, `lockdown.sql:43-58`).
- `food_entries.food_id` and `usuals`/`pantry_items`/`batches` references: `with check` must include `can_use_food(food_id)`.
- No global food table in v1 (staples are seeded per user), so no "library rows readable by all" policy is needed.
- `anon` gets nothing (inherited from the lockdown's default privileges, `lockdown.sql:26-29`).
- Migration names must sort after `20261109010000` (`HANDOFF.md:336`), and deploy only via the manual workflow.

---

## 6. Phased build plan (proposal, not authorization)

Every phase starts with the same Step 0: clean tree, `npm test` green at the recorded count, `npm run typecheck` and `npm run lint` clean, fenced files byte-identical to `657bd57` (or to whatever the owner later approves).

### N0 — Gates (no code)
- **Scope:** #44 finish-workout verified on the Fold8 (NOTES.md "Fix before features"); the three post-Nov-1 migrations confirmed live; the owner's answers to DECISIONS; USDA key created by the owner.
- **Touches:** nothing.
- **Proves it:** a NOTES.md line from the owner; Supabase dashboard migration list.

### N1 — Food data clients (USDA + OFF behind one interface)
- **Scope:** `RemoteFood` type, `NutrientKey` set, mapping tables of section 2 (with the OFF `trans-fat_100g` fix and IU handling), unit normalization, merged search with per-source limits, rate limiter, HTTP transport (CapacitorHttp on Android).
- **New files:** `src/lib/nutrition/nutrients.ts`, `src/lib/nutrition/sources/off.ts`, `src/lib/nutrition/sources/usda.ts`, `src/lib/nutrition/search.ts`, `src/lib/nutrition/http.ts`. **Touched:** none existing.
- **Fixtures:** recorded JSON responses (an OFF product with full nutriments, one with `nutriments` missing, one with string quantities; an FDC Branded search hit with `servingSize`; an FDC Foundation/SR food lacking 208 but having 957; a food with an IU vitamin) in `tests/fixtures/nutrition/`, with `tests/nutrition-sources.test.ts` asserting every mapped value and unit.
- **Gate:** one live request to each API from the APK to settle CORS/UA (1.1 note).
- **Features landing:** none user-visible.

### N2 — Diary core (with offline from day one)
- **Scope:** migration for `foods`, `food_entries`, `users.nutrition_prefs`, `users.nutrition_goals`; RLS per 5.5; entry math; snapshot; quick add; meal slots; day rule; phone mirror + `nutrition-outbox.ts`; food search screen and diary screen at `/food/`.
- **Surfaces in existing navigation and design language:** a new More section "Nutrition" with one `MORE_SECTIONS` entry ("Food diary", `href: "/food/"`, a lucide icon such as `Apple`), `/food/` added to the More tab's `also` list in `src/lib/nav.ts` so the tab lights up; a Home card in `src/components/home/` in the existing `Card`/glass style; screens built from `src/components/ui/` (`card`, `button`, `input`, `action-sheet`, `dialog`, `empty-state`, `skeleton`) and the workout keypad for amounts (`src/components/workout/keypad.tsx` or `radial-dial-keypad.tsx`). The tab bar stays at four tabs (DECISIONS #17).
- **Touches:** `src/lib/nav.ts`, `src/app/page.tsx` (one card), `src/components/providers/auth-provider.tsx` (sign-out hook), `src/types/database.ts` (regenerated), new `src/app/food/page.tsx`, `src/components/food/*`, `src/lib/nutrition/*`, `src/lib/offline/nutrition-outbox.ts`, one migration.
- **Fixtures:** `tests/nutrition-math.test.ts` (g/oz/ml/fl oz/serving/package, liquid rules, incomplete propagation), `tests/nutrition-outbox.test.ts` (offline insert, retry, refused kept, discard), mock backend support in `src/lib/supabase/mock-backend.ts` for the new tables, smoke test (`scripts/smoke-test.mjs`) extended with "log one food offline".
- **Features landing:** F3 (rule in the data model; manual setting first), F19, F20, F21, F22.

### N3 — Barcode
- **Scope:** scanner plugin (DECISIONS #4), scan → local match → OFF product → save to `foods`; not-found path offers "Create food" (or label snap later); offline path: save the barcode on a pending food for enrichment later (F21).
- **Touches:** `package.json`, `android/` (plugin sync; a new `CAMERA` permission, since the manifest has none today: `grep CAMERA android/app/src/main/AndroidManifest.xml` is empty), `src/components/food/scan-sheet.tsx`, `src/lib/nutrition/barcode.ts`.
- **Fixtures:** EAN-13/UPC-A normalization tests; OFF 404 fixture; device test on the Fold8 inner and cover screens (NEEDS-DEVICE-TEST).
- **Features landing:** none alone; unblocks F6.

### N4 — Recipes, batches, usuals, pantry
- **Scope:** `recipes`, `recipe_ingredients`, `batches`, `usuals`, `pantry_items`; recipe rollup and unpack; planned entries.
- **Fixtures:** recipe rollup (nested, cooked weight), batch portions decrement, pre-log confirm.
- **Features landing:** F6, F7, F8, F25.

### N5 — Goals and micros
- **Scope:** goals model (grams or %, per weekday, micros per DECISIONS #6), training/rest-day profiles, weekly budget, phase multipliers, hydration, supplements, fasting, caffeine.
- **Touches:** `src/lib/nutrition/goals.ts`, Home cards, a goals sheet under the food screen, reads of `today-plan.ts`, `programs`, `shifts.ts`.
- **Fixtures:** F1 rest vs training day, F23 banking across a week, F37 block change, F16 caffeine curve with a fixed half-life, F13 window across a night shift.
- **Features landing:** F1, F11, F12, F13, F16, F23, F37.

### N6 — IronLog day-view pairing and reports
- **Scope:** shared day view, post-workout prompt, evening nudge, weekly report card, clinician export, roster-aware planning, Basecamp card data, photos decision.
- **Touches:** `src/components/workout/finish-summary.tsx` (UI button only), `src/lib/native.ts` (notification channel), `src/lib/export-csv.ts` pattern, `android/app/src/main/java/com/ironlog/app/IronLogContentProvider.java` (new `nutrition` path), possibly `supabase/functions/weekly-recap` (only if DECISIONS #8 allows).
- **Fixtures:** day view joins a workout and food on the same food day; export snapshot test; finish flow regression: `tests/workout-finish.test.ts`, `tests/real-db/finish.test.ts`, `tests/outbox-pending.test.ts` all unchanged and passing.
- **Features landing:** F2, F14, F15, F26, F28, F30, F31.

### N7 — Capture, AI and native extras
- **Scope:** capture inbox, label snap, AI plate estimate and corrections, voice logging, protein-per-dollar, widget, student lens, leftovers, day story.
- **Touches:** new Edge Function(s) only if DECISIONS #8/#9 approve cloud routes; `android/` widget code for F29; content file for F34.
- **Fixtures:** OCR fixture images, AI response schema validation against a mocked provider (`_shared/claude.ts:20` already honors `ANTHROPIC_BASE_URL` for pointing tests at a mock), estimate badge always shown.
- **Features landing:** F4, F5, F9, F17, F29, F32, F33, F34, F35, F36.

### Stranded
- **F10 Grocery gap list:** its destination ("his existing shared grocery list") is not reachable from IronLog's code; no provider or API is referenced. It lands in N7 once the owner names the app and how it accepts items (DECISIONS #14).

### Phase totals
N2: 5 features · N4: 4 · N5: 7 · N6: 7 · N7: 10 · stranded: 1 → **34**.

---

## DECISIONS FOR THE OWNER

Pick one option per item. My recommendation is in bold.

1. **Meal structure.** (a) Fixed Breakfast/Lunch/Dinner/Snacks · (b) editable slots with time windows, like FoodYou · (c) free-form (entries only have a time). **Recommend (b)**, seeded with four slots, because night shifts make fixed names wrong.
2. **Data sources.** Open Food Facts on/off · USDA on/off · Swiss DB. **Recommend OFF on, USDA on, Swiss DB off.**
3. **USDA API key.** (a) He creates a free key at api.data.gov and pastes it into Settings (stored on the phone) · (b) the key lives in a Supabase function secret and the function proxies USDA · (c) use `DEMO_KEY`. **Recommend (a)**; (c) is too rate-limited.
4. **Barcode in v1, and which scanner.** (a) In v1 with an on-device ML Kit Capacitor plugin · (b) in v1 with a JavaScript decoder in the WebView · (c) later. **Recommend (a), as Phase N3.**
5. **Recipes in v1 or later.** **Recommend in v1 (N4)**, because meal-prep batches (F8) and leftovers (F35) depend on them.
6. **Micros scope.** (a) Full FoodYou set (43 nutrients) · (b) macros + fiber + sodium + sugars + caffeine + water · (c) (b) plus potassium, calcium, iron, vitamin D, B12. **Recommend (b) for display, store everything the sources send.** Also: derive sodium from salt (÷2.5) when only salt is given? **Recommend yes, marked as derived.**
7. **Weight tracking and Health Connect.** Weight: (a) keep IronLog's existing Body tab + Health Connect import · (b) anything new. **Recommend (a).** Nutrition/hydration to Health Connect: **recommend no for v1**, revisit after N5.
8. **AI routes for F5, F17, F33, F36 (and F14 if nutrition joins the weekly recap).** (a) No cloud AI: local parsing only, estimates entered by hand · (b) Gemini through a Supabase function (free tier, `_shared/gemini.ts` already exists) · (c) Claude through the existing function (`_shared/claude.ts`, paid per call). Every option except (a) sends food photos/descriptions off the phone and needs his knowing yes. **Recommend (a) for v1; if he wants AI, (b) as the $0 route, with a visible "sent to Google" note on each send.**
9. **Label OCR engine (F4).** (a) On-device ML Kit text recognition · (b) cloud AI vision (off-device). **Recommend (a).**
10. **Rollover source (F3).** (a) A manual "my day starts at" time in settings · (b) driven by his shifts (`work_shifts`): on a night-shift day the food day starts at wake time after the shift. **Recommend (a) in N2, (b) as an upgrade in N6.**
11. **Progress photos location (F26).** (a) Keep the current private Supabase bucket (they already leave the phone) · (b) move to on-device storage only · (c) on-device by default with optional cloud backup. **Recommend (c).** This changes existing body-tracking behavior, so it needs his explicit yes.
12. **Schedule and sleep sources (F31, F32).** Schedule: `users.work_shifts`, fallback default meal windows. Sleep: (a) the manual readiness entry (single latest value) · (b) a new per-night manual entry · (c) Health Connect sleep (new permission). **Recommend schedule as stated; sleep (c) with (b) as fallback, and the day story shows "no sleep data" when neither exists.**
13. **Denco staples pack content source (F22).** (a) Values from the FAO/INFOODS West African Food Composition Table, each item cited and marked "estimate" · (b) USDA SR equivalents · (c) he supplies his own. **Recommend (a), editable per food.** Which staples to include is his list.
14. **Grocery list destination (F10).** Name the app and how it accepts items (shared Android provider, a share-sheet text, or a Supabase table). **Until then F10 stays stranded.**
15. **Fenced files.** (a) Keep `queue.ts` and `sync-banner.tsx` untouched: a separate nutrition outbox with its status shown on the food screens · (b) approve editing both so food and workout changes share one outbox and one banner. **Recommend (a) for v1.**
16. **Student lens content source (F34).** (a) A curated, cited content file written from open references (e.g. NIH Office of Dietary Supplements fact sheets, MedlinePlus) · (b) AI-generated notes with citations (off-device, risk of errors) · (c) his own study notes. **Recommend (a) seeded, (c) addable;** every card says "educational, not medical advice".
17. **Where nutrition sits in navigation.** (a) Under More → "Nutrition" plus a Home card, tab bar unchanged · (b) a fifth bottom tab (changes the look of the tab bar). **Recommend (a) for v1.**
18. **Basecamp card (F15).** Basecamp-side changes are a separate project outside this repo. **Recommend IronLog only publishes the data (N6) and the Basecamp card is scoped in Basecamp's own thread.**

**DECISIONS count: 18.**
