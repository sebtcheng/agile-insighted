import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { AppError } from "../errors";
import { createFixture, type Fixture } from "../test/helpers";
import { updateUser } from "./userService";

let f: Fixture;
beforeAll(async () => {
  f = await createFixture();
});
afterAll(async () => {
  await f.cleanup();
});

describe("updateUser email, role and password", () => {
  it("changes email (lowercased) and role, and stores a new password hash", async () => {
    const [before] = await db.select().from(users).where(eq(users.id, f.m1.id));
    const email = `Renamed-${f.m1.id.slice(0, 6)}@Test.Local`;
    const out = await updateUser(
      f.m1.id,
      { email, role: "pm", password: "another-password-1" },
      f.pm.id,
    );
    expect(out.email).toBe(email.toLowerCase());
    expect(out.role).toBe("pm");
    const [after] = await db.select().from(users).where(eq(users.id, f.m1.id));
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
  });

  it("rejects an email that another user already has with a 409", async () => {
    const [other] = await db.select().from(users).where(eq(users.id, f.m2.id));
    await expect(updateUser(f.m1.id, { email: other!.email }, f.pm.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("does not let a user change their own role", async () => {
    const err = await updateUser(f.pm.id, { role: "team_member" }, f.pm.id).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
  });
});
