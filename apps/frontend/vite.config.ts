import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { devLogSink } from "./src/devtools/vite-plugin-dev-log-sink";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

// The API runs on :4000 in development; the proxy keeps cookies same-origin so SameSite=Lax just works.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || process.env.VITE_BASE_URL || "/trail/",
  plugins: [react(), devLogSink()],
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      "/api": apiTarget,
      "/trail/api": {
        target: apiTarget,
        rewrite: (path) => path.replace(/^\/trail/, ""),
      },
    },
  },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
