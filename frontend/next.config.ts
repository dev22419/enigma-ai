import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

// The shared .env lives at the repo root, one level above this app.
loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const nextConfig: NextConfig = {
  /* config options here */
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
