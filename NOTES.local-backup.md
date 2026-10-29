# NOTES

## Decisions

- **Stacked Progress Analytics Deck (`ProgressAnalyticsDeck`)**:
  - Rather than scrolling through separate full-page cards for Progress Index Hero, 1RM Strength Patterns, Stimulus Volume, Movement Balance, and RP Hypertrophy Landmarks, organized these high-density metrics into a single responsive stacked deck with horizontal pill sub-tabs (`Index`, `Strength`, `Volume`, `Balance`, `Hypertrophy`).
- **Periodization Auto-Adjust Engine (`src/lib/periodization.ts`)**:
  - Implemented scientific phase wave models (Accumulation, Intensification, Peak, Deload) supporting linear, undulating, block, and reverse periodization.
  - Automatically modulates user target weights (+2.5% to +5% or deload -10%) and rep targets according to the active mesocycle phase while maintaining user exercise selections.
- **Double-Progression & Overload Rule Customization (`OverloadSettingsSheet`)**:
  - Added dedicated configuration sheet for user-defined micro-increments (e.g., +2.5 lb / +5 lb for upper body, +5 lb / +10 lb for lower body, bodyweight progression options).
  - Wired directly into the workout engine (`src/hooks/use-workout.ts` and `src/lib/set-logic.ts`).
- **Cockpit Dashboard Architecture (`src/app/page.tsx`)**:
  - Restructured home screen with top quick-access controls: Progress link on upper left, Settings/More on upper right.
  - Placed large, prominent Center Start Workout action button flanked by dynamic Last Session debrief and Next Session blueprint cards with real muscle recovery metrics.
- **Scientifically Grounded Hypertrophy Programs (`src/lib/templates.ts`)**:
  - Added 4 curated multi-day splits: RP Hypertrophy PPLUL 5-Day, Arnold Classic 6-Day, PHAT Power & Hypertrophy 5-Day, and Pure Lengthened Hypertrophy 4-Day using standardized exercise slug references.
- **Ecosystem Signature Permission Isolation**:
  - Retained `com.sadiqlateef.bujotasks.permission.READ_WRITE_DATA` on `IronLogContentProvider` for inter-app sync with BujoTasks, Braindump, and Budget, while stripping deprecated permissions.

---

## Verified on my phone

- **Target Device**: Physical Samsung Galaxy phone connected via ADB (`192.168.1.185:5555`, package `com.ironlog.app`).
- **Home Cockpit**:
  - Upper-left Progress shortcut and upper-right More shortcut navigation verified.
  - Center "Start Workout" button triggers active session with correct day and week labeling.
  - Last Session Debrief card and Next Session Blueprint render live volume, working set counts, and muscle readiness percentages.
- **Progress Deck & Tabs**:
  - Progress sub-tab switcher toggles between Index, Strength, Volume, Balance, and Hypertrophy without layout shifts.
  - Periodization Engine card displays current active mesocycle phase, wave progress bar, and "Auto-Apply ON" status badge.
- **Native Android APK & WebView**:
  - Debug APK built and installed via `adb install -r`.
  - WebView remote debugging enabled (`WebView.setWebContentsDebuggingEnabled(true)` in `MainActivity.java`).
  - Unit tests passing: 227/227 tests passing across the workspace.

---

## Known bugs / half-finished

- **Empty State Fallback vs. Live Data Density**:
  - For brand new lifters with 0 logged workouts, the Progress Index and Strength cards show educational baseline templates; once real sets are logged, the historical 6-week rolling calculation takes over, but initial multi-year charts require at least 2 distinct calendar months of logs to populate trend curves.
- **Wear OS Standalone Network Fallback**:
  - Galaxy Watch companion app has local plan seeding and offline caching, but direct watch-to-cloud sync when completely detached from the phone still falls back to phone DataLayer sync when offline.
- **Plate Calculator Metric Sleeve Toggle**:
  - Olympic Barbell sleeve visualizer defaults to imperial 45 lb bar and standard 45/35/25/10/5/2.5 lb plates; kg Olympic bumper configuration (20 kg bar, 25/20/15/10/5/2.5/1.25 kg plates) requires manual unit preference toggle in settings.

---

## Next

- **Production APK Release Packaging**:
  - Assemble signed release APK using `gradlew assembleRelease` with `bujo-release.jks`.
- **Health Connect Integration**:
  - Connect Android Health Connect API for seamless automatic import of resting heart rate, active calories, and sleep recovery scores into the daily strain model.
- **Workout Plan Customizer Expansion**:
  - Add in-app drag-and-drop reordering for routine exercises directly inside `ModifyProgramSheet`.
- **Multi-Device Wear OS Bluetooth Verification**:
  - Perform live in-gym workout run with Galaxy Watch8 paired via Wearable Data Layer to verify real-time rep completion and haptic rest timer alerts.
