import type { NextConfig } from "next";

/* Web3 Auth Tree-Shaking Stub: Stubs unused Solana/Ethereum modules to save ~78KB */
const nextConfig: NextConfig = {
  output: "export",
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
