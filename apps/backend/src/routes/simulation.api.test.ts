import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Me = {
  user: { id: string; role: string };
  isSimulating: boolean;
  realUser: { id: string } | null;
};
const app = createApp();
let f: Fixture;

async function loginAs(email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/login").send({ email, password: f.password })).status).toBe(
    200,
  );
  return agent;
}

beforeAll(async () => {
  f = await createFixture();
});
afterAll(async () => {
  await f.cleanup();
});

describe("PM simulation", () => {
  it("rejects a non-PM starting a simulation", async () => {
    const member = await loginAs(f.m1.email);
    const res = await member.post("/api/auth/simulation").send({ userId: f.m2.id });
    expect(res.status).toBe(403);
  });

  it("resolves the session as the target, then exit restores the PM", async () => {
    const pm = await loginAs(f.pm.email);
    expect((await pm.post("/api/auth/simulation").send({ userId: f.m1.id })).status).toBe(200);

    const during = (await pm.get("/api/auth/me")).body as Me;
    expect(during.user.id).toBe(f.m1.id);
    expect(during.user.role).toBe("team_member");
    expect(during.isSimulating).toBe(true);
    expect(during.realUser?.id).toBe(f.pm.id);
    // Effective permissions are the member's: PM-only endpoints are now forbidden.
    expect((await pm.post("/api/users").send({})).status).toBe(403);
    // Nested simulation is refused, but exit still works.
    expect((await pm.post("/api/auth/simulation").send({ userId: f.m2.id })).status).toBe(409);

    expect((await pm.post("/api/auth/simulation/exit")).status).toBe(204);
    const after = (await pm.get("/api/auth/me")).body as Me;
    expect(after.user.id).toBe(f.pm.id);
    expect(after.isSimulating).toBe(false);
    expect(after.realUser).toBeNull();
  });

  it("refuses to simulate yourself", async () => {
    const pm = await loginAs(f.pm.email);
    expect((await pm.post("/api/auth/simulation").send({ userId: f.pm.id })).status).toBe(400);
  });
});
