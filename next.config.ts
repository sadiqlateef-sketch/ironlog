import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `npm run build` writes a plain HTML/JS site to `out/`.
  // Capacitor (Phase 5) wraps that folder into the Android app, so every page
  // talks to Supabase from the browser. Secret work (the Claude API key in
  // Phase 4) lives in Supabase Edge Functions, never in this app.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
