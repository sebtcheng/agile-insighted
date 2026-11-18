import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool } from "./client";
import { logger } from "../logger";

const here = dirname(fileURLToPath(import.meta.url));

/** Applies pending migrations with a short lock_timeout so a stuck lock fails fast. */
export async function runMigrations(migrationsFolder = join(here, "../../drizzle")): Promise<void> {
  const pool = createPool({ applicationName: "myapp-migrate", lockTimeoutMs: 5000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => logger.info("migrations applied"))
    .catch((err: unknown) => {
      logger.error({ err }, "migration failed");
      process.exitCode = 1;
    });
}
