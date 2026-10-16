// Features that are built but switched off until they're ready to use.
// Turn one on by setting its variable when building the app. For the Android
// APK workflow, add a repository variable (Settings > Secrets and variables >
// Actions > Variables), e.g. FEATURE_WATCH = 1.

/** Linking a Wear OS watch (/link-watch/). On with NEXT_PUBLIC_FEATURE_WATCH=1. */
export const WATCH_LINKING = process.env.NEXT_PUBLIC_FEATURE_WATCH === "1";
