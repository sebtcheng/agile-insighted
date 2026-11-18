import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Pooled client. Timeouts are sent as startup parameters, not session `SET`s, so the
 * connection stays safe behind PgBouncer transaction pooling (PgBouncer must list these
 * in ignore_startup_parameters if it rejects them).
 */
export function createPool(
  overrides: { applicationName?: string; lockTimeoutMs?: number } = {},
): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    application_name: overrides.applicationName ?? "myapp-backend",
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
    options: overrides.lockTimeoutMs ? `-c lock_timeout=${overrides.lockTimeoutMs}` : undefined,
  });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pool-level db or an open transaction. */
export type DbOrTx = Db | Tx;

export { schema };
