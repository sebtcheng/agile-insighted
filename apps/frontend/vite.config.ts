import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The API runs on :4000 in development; the proxy keeps cookies same-origin so SameSite=Lax just works.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
