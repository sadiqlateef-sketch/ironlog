import type { CapacitorConfig } from "@capacitor/cli";

// The Android app wraps the static site in `out/` (built by `npm run build`).
// It talks to Supabase directly, so build with your hosted Supabase URL in
// .env.production.local: a phone can't reach 127.0.0.1 on your computer.
const config: CapacitorConfig = {
  appId: "com.ironlog.app",
  appName: "Ironlog",
  webDir: "out",
  android: {
    backgroundColor: "#0b0b0b",
  },
  plugins: {
    SystemBars: {
      // Light icons on the app's near-black background.
      style: "DARK",
    },
    SplashScreen: {
      // Hidden by the app once it has loaded (see src/lib/native.ts), with a
      // safety timeout in case something goes wrong.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: "#0b0b0b",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_ironlog",
      iconColor: "#aae841",
    },
  },
};

export default config;
