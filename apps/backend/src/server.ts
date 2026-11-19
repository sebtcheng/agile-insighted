import "./devtools/dev-bootstrap";
import { createApp } from "./app";
import { pool } from "./db/client";
import { env } from "./env";
import { logger } from "./logger";
import { deleteExpiredSessions } from "./services/authService";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

// Daily cleanup of expired sessions.
const cleanup = setInterval(() => {
  deleteExpiredSessions()
    .then((n) => logger.info({ deleted: n }, "expired sessions removed"))
    .catch((err: unknown) => logger.error({ err }, "session cleanup failed"));
}, 24 * 3_600_000);
cleanup.unref();

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    pool
      .end()
      .catch((err: unknown) => logger.error({ err }, "pool close failed"))
      .finally(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
