# IronLog fix plan: step by step

Written 2026-10-25 from `REVIEW.md`. Sadiq approved **all 25 items**. This plan is for the model doing the work (it may be a smaller model). Follow it **exactly, in order**. Each phase ends at a **CHECKPOINT**: do not start the next phase until every box in the checkpoint passes.

`REVIEW.md` explains *why* each item exists. Read the matching section when a step says "see D2" and so on.

---

## Rules for every phase

1. **One phase at a time.**
   - Do the steps.
   - Run the checkpoint.
   - Commit with a clear message (end it with the attribution lines your system prompt gives you).
   - Push.
   - Post a one-line update in the thread.
   - Then start the next phase.
2. **Never skip a checkpoint.** If a check fails:
   - Fix it inside the same phase.
   - If you can't fix it after 2 tries, **stop and tell Sadiq** what failed, with the exact error. Don't guess.
3. **📱 phases need Sadiq's phone.** When a checkpoint says 📱:
   - Post the listed phone steps to Sadiq in plain language.
   - **Wait for their answer** before the next phase.
   - Sadiq is a beginner with dev tools: give numbered, tap-by-tap steps with direct links.
4. **Change only the files the phase names.** If you think another file needs changing, say why in the commit message. Don't refactor or "clean up" anything else.
5. **Never delete Sadiq's workout data.** Nothing in this plan removes data from the phone's storage. If a step seems to, stop and ask.
6. **Keep the existing style.**
   - Short plain-English comments, like the code around them.
   - No new libraries unless the phase says so.
7. **Don't change** `REVIEW.md` findings. Do tick items off in `NOTES.md` (see the end of each batch).

### The checks (run them in this order)
From the repo root:

```bash
npm ci                 # once per session
npm test               # must stay all-pass (227 at the start, more as you add tests)
npm run lint           # baseline 4 errors; after Phase 2 it must be 0 errors
npm run typecheck      # after Phase 2 this works on a fresh clone
npm run build          # must finish and print the 14 routes
node scripts/smoke-test.mjs /tmp/smoke   # clicks through the app, must end "N/N checks passed"
```

About these checks:
- `scripts/smoke-test.mjs` runs the built app in a phone-sized Chrome, folded (412 px) and unfolded (884 px). It needs a build made **without** Supabase env files, so it uses the local test backend.
- It checks:
  - sign-in and that every main screen opens
  - start → log a set → finish
  - the finished workout does not come back
  - no page errors
- Look at a few screenshots in `/tmp/smoke` after any UI change.
- Never commit `.env*` files or screenshots.

### Git and PRs
- Work on the branch your system prompt names.
- **Batch 1** (Phases 1 to 5) goes on the open PR **#32**, which already holds `REVIEW.md` and Phase 1.
- After Sadiq merges a batch's PR, restart the branch from the latest `main`, as your system prompt describes for merged PRs. Put the next batch in a **new** PR.
- Never force-push someone else's branch, never merge PRs yourself, and never push to `main`.
- After each push, look at the PR's GitHub check `build` (Android APK). It must be green before you tell Sadiq a batch is ready.

---

## BATCH 1: approved items 1, 2, 3 + build health (PR #32)

### Phase 1: D10, phone APK builds on GitHub again ✅ DONE (commit `6fa4408`)
- `android/app/build.gradle` now uses the release key only when the keystore file exists. Otherwise debug builds use the normal debug key.
- **CHECKPOINT** (still to confirm):
  - [ ] PR #32's `build` check is **green** for the latest commit.
  - [ ] If it's red, read the log (`What went wrong:`), fix `android/app/build.gradle` only, and push again.
- **📱 Sadiq setup step (needed before any phone test in later phases).**
  - **Why:** GitHub's APK is signed with a different key than the app on the phone. Android won't install it as an update; it would have to uninstall first, which **erases the workouts stored on the phone**. To make GitHub sign with Sadiq's key, add four repository secrets.
  - Send Sadiq these steps (adapt the wording, keep the order):
    1. On the Windows PC, open **PowerShell**. Paste this, then press Enter:
       `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\sadiq\Projects\bujo-tasks\android\bujo-release.jks")) | Set-Clipboard`
       This copies the key file as text.
    2. Open https://github.com/sadiqlateef-sketch/ironlog/settings/secrets/actions and click **New repository secret** four times:
       - `ANDROID_KEYSTORE_BASE64` = paste (Ctrl+V)
       - `ANDROID_KEYSTORE_PASSWORD` = the keystore password
       - `ANDROID_KEY_ALIAS` = the key alias (Antigravity used `bujotasks`)
       - `ANDROID_KEY_PASSWORD` = the key password
    3. Tell Claude when it's done.
  - **Until this is done, phone testing should use an APK built on the PC in Android Studio** (it already has the key).

### Phase 2: D8, lint and typecheck green
**Files:**
- `package.json`
- `src/components/home/last-session-card.tsx`
- `src/components/home/next-session-card.tsx`
- `src/components/progress/hypertrophy-landmarks-card.tsx`
- `src/lib/overload-settings.ts`

**Steps:**
1. In `package.json`, change `"typecheck": "tsc --noEmit"` to `"typecheck": "next typegen && tsc --noEmit"`. (Checked: `npx next typegen` works with this Next version.)
2. Add a `"smoke": "node scripts/smoke-test.mjs"` script. Add `smoke-shots/` to `.gitignore`.
3. Run `npm run lint` and fix **only the 4 errors**:
   - **"Calling setState synchronously within an effect"** (`last-session-card.tsx` ~line 30, `next-session-card.tsx` ~line 46, `overload-settings.ts` line 79):
     - When the effect only sets the starting value from storage, move that read into the `useState(() => …)` initializer and delete the `setX(...)` line from the effect.
     - Keep the event-listener part of the effect as it is.
     - If the value comes from an async load, wrap the call like the other files do: `void Promise.resolve().then(() => { if (!ignore) load(); })` (see `src/hooks/use-workout.ts` around line 310).
   - **"Cannot call impure function during render"** (`hypertrophy-landmarks-card.tsx` line 38): it calls `Date.now()` / `new Date()` while rendering. Replace with `const [now] = useState(() => Date.now());` and use `now`.
4. Leave the warnings alone in this phase.

**CHECKPOINT:**
- [ ] `npm run lint`: **0 errors** (warnings OK).
- [ ] `rm -rf .next && npm run typecheck`: passes.
- [ ] `npm test`: all pass.
- [ ] `npm run build`: passes.
- [ ] `node scripts/smoke-test.mjs /tmp/smoke`: all pass.
- [ ] Open `/tmp/smoke/folded-home.png`: the Home cards look the same as before.

### Phase 3: D1, cloud-backed again (approved item 1). The biggest phase: go slowly.

**Goal:**
- With Supabase settings present (every real build), the app talks to Supabase again: real sign-in, real data, real AI functions.
- The local mock backend is used **only** when there are no Supabase settings (local testing and the smoke test).
- Workouts the phone saved in the mock since Oct 23 can be uploaded once.

Background: see REVIEW.md, D1 and 3.3. The mock lives in `src/lib/supabase/mock-backend.ts`. Its data is in the phone's `localStorage` under keys starting with `ironlog_table_`, plus `ironlog_custom_exercises`, `ironlog_programs`, `ironlog_routines`, `ironlog_profile`.

#### 3a. Only use the mock without settings
File: `src/lib/supabase/client.ts`.

1. Add this exported function above `getSupabase`:
   ```ts
   /**
    * True when the app has no Supabase project to talk to (local testing and
    * the smoke test). Then the local test backend in mock-backend.ts answers
    * everything. Real builds always have both settings.
    */
   export function isLocalBackend(): boolean {
     return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   }
   ```
2. In `fetchWithTimeout`, run the mock only in that case. Replace the `try { const mockRes = … } catch …` block with:
   ```ts
   if (isLocalBackend()) {
     try {
       const mockRes = await handleMockRequest(input, init);
       if (mockRes) return mockRes;
     } catch (err) {
       console.warn("Local test backend:", err);
     }
   }
   ```
3. Change the doc comment above `fetchWithTimeout` to: `/** Database calls give up after 12 seconds, so a dead connection doesn't freeze logging. (Without Supabase settings, the local test backend answers instead.) */`

#### 3b. Google button: no shortcut
File: `src/lib/google-sign-in.ts`.

- Wrap the "Offline direct sign-in" block (the `try { … signInWithPassword … }` at the top of `signInWithGoogle`) in `if (isLocalBackend()) { … }`.
- Import `isLocalBackend` from `@/lib/supabase/client`.
- Delete the hard-coded email line comment `// Offline direct sign-in for Sadiq Lateef` and write `// Local test backend: no Google, just sign in.`

#### 3c. Drop the fake sign-in left on the phone
The phone has a stored fake session (refresh token `ironlog-offline-refresh-token`, access token ending in `.ironlog_offline_sig`). It lasts 10 years and would make every real request fail.

File: `src/components/providers/auth-provider.tsx`. In the first `useEffect`, replace
`supabase.auth.getSession().then(({ data }) => setSession(data.session));`
with:
```ts
supabase.auth.getSession().then(async ({ data }) => {
  const s = data.session;
  // A sign-in made by the local test backend (Oct 23-25 builds) isn't a real
  // account: drop it so you sign in for real. Workouts it saved stay on the
  // phone for the one-time upload (see legacy-upload.ts).
  const fake = s && (s.refresh_token === "ironlog-offline-refresh-token" || s.access_token.endsWith(".ironlog_offline_sig"));
  if (fake && !isLocalBackend()) {
    await supabase.auth.signOut({ scope: "local" });
    await discardPending();
    await kvClear();
    setSession(null);
    return;
  }
  setSession(s);
});
```
Import `isLocalBackend` from `@/lib/supabase/client`. `discardPending` and `kvClear` are already imported.

**`kvClear` must only clear the IndexedDB store, not `localStorage`.** Check `src/lib/offline/kv.ts`. If it touches `localStorage`, stop and ask.

#### 3d. Stop the logger writing straight into mock storage
File: `src/lib/offline/workout-store.ts`. There are three blocks that start with `if (typeof window !== "undefined" && window.localStorage) {` and write `ironlog_table_workout_sessions` / `ironlog_table_workout_sets`:
- `startPlannedSession` (~line 245)
- `finishSession` (~line 290)
- `discardSession` (~line 325)

1. Change each condition to `if (isLocalBackend() && typeof window !== "undefined" && window.localStorage) {`.
2. Import `isLocalBackend` from `"../supabase/client.ts"`. This file uses relative `.ts` imports, so keep that style.

Do **not** delete these blocks: the smoke test and the local backend still need them.

#### 3e. One-time upload of the phone's workouts
Make a new file `src/lib/legacy-upload.ts`:

```ts
// Workouts logged while the app ran on the local test backend (the Oct 23-25
// builds) live only in this phone's localStorage. This sends the finished ones
// to your account once. Nothing on the phone is deleted.

import { getSupabase, isLocalBackend } from "./supabase/client.ts";
import { LOCAL_EXERCISES } from "./supabase/mock-backend.ts";

const DONE_KEY = "ironlog.legacy-upload.done";
type Row = Record<string, unknown>;

function read(key: string): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const finished = () => read("ironlog_table_workout_sessions").filter((s) => s.end_time && s.id);

/** How many saved-on-phone workouts are waiting to be uploaded (0 when done or not applicable). */
export function legacyWorkoutCount(): number {
  if (typeof window === "undefined" || isLocalBackend()) return 0;
  try {
    if (localStorage.getItem(DONE_KEY)) return 0;
  } catch {
    return 0;
  }
  return finished().length;
}

/** "Not now": don't ask again on this phone. */
export function skipLegacyUpload() {
  try {
    localStorage.setItem(DONE_KEY, "skipped");
  } catch {}
}

export interface UploadResult {
  workouts: number;
  sets: number;
  /** Exercises that couldn't be matched to your library (their sets weren't sent). */
  unmatched: string[];
  /** Workouts the server refused, with its message. */
  failed: string[];
}

export async function uploadLegacyWorkouts(): Promise<UploadResult> {
  const db = getSupabase();
  const sessions = finished();
  const sets = read("ironlog_table_workout_sets").filter((s) => s.session_id && (s.is_completed || s.completed_at));

  // The local backend used its own exercise ids: match them to your real library by slug, then by name.
  const local = new Map<string, { slug: string; name: string }>();
  for (const e of [...LOCAL_EXERCISES, ...read("ironlog_custom_exercises")] as Row[])
    local.set(String(e.id), { slug: String(e.slug ?? ""), name: String(e.name ?? "") });
  const { data: library, error: libErr } = await db.from("exercises").select("id, slug, name");
  if (libErr) throw new Error(libErr.message);
  const bySlug = new Map(library.map((e) => [e.slug, e.id]));
  const byName = new Map(library.map((e) => [e.name.toLowerCase(), e.id]));
  const realId = (id: string): string | null => {
    const e = local.get(id);
    if (!e) return library.some((x) => x.id === id) ? id : null;
    return bySlug.get(e.slug) ?? byName.get(e.name.toLowerCase()) ?? null;
  };

  const result: UploadResult = { workouts: 0, sets: 0, unmatched: [], failed: [] };
  for (const s of sessions) {
    const { error } = await db.from("workout_sessions").upsert(
      [{ id: String(s.id), name: (s.name as string) ?? "Workout", start_time: String(s.start_time), end_time: String(s.end_time), source: "web", notes: (s.notes as string) ?? null }],
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) {
      result.failed.push(`${s.name ?? "Workout"} (${String(s.start_time).slice(0, 10)}): ${error.message}`);
      continue;
    }
    const rows = [];
    for (const x of sets.filter((x) => x.session_id === s.id)) {
      const exercise_id = realId(String(x.exercise_id));
      if (!exercise_id) {
        const name = local.get(String(x.exercise_id))?.name ?? String(x.exercise_id);
        if (!result.unmatched.includes(name)) result.unmatched.push(name);
        continue;
      }
      rows.push({
        id: String(x.id), session_id: String(s.id), exercise_id,
        exercise_order: Number(x.exercise_order) || 1, set_number: Number(x.set_number) || 1,
        set_type: (x.set_type as string) ?? "normal", weight: Number(x.weight) || 0, reps: Number(x.reps) || 0,
        rpe: x.rpe == null ? null : Number(x.rpe), is_completed: true, notes: (x.notes as string) ?? null,
        duration_seconds: x.duration_seconds == null ? null : Number(x.duration_seconds),
        distance_m: x.distance_m == null ? null : Number(x.distance_m),
      });
    }
    if (rows.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: setErr } = await db.from("workout_sets").upsert(rows as any, { onConflict: "id", ignoreDuplicates: true });
      if (setErr) {
        result.failed.push(`${s.name ?? "Workout"} sets: ${setErr.message}`);
        continue;
      }
    }
    result.workouts++;
    result.sets += rows.length;
  }
  if (!result.failed.length) {
    try {
      localStorage.setItem(DONE_KEY, new Date().toISOString());
    } catch {}
  }
  return result;
}
```

Then:
1. In `src/lib/supabase/mock-backend.ts`, add one line right after the `DEFAULT_EXERCISES` array: `export const LOCAL_EXERCISES = DEFAULT_EXERCISES;`
2. Fix any type errors `npm run typecheck` shows in this file. For example, if `library` can be `null`, use `library ?? []`.

**The banner.** New file `src/components/legacy-upload-banner.tsx`. Copy the look of `src/components/sync-banner.tsx` (same `glass-strong` classes).
- When `legacyWorkoutCount() > 0`, show: **"N workouts from this phone aren't in your account yet."** with two buttons, **Upload** and **Not now**.
  - Read the count in a `useState(() => …)` initializer, not in an effect (see Phase 2).
- **Upload** shows a spinner, then calls `uploadLegacyWorkouts()`. Then it shows the result in the banner:
  - "Uploaded X workouts (Y sets)."
  - If there are unmatched exercises: "Couldn't match: A, B. Those sets stay on this phone."
  - If there are failures: "Some didn't upload: …  Tap Upload to try again." In this case keep the banner.
- **Not now** calls `skipLegacyUpload()` and hides the banner.
- Render it in `src/components/app-shell.tsx`, just above `<SyncBanner />`.

**Local-test badge.** In `app-shell.tsx`, when `isLocalBackend()` is true, show a small line at the top of `<main>`: "Test mode: not connected to your account". Use `text-set-warmup text-xs font-semibold`. This makes a build without Supabase settings obvious on the phone.

#### 3f. Tests
Add `tests/legacy-upload.test.ts`:
- Use the same `localStorage` shim style as `tests/workout-finish.test.ts`.
- Test that `legacyWorkoutCount()` returns 0 when `isLocalBackend()` is true. With no env vars in tests, it is true.
- Test that the slug matching maps `e1000000-0000-0000-0000-000000000001` to the library row with slug `back-squat`. To make this testable, move the matching into an exported pure function `matchExercise(localId, localIndex, library)` and test that.

**CHECKPOINT (automated):**
- [ ] `npm test`, `npm run lint` (0 errors), `npm run typecheck`, `npm run build`: all pass.
- [ ] Smoke test passes. This build has no env files, so it runs in test mode. The screenshots should show the "Test mode" line.
- [ ] Build once **with** fake settings to prove the mock is off:
  1. `printf 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x\n' > .env.production.local && npm run build`
  2. Serve `out/` (for example `cd out && python3 -m http.server 4321`). Open `/login/`, try signing in, and confirm it shows a network or sign-in **error**, not the app.
  3. Then `rm .env.production.local` and rebuild before the next phase.
- [ ] `git status` shows no `.env` files staged.

**CHECKPOINT 📱 (Sadiq):** Send these steps and wait.
1. **Before installing anything:** in the current app, go to More → Import & backup → **Back up everything** and save the file. This is a safety copy of the phone's workouts.
2. After PR #32 is merged, open https://github.com/sadiqlateef-sketch/ironlog/actions/workflows/supabase.yml, click **Run workflow** → **Run workflow**, and wait for the green check. This sends the server-side updates.
3. Install the new APK **as an update**, not by uninstalling first:
   - from GitHub (Actions → latest "Android APK" run → Artifacts → `ironlog-release`), only if Phase 1's secrets are set,
   - or built on the PC in Android Studio.
4. Open the app. You should land on the **sign-in screen**. Sign in with your real email or Google.
5. Check:
   - your **old workouts from before Oct 23** show on Progress → Activity
   - the exercise library has hundreds of exercises
6. A banner says "N workouts from this phone aren't in your account yet". Tap **Upload**, and tell Claude what the banner says after.
7. Start a workout, log one set, finish. Close and reopen the app: it must not come back.

If step 4 shows the app instead of sign-in, the build has no Supabase settings. Stop and check the repository secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

> **Also tell Sadiq:**
> - The Plans screen now offers Gemini by default. That needs a `GEMINI_API_KEY` secret in Supabase (Project → Edge Functions → Secrets). Without it, building a program says the key is missing.
> - Easiest fix: choose **Claude** on the Plans screen, which uses the key already set.

### Phase 4: D2, workout from a previous day (approved item 3)
**Files:**
- `src/lib/offline/workout-store.ts`
- `src/hooks/use-active-workout.ts`
- `src/hooks/use-workout.ts`
- `src/components/workout/workout-screen.tsx`
- `tests/workout-finish.test.ts`

**Steps:**
1. **12-hour window instead of "same day".** In `workout-store.ts`, add next to `isToday`:
   ```ts
   /** Workouts stay "in progress" for 12 hours, so one that runs past midnight isn't lost. */
   export const OPEN_HOURS = 12;
   export function isRecent(iso: string | null | undefined, now = Date.now()): boolean {
     if (!iso) return false;
     const t = new Date(iso).getTime();
     return Number.isFinite(t) && now - t < OPEN_HOURS * 3_600_000;
   }
   ```
   Keep `isToday` exported, because the tests use it.
2. **Remember a resumed old workout.** In `workout-store.ts`:
   - Add `const RESUMED_KEY = "resumed-session";`
   - Add a helper:
     ```ts
     /** In progress: not finished, and either recent or one you chose to resume. */
     async function isOpen(s: WorkoutSession | null | undefined): Promise<boolean> {
       if (!s || isSessionCompleted(s)) return false;
       return isRecent(s.start_time) || (await kvGet<string>(RESUMED_KEY)) === s.id;
     }
     ```
3. Replace every `isToday(...)` check in `peekActiveWorkout`, `getActiveSession` and `getStaleSession` with `isOpen` / `!isOpen`. Keep the structure: the same early returns and the same `writeMirror(null)` calls. `getStaleSession` returns a session that is unfinished **and not** `isOpen`.
4. `resumeStaleSession(session)`: before `writeMirror`, add `await kvSet(RESUMED_KEY, session.id);`. In `finishSession` and `discardSession`, add `await kvSet(RESUMED_KEY, null);` at the start.
5. In `use-active-workout.ts`, replace the two `!isToday(last.session.start_time)` checks with `!isRecent(last.session.start_time)`. A resumed old workout gets re-read straight away by `peekActiveWorkout` anyway.
6. In `use-workout.ts`, add `finishStale` next to `resumeStale`:
   ```ts
   /** Save an old unfinished workout as it is (its logged sets count). */
   const finishStale = useCallback(async () => {
     if (!staleSession) return;
     await resumeStaleSession(staleSession); // loads its sets, so the volume is right
     await finishSession(staleSession);
     setStaleSession(null);
     await load();
   }, [staleSession, load]);
   ```
   Then:
   - Return `finishStale`.
   - Rename the local idea of "close" to `hideStale = () => setStaleSession(null)` and return it too.
7. In `workout-screen.tsx` (~line 105-138), change the stale dialog. Picture: `mockup-4-overnight-workout.png` in the project files `ironlog-review/` folder.
   - `onOpenChange={(o) => !o && w.hideStale()}`. **Closing must never delete.**
   - Title: "You have a workout still open". Text: "{name} · started {weekday, time}".
   - Buttons, top to bottom:
     - **Keep logging it** → `w.resumeStale`
     - **Finish it now** → `w.finishStale` (secondary style)
     - **Delete it…** (red text button). The first tap changes its label to "Tap again to delete" (local state), and the second tap calls `w.discardStale`.
   - Small grey line: "Closing this keeps it."
   - Keep `data-testid="stale-workout-dialog"`, `resume-stale`, `discard-stale`. Add `finish-stale`.
8. Tests in `tests/workout-finish.test.ts`: add `isRecent` cases for 1 hour ago (true), 11 hours ago (true), 13 hours ago (false), and `null` (false).

**CHECKPOINT:**
- [ ] All checks pass (test, lint, typecheck, build, smoke).
- [ ] Extra browser check. Write it in your scratch folder, using `scripts/smoke-test.mjs` as the template:
  1. Sign in.
  2. Run `localStorage.setItem('ironlog_table_workout_sessions', JSON.stringify([{ id: crypto.randomUUID(), user_id: '11111111-1111-4111-8111-111111111111', name: 'Old one', start_time: new Date(Date.now() - 26*3600e3).toISOString(), end_time: null, volume: 0 }]))`
  3. Open `/workout/`. The dialog shows.
  4. Press **Escape**. The workout must still be in that `localStorage` list.
  5. Reload `/workout/`, tap **Keep logging it**. The logger must open with "Old one" and stay open after a reload.
  6. Finish it. The start screen shows, and no dialog.
  7. Seed again, tap **Delete it…** once. It must not be deleted yet. Tap again: it is deleted.
- [ ] Seed a workout started 2 hours ago (`Date.now() - 2*3600e3`). It opens straight into the logger with no dialog.

### Phase 5: D3, only one open workout
**Files:**
- `src/lib/offline/workout-store.ts`
- `src/components/home/center-start-button.tsx`

**Steps:**
1. At the top of `startPlannedSession`, before anything is created:
   ```ts
   // One workout at a time: starting a second would make finishing one pop the other open.
   const open = await readMirror();
   if (open && !isSessionCompleted(open.session)) throw new Error("one_active: finish or discard the workout you have open first");
   try {
     const { data } = await getSupabase().from("workout_sessions").select("id").is("end_time", null).limit(1);
     if (data?.length) throw new Error("one_active: finish or discard the workout you have open first");
   } catch (e) {
     if (!isNetworkError(e)) throw e; // no signal: the phone's copy above is the best we know
   }
   ```
   The existing screens already turn errors containing `one_active` into "Finish or discard your current workout first." Check with `grep -rn one_active src`.
2. In `center-start-button.tsx`: the `workout` prop is `undefined` while still loading. Disable the button until it is known: `disabled={busy || workout === undefined}`.
   - Check how `src/app/page.tsx` passes `workout`. If it passes `null` for "none", that works as is.
   - If it can't tell loading from none, leave this step out and say so in the commit.

**CHECKPOINT:**
- [ ] All checks pass.
- [ ] Browser check:
  1. Start an Empty workout.
  2. Seed a second unfinished one from 1 hour ago into `ironlog_table_workout_sessions`, like Phase 4.
  3. Go to Workout → Find, try to start a template. A "finish or discard first" message shows, and nothing new starts.
  4. Finish the open one. The seeded one **does** then open: that's expected, because it really is open. Finish it too. Workout shows the start screen.
- [ ] Update `NOTES.md`: move D1, D2, D3, D8, D10 from "Known bugs" to a "Done (awaiting phone check)" line.
- [ ] Post to Sadiq: "Batch 1 is ready in PR #32", plus the 📱 steps from Phase 3, and wait.

---

## BATCH 2: remaining defects (new PR after #32 merges)

### Phase 6: D5, watch weight reaches the phone
**File:** `src/hooks/use-workout.ts`, the `wearableBridge.onSetLogged` handler (~line 1177).

**Steps:**
1. Build two patches instead of one `updates` object:
   - **UI patch** (strings, in your unit):
     - `weight: toDisplay(data.weightKg, unit)` when `data.weightKg != null`
     - `reps: String(data.reps)` when `data.reps != null`
     - `rpe: data.rpe` when present
   - **DB patch** (numbers, kg):
     - `weight: data.weightKg`
     - `reps: data.reps`
     - `rpe: data.rpe`
2. Call `patchSet(block.order, targetSet.id, uiPatch)` and `await updateSet(targetSet.id, dbPatch)`.
3. `unit` must be in the effect's dependency list. Add it.
4. Add a pure helper `watchSetPatch(data, unit)` that returns `{ ui, db }`, and test it in a new `tests/watch-set.test.ts`. For example, `{weightKg: 100, reps: 5}` in imperial gives `ui.weight === "220.5"` (check `weightInput` rounding and use what it returns) and `db.weight === 100`.

**CHECKPOINT:**
- [ ] All checks pass.
- [ ] New test passes.
- [ ] 📱 (optional, only if Sadiq has the watch paired): log a set on the watch during a phone workout. The phone row shows the same weight.

### Phase 7: D6, periodization off by default, never silently
**Files:**
- `src/lib/overload-settings.ts` (line 29)
- `src/hooks/use-workout.ts` (~lines 258-273)

**Steps:**
1. Default `autoApplyPeriodization: false`.
   - This changes the default only. Someone who switched it on keeps it on.
   - Check how stored settings merge with defaults. If stored settings override defaults, nothing else is needed.
2. When it *is* on and changes the rep target, show the original: build `periodizedTargetNote` as `${phaseNote} · program: ${target.target_reps}${target.target_reps_max ? "-" + target.target_reps_max : ""} reps`, before the existing note.
3. Drop the routine's own `RPE x` text from the note when a phase RPE is shown, so there's only one RPE target. The phase label already includes its RPE.

**CHECKPOINT:**
- [ ] All checks pass.
- [ ] Smoke screenshot `folded-logger.png`: Back Squat now says **Target 5** (not 7), and no "Accumulation" text.
- [ ] Turn auto-apply on in Settings → Progressive overload. Start the workout again: you see "Target 7" **and** "program: 5 reps".

### Phase 8: D7, warm-up rows prefilled
**Files:**
- `src/lib/set-logic.ts`
- `src/lib/offline/workout-store.ts` (`startPlannedSession`)
- `tests/set-logic.test.ts`

**Steps:**
1. In `set-logic.ts` add:
   ```ts
   /** Weights for n warm-up sets before a working weight (kg): the last n of 50%, 70%, 85%, rounded to 2.5 kg. */
   export function warmupWeightsKg(workingKg: number, n: number): number[] {
     if (!(workingKg > 0) || n <= 0) return Array(Math.max(0, n)).fill(0);
     const pcts = [0.5, 0.7, 0.85].slice(-Math.min(n, 3));
     const out = pcts.map((p) => Math.max(0, Math.round((workingKg * p) / 2.5) * 2.5));
     while (out.length < n) out.unshift(out[0] ?? 0);
     return out;
   }
   ```
2. In `startPlannedSession`, the warm-up loop uses `weight: 0`. Use `warmupWeightsKg(item.weight_kg ?? 0, item.warmups ?? 0)[w]` instead. Import from `"../set-logic.ts"`, with a relative path as in this file.
   - If `set-logic.ts` imports something with `@/` that breaks the node tests, put the function in `src/lib/workout-logic.ts` instead and say so in the commit.
3. Tests:
   - 100 kg and 2 warm-ups → `[70, 85]`
   - 100 kg and 3 → `[50, 70, 85]`
   - 0 kg and 2 → `[0, 0]`

**CHECKPOINT:**
- [ ] All checks pass.
- [ ] Smoke screenshot: the Back Squat W rows show **70** and **85** (the mock routine's working weight is 100 kg), not 0.

### Phase 9: D4, a failed save is never silent
**Files:**
- `src/lib/offline/kv.ts`
- `src/lib/offline/queue.ts`
- `src/components/sync-banner.tsx`

**Steps:**
1. `kvSet` returns `Promise<boolean>`: `true` on success, `false` when IndexedDB failed. Today the `run()` helper resolves `undefined` on error. Make `kvSet` return `res !== undefined || <the request succeeded>`.
   - Simplest approach: have `run` resolve `{ ok: boolean, value }`, and keep `kvGet`'s return type unchanged.
2. In `queue.ts` `save()`: if `kvSet` returns false, `emit({ error: "Couldn't save on this phone (storage full?). Keep the app open until it syncs." })`.
3. `sync-banner.tsx` already shows pending state. Make it also show `s.error` when set: red text, with a tap that calls `clearSyncError()`.
4. In `mock-backend.ts` `setStored`, replace the empty `catch {}` with `catch (e) { console.error("Local test backend couldn't save", key, e); }`.

**CHECKPOINT:**
- [ ] All checks pass.
- [ ] A unit test: fake a failing `kvSet` (or test the banner text function) to confirm the error path sets `status.error`.

### Phase 10: D9, keystore password out of the code (📱 needs Sadiq first)
**Before coding, ask Sadiq:** "Your PC builds use a password written in the code. After this change, Android Studio needs it as a setting instead. OK to do it now?" If yes, give them these steps:
1. Windows Start → type "environment variables" → **Edit environment variables for your account**.
2. Add `IRONLOG_KEYSTORE_PASSWORD`, `IRONLOG_KEY_PASSWORD` (and `IRONLOG_KEY_ALIAS` = `bujotasks`).
3. Restart Android Studio.

Then, in `android/app/build.gradle` and `watch/android/app/build.gradle`, remove the `?: '…'` password and alias fallbacks: use `System.getenv('…')` only. Leave the debug.keystore lines in the watch file alone.

**CHECKPOINT:**
- [ ] PR `build` (Android APK) green.
- [ ] Watch APK workflow green.
- [ ] 📱 Sadiq builds once on the PC and it succeeds.

### End of batch 2
Update `NOTES.md` and post "Batch 2 ready" with the PR link. Wait for the merge.

---

## BATCH 3: quick wins (new PR)

Make one commit per phase, with screenshots folded and unfolded in your scratch folder. Before changing any UI, look at the matching mockup in project files `ironlog-review/`.

### Phase 11: Q1, one bottom dock in the logger, tabs hidden during a workout (📱)
**Picture:** `mockup-1-logger-folded.png`. Compare it with `current-logger-resting-folded.png`.

**Files:**
- `src/components/app-shell.tsx`
- `src/components/workout/workout-screen.tsx` (the `createPortal(…, slot)` bottom bar, ~line 665-745)
- `src/components/rest-timer-bar.tsx`

**Steps:**
1. In `app-shell.tsx`: when `onWorkout && workout`, don't render the `<nav>` tab bar. Add a small "‹ Home" link in the logger header instead.
2. In the logger's bottom bar:
   - Make it **solid** (`bg-card-solid`, not see-through).
   - When resting, show the countdown **inside** the same bar: a ring or number on the left, and "−15 / +15 / Skip" small buttons.
   - The big button stays on the right. Its label shows the next set: "Log ✓ · 230 × 5".
   - Use `useRestTimer()` for the countdown. Don't render `<RestTimerBar />` on the workout screen any more (`app-shell.tsx` line ~57 already hides it on other screens when a workout is open; check both cases).
3. Move "+ Add exercise" so it sits at the end of the exercise list, not under the bar. Give `<main>` enough bottom padding: measure the bar height and add 16 px.

**CHECKPOINT:**
- [ ] All checks pass. The smoke test may need its selectors updated. Keep `data-testid="log-set"` on the big button.
- [ ] Screenshots, folded:
  - no content shows through the bar
  - "+ Add exercise" is visible after scrolling
  - the bar plus rest takes ≤ 150 px of the 915 px height
- [ ] Unfolded still looks right.
- [ ] 📱 Sadiq tries one set on the phone, folded, one-handed.

### Phase 12: Q2, live volume and exercise count in the logger header
**Files:**
- `src/components/workout/workout-screen.tsx` (header ~line 440)
- `src/lib/workout-logic.ts` (pure helper and test)

**Steps:**
1. Add `liveVolume(blocks, unit)`: the sum of weight × reps for done, non-warm-up sets, in the user's unit, using `parseNumber`.
2. Show a chip "Vol 4,250 lb" (`toLocaleString`) and "Ex 2 of 5" under the timer.

**CHECKPOINT:**
- [ ] Unit test for `liveVolume`.
- [ ] Smoke passes.
- [ ] The chip appears after logging a working set.

### Phase 13: Q3, Discard moves into a menu
**File:** `workout-screen.tsx` header.

**Steps:**
1. Remove the red **Discard** button from the header.
2. Add "Discard workout" to the logger options sheet (`SlidersHorizontal` → `logger-options.tsx`), or keep only the existing bottom "Discard workout" button (`bottom-discard-button`). Prefer the second: just delete the header button.
3. Keep the confirm dialog.

**CHECKPOINT:**
- [ ] Smoke passes. Update the smoke test if it used `discard-button`.
- [ ] The header shows only the options icon and Finish.

### Phase 14: Q4, plates under barbell sets
**Files:**
- `src/components/workout/exercise-block.tsx`
- `src/lib/plates.ts` (use `calculatePlates`), plus `kitPlates`

**Step:** for plate-loaded exercises (`PLATE_LOADED` from `src/lib/labels.ts`), show one line under the set table for the current set's weight: "Plates: 45+45+2.5 /side". If `calculatePlates` can't hit the weight exactly, show "≈" and the achieved weight.

**CHECKPOINT:**
- [ ] Smoke passes.
- [ ] Screenshot shows the line under Back Squat.

### Phase 15: Q6, per-set notes
**Files:**
- `src/components/workout/set-row.tsx` (hold menu)
- `src/hooks/use-workout.ts`

**Steps:**
1. In the hold (long-press) menu add "Note on this set".
2. It opens the existing `NotesSheet` with `title="Set note"`.
3. Save via `updateSet(id, { notes })`. The column `workout_sets.notes` exists.
4. Show a small note icon on rows that have one.

**CHECKPOINT:**
- [ ] Smoke passes.
- [ ] Browser check: add a note, reload, and the note icon is still there.

### Phase 16: Q5, AMRAP set type and tempo (database change)
**Files:**
- new migration `supabase/migrations/2026102600000_amrap_tempo.sql`. **Name it with a timestamp later than every existing migration**: check `ls supabase/migrations`.
- `src/types/database.ts`
- `set-row.tsx`, `workout-editor.tsx`, `exercise-block.tsx`

**Steps:**
1. Migration:
   ```sql
   alter type public.set_type add value if not exists 'amrap';
   alter table public.routine_exercises add column if not exists tempo text check (tempo is null or tempo ~ '^[0-9X]-[0-9X]-[0-9X]-[0-9X]$');
   ```
   First check the enum's real name with `grep -n "create type" supabase/migrations/*.sql`.
2. Add `"amrap"` to `SetType` in `database.ts`, and `tempo: string | null` to the routine_exercises Row/Insert/Update types.
3. The set type cycle/menu gets "AMRAP" (label "A", colour like failure but gold).
4. In the routine/workout editor, add an optional Tempo field. The logger shows "Tempo 3-1-1-0" in the target line.

**CHECKPOINT:**
- [ ] All checks pass.
- [ ] Tell Sadiq: after merge, run **Deploy database and functions** again.

### Phase 17: Q7, Home header and naming
**Files:**
- `src/app/page.tsx` (lines ~69-95: remove the Progress/More header buttons, keep the title and greeting)
- the text in `components/home/next-session-card.tsx`, `workout/planned-tab.tsx`, `workout/find-tab.tsx`, `more/more-screen.tsx`

**Step:** use **"Programs"** everywhere a program/plan is meant: "Choose program", "Build a program", "Find a program". Don't rename routes or files.

**CHECKPOINT:**
- [ ] Smoke passes.
- [ ] `grep -rn "Choose Plan\|Build new hypertrophy plan\|Find a plan" src` returns nothing.

### Phase 18: Q8, Progress deck back to app colours
**Files:**
- `src/components/progress/progress-index-hero-card.tsx`, `strength-pattern-card.tsx`, `stimulus-volume-card.tsx`, `movement-balance-card.tsx`, `hypertrophy-landmarks-card.tsx`
- `src/app/globals.css` (`--progress-purple*`)

**Steps:**
1. Replace `--progress-purple*` uses with existing tokens: `--primary`, `--primary-text`, `--accent`, `--border`, `--card`.
2. Then delete the purple tokens from `globals.css`, in both the dark and light blocks.
3. With no workouts in the week, the hero card shows "No workouts yet this week" and **no score and no ⚠️**.
4. Check the light theme too (Settings → Appearance → Light).

**CHECKPOINT:**
- [ ] Smoke passes.
- [ ] `grep -rn "progress-purple" src` returns nothing.
- [ ] Screenshots in dark and light.

### End of batch 3
Update `NOTES.md` and post "Batch 3 ready" with screenshots attached (before/after for Q1). Wait.

---

## BATCH 4: projects (one PR each, in this order)

Each project starts by posting a short plan (files, what changes) for Sadiq. **Wait for "go"** for P1 and P2, because they change how screens look; show the mockup again with the question.

### Phase 19: P1, two-column Home when unfolded
**Picture:** `mockup-2-home-unfolded.png`.

**Files:** `src/app/page.tsx`, `src/components/home/*`.

**Step:** wrap the cards in `grid gap-4 md:grid-cols-[1.15fr_1fr]`:
- **Left column:** start button and Today/next session card, then the week strip (reuse the streak calendar row from `progress/activity.tsx` if it is easy, or a simple 7-day row).
- **Right column:** last session and recovery chips (from `body-heatmap`/`recovery.ts` data).
- Folded (< `md`) stays a single column, in the same order as now.

**CHECKPOINT:**
- [ ] Smoke passes.
- [ ] Unfolded screenshot looks like the mockup.
- [ ] Folded is unchanged.
- [ ] 📱 Sadiq checks folded and unfolded.

### Phase 20: P2, Progress summary first
**Picture:** `mockup-3-progress-folded.png`.

**Files:** `src/app/progress/page.tsx`, `src/components/progress/overview.tsx`.

**Steps:**
1. At the top of Overview, show three cards:
   - "This week": workouts / target, volume, new PRs
   - "Main lifts": e1RM sparkline for squat, bench, deadlift and OHP, if logged
   - "Needs attention": the plateau detector output from `insights.ts`
2. Every other card goes inside collapsible sections: Muscles and recovery · Volume charts · Streaks and calendar · Training science · Tools.
   - Use a `<details>` element styled like a card, so nothing new is needed.
   - Remember open sections in `localStorage` (wrapped in try/catch).
3. Unfolded: the sections become two columns.

**CHECKPOINT:**
- [ ] Smoke passes.
- [ ] The folded Overview first screen shows all three summary cards without scrolling.
- [ ] Every old card is still reachable.

### Phase 21: P3, missed-rep auto-adjust on the phone
**Files:** `src/lib/set-logic.ts` (`suggestWeight`), `tests/set-logic.test.ts`.

**Steps:**
1. Add an input `previousSessions?: PrevSet[][]` (last 2 sessions).
2. If **both** missed the bottom of the rep range (`repMin`) on the top working weight, return `{ weight: round(top * 0.9 to the step), from: top, why: "Missed your reps twice: drop 10% and build back" }`.
3. Wire it from `use-workout.ts`. Add a helper next to `getLastPerformance` in `workout-api.ts` that fetches the 2nd-last performance (same query, offset 1).

**CHECKPOINT:**
- [ ] New tests for the drop case and the no-drop case.
- [ ] Smoke passes.

### Phase 22: P5, land the open PRs (#18 reset email, #22 deload weeks, #20 Health Connect)
Do these one at a time, each on its own branch:
1. Merge `main` into it (never rebase someone else's branch).
2. Resolve conflicts, keeping both sides' behaviour.
3. Run all checks and push.
4. Post to Sadiq.

Each has setup steps in its PR description. Repeat them to Sadiq when it's ready.

**CHECKPOINT (per PR):**
- [ ] All checks pass.
- [ ] Android build green.
- [ ] 📱 Sadiq tests the feature.

### Phase 23: P4, circuit mode
**Files:** `use-workout.ts` (`toggleSuperset` → allow 3+ in a group), `exercise-block.tsx`, `workout-screen.tsx` (`focusAfterLog`).

**Step:** when a superset group has 3 or more exercises, call it a "Circuit". Log Set moves to the next exercise in the group, and rest starts only after the last one in the round.

**CHECKPOINT:**
- [ ] Unit test for the "next in round" helper.
- [ ] Smoke passes.
- [ ] Browser check with 3 exercises.

### Phase 24: P6, Bujo "today's plan" read hook (design only, then ask)
Write a half-page design in `NOTES.md` ("Next"):
- a new ContentProvider table `today_plan`
- Home pushes `next_routine_name`, the week and day, and the exercise list through `IronLogEcosystemPlugin`, like `upsertWorkoutRecord`
- what Bujo Tasks reads

**Stop and ask Sadiq** before building.

### Phase 25: P7, archive agent leftovers
1. Move `MASTER_AGENT.md`, `MASTER_FIX_PLAYBOOK.md`, `INVENTORY.md`, `PHASES.md`, `BACKLOG.md`, `HANDOFF.md`, the old `PLAN.md`, `scripts/master-audit-fixes.mjs`, `scripts/full-verification.mjs`, `scripts/e2e-device-test.mjs` and `scripts/inspect-dom.mjs` into `docs/archive/`. Use `git mv`.
2. Add one line at the top of each moved doc: "Archived 2026: outdated, see REVIEW.md / NOTES.md."
3. Check that nothing imports or runs them: `grep -rn "master-audit\|full-verification" . --include=*.json --include=*.yml`.

**CHECKPOINT:**
- [ ] All checks pass.

---

## When everything is done
1. `NOTES.md`: every item ticked, and "Verified on my phone" filled in from Sadiq's answers.
2. Tell Sadiq:
   - run **Deploy database and functions** once
   - rebuild the phone and watch APKs
   
   Include links:
   - https://github.com/sadiqlateef-sketch/ironlog/actions/workflows/supabase.yml
   - https://github.com/sadiqlateef-sketch/ironlog/actions/workflows/android.yml
   - https://github.com/sadiqlateef-sketch/ironlog/actions/workflows/watch.yml
