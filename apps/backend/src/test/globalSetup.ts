import { runMigrations } from "../db/migrate";

/** Brings the test database to the latest schema before any test file runs. */
export default async function setup(): Promise<void> {
  await runMigrations();
}
