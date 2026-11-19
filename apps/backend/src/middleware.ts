import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { z, type ZodType } from "zod";
import {
  AppError,
  badRequest,
  forbidden,
  toErrorBody,
  translatePgError,
  unauthorized,
} from "./errors";
import { logger } from "./logger";
import { can, type Action, type Actor } from "./permissions";
import { SESSION_COOKIE, userForToken } from "./services/authService";
import { SIMULATION_COOKIE, findSimulationTarget, verifySimulation } from "./services/simulation";

export type AuthedActor = Actor & { email: string };

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Loads the signed-in user from the session cookie, if any. */
export const loadUser: RequestHandler = asyncHandler(async (req, res, next) => {
  const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    const user = await userForToken(token);
    if (user) {
      res.locals.user = user;
      res.locals.realUser = user;
      res.locals.sessionToken = token;
      // A valid signed simulation cookie swaps the effective user; only a PM session may carry one.
      const cookies = req.cookies as Record<string, unknown> | undefined;
      const targetId = verifySimulation(token, cookies?.[SIMULATION_COOKIE]);
      if (targetId && user.role === "pm") {
        const target = await findSimulationTarget(targetId);
        if (target) res.locals.user = target;
      }
    }
  }
  next();
});

/** The really authenticated user, ignoring any active simulation. */
export function realActorOf(res: Response): AuthedActor {
  const user = res.locals.realUser as AuthedActor | undefined;
  if (!user) throw unauthorized();
  return user;
}

export function actorOf(res: Response): AuthedActor {
  const user = res.locals.user as AuthedActor | undefined;
  if (!user) throw unauthorized();
  return user;
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  try {
    actorOf(res);
    next();
  } catch (err) {
    next(err);
  }
};

/** 401 if signed out, 403 if the permission map denies the action. */
export const requireAction =
  (action: Action): RequestHandler =>
  (_req, res, next) => {
    try {
      if (!can(actorOf(res), action)) throw forbidden();
      next();
    } catch (err) {
      next(err);
    }
  };

/** Rejects state-changing requests that are not JSON, a cheap CSRF guard alongside SameSite=Lax. */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  const safe = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  const hasBody = Number(req.header("content-length") ?? 0) > 0;
  if (!safe && hasBody && !req.is("application/json")) {
    next(new AppError(415, "unsupported_media_type", "Send application/json"));
    return;
  }
  next();
};

export function parse<S extends ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      "The request was not valid",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

export const idParam = (req: Request, name = "id"): string =>
  parse(z.string().uuid(), req.params[name]);

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "not_found", "Route not found"));
};

/** The one error handler: typed errors pass through, DB constraint errors become 4xx, everything else is a generic 500. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const known = err instanceof AppError ? err : translatePgError(err);
  const requestIdValue: unknown = res.locals.requestId;
  if (known) {
    res.status(known.status).json(toErrorBody(known));
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json(toErrorBody(badRequest("The request body was not valid JSON")));
    return;
  }
  logger.error({ err, requestId: requestIdValue, path: req.path }, "unhandled error");
  res.status(500).json(toErrorBody(new AppError(500, "internal_error", "Something went wrong")));
};
