import type { NextConfig } from "next";

/** Set by `pnpm app:build`: a self-contained server for the desktop app, built beside the dev server's `.next`. */
const appBuild = process.env.MOTHERSHIP_APP_BUILD === "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  ...(appBuild
    ? {
        output: "standalone" as const,
        distDir: ".next-app",
        // The server runs from inside the signed app; writing its page cache there would break the signature.
        experimental: { isrFlushToDisk: false },
      }
    : {}),
  // The scripts bind to 127.0.0.1; allow that host for dev assets and HMR too, however the server was started.
  allowedDevOrigins: ["127.0.0.1"],
  // The floating dev badge sits on top of the sidebar; build errors still show as an overlay.
  devIndicators: false,
  partialPrefetching: true,
  // Agent SDKs spawn bundled CLI binaries and must stay as real node_modules.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@openai/codex-sdk", "@modelcontextprotocol/sdk"],
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
