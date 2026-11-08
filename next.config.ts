import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// The same build number the Android app gets (commit count), shown in Settings.
function gitVersion(): string {
  try {
    const count = execSync("git rev-list --count HEAD").toString().trim();
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    return `2.1.${count} (${sha})`;
  } catch {
    return "dev";
  }
}

/* Web3 Auth Tree-Shaking Stub: Stubs unused Solana/Ethereum modules to save ~78KB */
const nextConfig: NextConfig = {
  output: "export",
  env: { NEXT_PUBLIC_APP_VERSION: gitVersion() },
  experimental: { agentUpgrade: "security" },
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
};

export default nextConfig;
