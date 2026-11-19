import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import type { UserDto } from "@myapp/shared";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import type { Actor } from "../permissions";

export const SIMULATION_COOKIE = "sim";

/** Signature binds the target to the real session token, so a cookie cannot outlive or move between sessions. */
function sign(sessionToken: string, targetId: string, secret = env.SESSION_SECRET): string {
  return createHmac("sha256", secret).update(`${sessionToken}:${targetId}`).digest("base64url");
}

export function signSimulation(sessionToken: string, targetId: string, secret?: string): string {
  return `${targetId}.${sign(sessionToken, targetId, secret)}`;
}

/** Returns the target user id when the cookie is authentic for this session token, else null. */
export function verifySimulation(
  sessionToken: string,
  cookie: unknown,
  secret?: string,
): string | null {
  if (typeof cookie !== "string") return null;
  const dot = cookie.indexOf(".");
  if (dot <= 0) return null;
  const targetId = cookie.slice(0, dot);
  const given = Buffer.from(cookie.slice(dot + 1));
  const expected = Buffer.from(sign(sessionToken, targetId, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return targetId;
}

/** Only an active team member can be simulated; the PM's own account and other PMs are excluded. */
export async function findSimulationTarget(
  targetId: string,
): Promise<(Actor & { email: string }) | null> {
  const [row] = await db
    .select({ id: users.id, fullName: users.fullName, role: users.role, email: users.email })
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.isActive, true), eq(users.role, "team_member")))
    .limit(1);
  return row ?? null;
}

export async function listSimulationCandidates(realUserId: string): Promise<UserDto[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "team_member"), ne(users.id, realUserId)))
    .orderBy(asc(users.fullName));
}
