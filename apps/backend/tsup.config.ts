import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/db/migrate.ts", "src/db/seed.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // @myapp/shared ships TypeScript source, so bundle it in.
  noExternal: ["@myapp/shared"],
});
