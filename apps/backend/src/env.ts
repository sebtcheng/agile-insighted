import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

/** Load the nearest .env walking up from the working directory (repo root in this monorepo). */
function loadDotenv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16).default("dev-only-session-secret-change-me"),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .default(24 * 7),
  TZ: z.string().default("Asia/Manila"),
  APP_TIMEZONE: z.string().default("Asia/Manila"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Names of the bad variables only; never echo values (they may be secrets).
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data.SESSION_SECRET === "dev-only-session-secret-change-me"
  ) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return parsed.data;
}

export const env: Env = loadEnv();
