# IronLog nutrition, Phase N1 report

## Step 0

- Branch `main`, baseline `657bd57`, local `main` == `origin/main`.
- 297 tests green at baseline.
- Typecheck had 3 pre-existing errors: `tests/live-workout-flow.test.ts` (2) and `tests/wger-takes.test.ts` (1). N1 could not fix them under the new-files-only rule, so the gate was held as "no new errors".
- Lint at baseline: 0 errors, 69 warnings.
- `CapacitorHttp` is exported by `@capacitor/core` 8.5.3.

## Items

| # | Item | Files | Commit |
|---|------|-------|--------|
| 1 | Nutrient model | `src/lib/nutrition/nutrients.ts`, `src/lib/nutrition/types.ts` | `b3a51f0` |
| 2 | HTTP transport | `src/lib/nutrition/http.ts` | `1b658ba` |
| 3 | Open Food Facts client | `src/lib/nutrition/sources/off.ts` | `a1e0bca` |
| 4 | USDA client | `src/lib/nutrition/sources/usda.ts` | `34c8713` |
| 5 | Merged search interface | `src/lib/nutrition/search.ts`, `tests/nutrition-search.test.ts` | `370791e` |
| 6 | Completeness score and energy sanity flag (extras A+B) | `src/lib/nutrition/quality.ts`, `tests/nutrition-quality.test.ts` | `e28e51d` |

Items 1-4 are tested in `tests/nutrition-sources.test.ts` against the fixtures below.

What the tests prove:

- **Items 1-4** (`tests/nutrition-sources.test.ts`): the 43-key nutrient model and its helpers; unit conversion; the error type, user agent and rate limiter; OFF and USDA mapping against recorded records (identity, serving, every nutrient value, derived sodium from salt, derived energy 4P+4C+9F when USDA 208 and 957 are absent, IU values dropped, keying on nutrient number not FDC id); client status mapping (404, 429, 503, 403) and local rate-limit refusal, all with a fake `HttpGet` and no network.
- **Item 5** (`tests/nutrition-search.test.ts`, 10 tests, fake clients): barcode detection; barcode routed to OFF `getProduct` while USDA still gets the text query; text query to OFF `search`; per-source limits (explicit and default 50); in-source dedupe on lowercase-trimmed name, brand-or-null and barcode-or-null; cross-source duplicates kept; one source failing returns the other plus an `errors` entry; non-`NutritionError` throws wrapped as `unavailable`; a source that is not provided is never called.
- **Item 6** (`tests/nutrition-quality.test.ts`, 10 tests): completeness counts complete and derived values only; real Pringles OFF record and real USDA cheddar record are not flagged; a crafted record (energy 100 against P10/C50/F30, computed 510) is flagged and left unmodified; tolerance is configurable; derived energy (`usda-energy-449.json`) returns null; unknown macros return null.

## Fixtures (`tests/fixtures/nutrition/`)

| File | Status | Notes |
|------|--------|-------|
| `off-full.json` | Real | Pringles, OFF product 0038000138416, fetched 2026-11-12, nutriments trimmed to consumed keys |
| `off-no-nutriments.json` | Real | Cocoa puffs, genuinely has no nutriments object |
| `off-string-qty-salt-only.json` | Edited real record | Coca-Cola Original; quantities rewritten as strings, sodium removed, salt set to 0.25. Provenance inside the file |
| `usda-branded-search.json` | Real | Search hits 2095236 and 2596517 (cheddar cheese), trimmed |
| `usda-energy-957.json` | Real | Foundation food 2003591, energy only as number 957 |
| `usda-energy-449.json` | Edited real record | Same food with the 957 energy row removed (no real food with neither 208 nor 957 but with 203/204/205 turned up). Provenance inside the file |
| `usda-iu.json` | Real | Hit 2340698, vitamin D (324) reported in IU |

The OFF search fixture used by the client tests was built from real product records, because `search.pl` returned 503 while recording.

## Extras

Extras A (completeness score) and B (energy sanity flag) were approved by the owner in chat on 2026-11-12 and live in `quality.ts` in their own commit.

## Fence and modified-file proof

`git diff --name-only 657bd57 HEAD`:

```
src/lib/nutrition/http.ts
src/lib/nutrition/nutrients.ts
src/lib/nutrition/quality.ts
src/lib/nutrition/search.ts
src/lib/nutrition/sources/off.ts
src/lib/nutrition/sources/usda.ts
src/lib/nutrition/types.ts
tests/fixtures/nutrition/off-full.json
tests/fixtures/nutrition/off-no-nutriments.json
tests/fixtures/nutrition/off-string-qty-salt-only.json
tests/fixtures/nutrition/usda-branded-search.json
tests/fixtures/nutrition/usda-energy-449.json
tests/fixtures/nutrition/usda-energy-957.json
tests/fixtures/nutrition/usda-iu.json
tests/nutrition-quality.test.ts
tests/nutrition-search.test.ts
tests/nutrition-sources.test.ts
```

`git diff --name-status --diff-filter=M 657bd57 HEAD`: empty (no existing file modified).

Fence check (`src/lib/offline/queue.ts`, `src/components/sync-banner.tsx`, `tests/real-db/finish.test.ts`, `tests/outbox-pending.test.ts`): `FENCE-OK`.

Key check: `git grep -n "DEMO_KEY\|api_key=" -- src tests` returns nothing. No key literal is written anywhere.

## Live gate

NEEDS-DEVICE-TEST. CapacitorHttp only runs inside the Android app; this session cannot drive a dev build on the phone. USDA key for the probe: DEMO_KEY (owner's key not used).

### Supplementary curl probe (NOT the gate)

Run from the shell on 2026-11-12 with User-Agent `IronLog/dev (personal strength-training app)`; only status codes recorded.

| Request | HTTP status |
|---------|-------------|
| OFF product lookup, barcode 3017620422003 | 200 |
| USDA foods search, query=apple | 200 |
| OFF `search.pl`, search_terms=apple | 503 |

## End gates

- `npm test`: 363 tests, 363 pass, 0 fail (baseline 297).
- `npm run typecheck`: only the 3 pre-existing errors (2 in `tests/live-workout-flow.test.ts`, 1 in `tests/wger-takes.test.ts`); no new errors.
- `npm run lint`: 0 errors, 69 warnings (same as baseline); 0 problems in nutrition files.

## Findings

a. USDA nutrient 324 (vitamin D) arrives in IU in real data, so it is always dropped under the map's unit rule. FDC also publishes 328 (vitamin D, µg), which is not mapped. Mapping 328 would give a usable value.
b. USDA `getFood` on 404 throws `not-found`, while OFF `getProduct` on 404 returns null. Callers must handle the two differently.
c. OFF `search.pl` returned 503 repeatedly (while recording fixtures and again in the live probe). OFF search should be treated as unreliable; the merged search already degrades to the other source with an `errors` entry.
d. Commit trailers name a different model than the brief specified. Cosmetic.

## Addendum — vitamin D fallback (owner-approved 2026-11-12)

Finding (a) is resolved: the USDA mapper now reads nutrient 328 (vitamin D, µg) when 324 gives no usable value (324 usually arrives in IU). A usable 324 still wins, and when 328 fills vitamin D it is removed from `droppedUnits`. Two new tests; `npm test` is now 365/365, typecheck still shows only the 3 pre-existing errors, and lint is clean on the nutrition files.
