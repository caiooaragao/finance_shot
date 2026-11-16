import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["undici"],
  experimental: {
    agentFeedback: true,
  },
  async rewrites() {
    return [
      { source: "/health", destination: "/api/health" },
      { source: "/trades/recent", destination: "/api/trades/recent" },
      { source: "/trades/:ticker", destination: "/api/trades/:ticker" },
      { source: "/trades", destination: "/api/trades" },
      { source: "/workflow/retry", destination: "/api/workflow/retry" },
      { source: "/workflow", destination: "/api/workflow" },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
