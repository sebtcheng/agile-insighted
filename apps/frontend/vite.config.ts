import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { devLogSink } from "./src/devtools/vite-plugin-dev-log-sink";

// The API runs on :4000 in development; the proxy keeps cookies same-origin so SameSite=Lax just works.
export default defineConfig({
  plugins: [react(), devLogSink()],
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:4000" },
  },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
