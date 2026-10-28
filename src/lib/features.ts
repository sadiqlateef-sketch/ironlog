// Features that are built but switched off until they're ready to use.
// Turn one on by setting its variable when building the app. For the Android
// APK workflow, add a repository variable (Settings > Secrets and variables >
// Actions > Variables), e.g. FEATURE_WATCH = 1.

/** Linking a Wear OS watch (/link-watch/). Enabled for Galaxy Watch / Wear OS companion sync. */
export const WATCH_LINKING = true;

/** AI Form Coach & Biomechanics Guidance (Labs). */
export const AI_FORM_COACH = true;

/** Live Workout Mirroring & Partner Sync. */
export const PARTNER_SYNC = true;

/** Daily Readiness & Sleep Integration. */
export const READINESS_SCORE = true;
