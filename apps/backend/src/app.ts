import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env";
import { logger } from "./logger";
import { errorHandler, loadUser, notFoundHandler, requestId, requireJsonBody } from "./middleware";
import { api } from "./routes";

/** Middleware order: request ID -> pino-http -> Helmet -> rate limit -> body parser -> routes -> error handler. */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => String(res.locals.requestId),
      customProps: (_req, res) => ({ requestId: String(res.locals.requestId) }),
    }),
  );
  app.use(helmet());
  if (env.NODE_ENV !== "test") {
    app.use(
      "/api",
      rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-7", legacyHeaders: false }),
    );
    app.use(
      "/api/auth/login",
      rateLimit({
        windowMs: 15 * 60_000,
        limit: 20,
        standardHeaders: "draft-7",
        legacyHeaders: false,
      }),
    );
  }
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(requireJsonBody);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api", loadUser, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
