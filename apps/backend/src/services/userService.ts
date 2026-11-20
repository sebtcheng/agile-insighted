import { asc, eq } from "drizzle-orm";
import type { CreateUserInput, UpdateUserInput, UserDto } from "@myapp/shared";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { conflict, forbidden, notFound, pgErrorOf } from "../errors";
import { hashPassword } from "./authService";

const columns = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  isActive: users.isActive,
};

export async function listUsers(): Promise<UserDto[]> {
  return db.select(columns).from(users).orderBy(asc(users.fullName));
}

export async function createUser(input: CreateUserInput): Promise<UserDto> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning(columns);
  if (!row) throw new Error("insert returned no row");
  return row;
}

/**
 * Deletes a member. Many tables reference users with ON DELETE RESTRICT (created-by, reporter and
 * similar), so a member with recorded work cannot be removed; they should be deactivated instead.
 */
export async function deleteUser(id: string, actorId: string): Promise<void> {
  if (id === actorId) throw forbidden("You cannot delete your own account");
  try {
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, id));
      const deleted = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
      if (deleted.length === 0) throw notFound("User");
    });
  } catch (err) {
    if (pgErrorOf(err)?.code === "23503") {
      throw conflict(
        "This member has recorded work and cannot be deleted. Deactivate them instead.",
      );
    }
    throw err;
  }
}

export async function updateUser(
  id: string,
  patch: UpdateUserInput,
  actorId?: string,
): Promise<UserDto> {
  if (patch.role !== undefined && id === actorId) {
    throw forbidden("You cannot change your own role");
  }
  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.fullName !== undefined) set.fullName = patch.fullName;
  if (patch.email !== undefined) set.email = patch.email.toLowerCase();
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.password !== undefined) set.passwordHash = await hashPassword(patch.password);
  try {
    return await db.transaction(async (tx) => {
      const [row] =
        Object.keys(set).length > 0
          ? await tx.update(users).set(set).where(eq(users.id, id)).returning(columns)
          : await tx.select(columns).from(users).where(eq(users.id, id)).limit(1);
      if (!row) throw notFound("User");
      // Deactivating or resetting a password ends that user's sessions.
      if (patch.isActive === false || patch.password !== undefined) {
        await tx.delete(sessions).where(eq(sessions.userId, id));
      }
      return row;
    });
  } catch (err) {
    if (pgErrorOf(err)?.code === "23505") throw conflict("That email is already in use");
    throw err;
  }
}
