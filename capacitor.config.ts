import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ironlog.app",
  appName: "Ironlog",
  webDir: "out",
  android: {
    backgroundColor: "#070507",
  },
  cordova: {
    accessOrigins: [
      "https://*.supabase.co",
      "https://accounts.google.com",
      "https://oauth2.googleapis.com",
    ],
  },
  plugins: {
    SystemBars: {
      style: "DARK",
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: "#070507",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_ironlog",
      iconColor: "#D4AF37",
    },
  },
};

export default config;
