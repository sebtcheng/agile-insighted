import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { env } from "../env";
import type { Actor } from "../permissions";

export const SESSION_COOKIE = "sid";

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id });

// A real hash to verify against when the email is unknown, so timing does not reveal valid emails.
const DUMMY_HASH = await argon2.hash("not-a-real-password", { type: argon2.argon2id });

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: Actor } | null> {
  const [row] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  const ok = await argon2.verify(row?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
  if (!row || !ok || !row.isActive) return null;
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId: row.id,
    expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000),
  });
  return { token, user: { id: row.id, fullName: row.fullName, role: row.role } };
}

export async function userForToken(token: string): Promise<(Actor & { email: string }) | null> {
  const [row] = await db
    .select({ id: users.id, fullName: users.fullName, role: users.role, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function logout(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function deleteExpiredSessions(): Promise<number> {
  const res = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.tokenHash });
  return res.length;
}
