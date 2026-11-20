import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { projects } from "../db/schema";
import { createFixture, type Fixture } from "../test/helpers";

type ErrorBody = { error: { code: string; message: string } };
type ActivityBody = { activity: { id: string; status: string; isBlocked: boolean } };
type ListBody = { items: Array<{ id: string }>; nextCursor: string | null };
/** supertest types res.body as any; this gives each assertion an explicit shape. */
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: ReturnType<typeof request.agent>;
let member: ReturnType<typeof request.agent>;
let anon: ReturnType<typeof request.agent>;
let memberActivityId: string;
let otherActivityId: string;

async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password: f.password });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  f = await createFixture();
  pm = await loginAs(f.pm.email);
  member = await loginAs(f.m1.email);
  anon = request.agent(app);
  const own = await pm
    .post(`/api/projects/${f.project.id}/activities`)
    .send({ title: "Mine", assigneeId: f.m1.id });
  const other = await pm
    .post(`/api/projects/${f.project.id}/activities`)
    .send({ title: "Theirs", assigneeId: f.m2.id });
  memberActivityId = json<ActivityBody>(own).activity.id;
  otherActivityId = json<ActivityBody>(other).activity.id;
});
/** Projects created through the API in these tests; removed before the fixture so the PM user can be deleted. */
const projectIds: string[] = [];
afterAll(async () => {
  if (projectIds.length > 0) await db.delete(projects).where(inArray(projects.id, projectIds));
  await f.cleanup();
});

describe("auth", () => {
  it("sets an HttpOnly SameSite=Lax session cookie and never returns the hash", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: f.pm.email, password: f.password });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });
  it("rejects a wrong password and an unknown email the same way", async () => {
    const a = await request(app)
      .post("/api/auth/login")
      .send({ email: f.pm.email, password: "wrong-password" });
    const b = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@test.local", password: "wrong-password" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });
  it("ends the session on logout", async () => {
    const agent = await loginAs(f.m2.email);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("permission map per write endpoint", () => {
  const writes: Array<{
    name: string;
    call: (a: ReturnType<typeof request.agent>) => request.Test;
  }> = [
    {
      name: "POST /users",
      call: (a) =>
        a
          .post("/api/users")
          .send({ email: "x@test.local", fullName: "X", password: "long-enough-pw" }),
    },
    {
      name: "PATCH /users/:id",
      call: (a) => a.patch(`/api/users/${f.m2.id}`).send({ fullName: "Renamed" }),
    },
    {
      name: "DELETE /users/:id",
      call: (a) => a.delete(`/api/users/${f.pm.id}`),
    },
    {
      name: "PATCH /projects/:id (archive)",
      call: (a) => a.patch(`/api/projects/${f.project.id}`).send({ archived: true }),
    },
    {
      name: "POST /projects/:id/subprojects",
      call: (a) => a.post(`/api/projects/${f.project.id}/subprojects`).send({ name: "New" }),
    },
    {
      name: "PATCH /subprojects/:id",
      call: (a) => a.patch(`/api/subprojects/${f.subA.id}`).send({ health: "at_risk" }),
    },
    {
      name: "POST /projects/:id/sprints",
      call: (a) =>
        a
          .post(`/api/projects/${f.project.id}/sprints`)
          .send({ name: "Sx", startDate: "2026-05-01", endDate: "2026-05-14" }),
    },
    {
      name: "PATCH /sprints/:id",
      call: (a) => a.patch(`/api/sprints/${f.sprint.id}`).send({ capacityItems: 5 }),
    },
    {
      name: "POST /projects/:id/activities",
      call: (a) => a.post(`/api/projects/${f.project.id}/activities`).send({ title: "New" }),
    },
    { name: "DELETE /activities/:id", call: (a) => a.delete(`/api/activities/${otherActivityId}`) },
    { name: "POST /tags", call: (a) => a.post("/api/tags").send({ name: `tag-${f.tag}` }) },
  ];

  it.each(writes)("$name returns 401 when signed out", async ({ call }) => {
    expect((await call(anon)).status).toBe(401);
  });

  // DELETE runs last in the PM list so it cannot affect the other cases.
  it.each(writes)("$name returns 403 for a team member", async ({ call }) => {
    const res = await call(member);
    expect(res.status).toBe(403);
    expect(json<ErrorBody>(res).error.code).toBe("forbidden");
  });

  it("lets the PM use PM-only endpoints", async () => {
    expect((await pm.post("/api/tags").send({ name: `tag-${f.tag}` })).status).toBe(201);
    expect(
      (await pm.patch(`/api/subprojects/${f.subA.id}`).send({ health: "at_risk" })).status,
    ).toBe(200);
  });

  it("renames a user, rejects a blank name, and refuses self-deletion", async () => {
    const made = await pm.post("/api/users").send({
      email: `rename-${f.tag}@test.local`,
      fullName: "Before",
      password: "long-enough-pw",
    });
    expect(made.status).toBe(201);
    const id = json<{ id: string }>(made).id;
    const renamed = await pm.patch(`/api/users/${id}`).send({ fullName: "  After  " });
    expect(renamed.status).toBe(200);
    expect(json<{ fullName: string }>(renamed).fullName).toBe("After");
    expect((await pm.patch(`/api/users/${id}`).send({ fullName: "   " })).status).toBe(400);
    expect((await pm.delete(`/api/users/${f.pm.id}`)).status).toBe(403);
    expect((await pm.delete(`/api/users/${id}`)).status).toBe(204);
    expect((await pm.delete(`/api/users/${id}`)).status).toBe(404);
  });

  it("lets team members comment on any activity", async () => {
    const res = await member
      .post(`/api/activities/${otherActivityId}/comments`)
      .send({ body: "Looks good" });
    expect(res.status).toBe(201);
  });

  it("rejects an empty comment with a 4xx", async () => {
    const res = await member
      .post(`/api/activities/${otherActivityId}/comments`)
      .send({ body: "   " });
    expect(res.status).toBe(400);
  });
});

describe("team member activity updates", () => {
  it("can update status, progress and blocker on their own activity", async () => {
    const res = await member
      .patch(`/api/activities/${memberActivityId}`)
      .send({ status: "in_progress", percentComplete: 25 });
    expect(res.status).toBe(200);
    expect(json<ActivityBody>(res).activity.status).toBe("in_progress");
    const blocked = await member
      .patch(`/api/activities/${memberActivityId}`)
      .send({ isBlocked: true, blockedReason: "Waiting on API" });
    expect(json<ActivityBody>(blocked).activity.isBlocked).toBe(true);
  });
  it("cannot update an activity assigned to someone else", async () => {
    const res = await member
      .patch(`/api/activities/${otherActivityId}`)
      .send({ status: "in_progress" });
    expect(res.status).toBe(403);
  });
  it("cannot change fields beyond progress and blockers", async () => {
    expect(
      (await member.patch(`/api/activities/${memberActivityId}`).send({ title: "Rename" })).status,
    ).toBe(403);
  });
  it("gets a clear 422, not a 500, for a blocker without a reason", async () => {
    const res = await member
      .patch(`/api/activities/${memberActivityId}`)
      .send({ isBlocked: true, blockedReason: "" });
    expect(res.status).toBe(422);
    expect(json<ErrorBody>(res).error.message).toMatch(/reason/i);
  });
});

describe("errors and validation", () => {
  it("uses the standard error shape and never leaks internals", async () => {
    const res = await pm.get("/api/activities/not-a-uuid");
    expect(res.status).toBe(400);
    expect(Object.keys(json<ErrorBody>(res))).toEqual(["error"]);
    expect(json<ErrorBody>(res).error).toHaveProperty("code");
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|at \w+/);
  });
  it("returns 404 for unknown routes and records", async () => {
    expect((await pm.get("/api/nope")).status).toBe(404);
    expect((await pm.get("/api/activities/00000000-0000-7000-8000-000000000000")).status).toBe(404);
  });
  it("generates unique sequential project codes and ignores a client code", async () => {
    const created: string[] = [];
    for (const name of ["Gen A", "Gen B"]) {
      const res = await pm.post("/api/projects").send({ name, code: "HACK" });
      expect(res.status).toBe(201);
      created.push(json<{ id: string; code: string }>(res).code);
      projectIds.push(json<{ id: string }>(res).id);
    }
    expect(created[0]).toMatch(/^PROJ-\d{2,}$/);
    expect(created[1]).toMatch(/^PROJ-\d{2,}$/);
    expect(created).not.toContain("HACK");
    expect(Number(created[1]?.slice(5))).toBeGreaterThan(Number(created[0]?.slice(5)));
    expect(f.project.code).not.toBe(created[0]);
  });
  it("never produces a duplicate project code under parallel creates", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => pm.post("/api/projects").send({ name: `Par ${i}` })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const codes = results.map((r) => json<{ code: string }>(r).code);
    projectIds.push(...results.map((r) => json<{ id: string }>(r).id));
    expect(new Set(codes).size).toBe(8);
  });
  it("does not let a project code be edited", async () => {
    const res = await pm.post("/api/projects").send({ name: "Fixed code" });
    const p = json<{ id: string; code: string }>(res);
    projectIds.push(p.id);
    const patched = await pm.patch(`/api/projects/${p.id}`).send({ name: "Renamed", code: "NOPE" });
    expect(patched.status).toBe(200);
    expect(json<{ code: string; name: string }>(patched)).toMatchObject({
      code: p.code,
      name: "Renamed",
    });
  });
  it("keeps the subproject code system-generated and persists the assigned team member", async () => {
    const made = json<{ id: string; code: string; leadId: string | null }>(
      await pm
        .post(`/api/projects/${f.project.id}/subprojects`)
        .send({ name: "Assigned", leadId: f.m1.id, code: "HACK-1" }),
    );
    expect(made.code).toMatch(/^PRJ-\d{2,}$/);
    expect(made.leadId).toBe(f.m1.id);
    const patched = json<{ code: string; name: string }>(
      await pm.patch(`/api/subprojects/${made.id}`).send({ name: "Renamed", code: "HACK-2" }),
    );
    expect(patched.code).toBe(made.code);
    expect(patched.name).toBe("Renamed");
    const list = json<{ items: Array<{ id: string; leadId: string | null; leadName?: string }> }>(
      await pm.get(`/api/projects/${f.project.id}/subprojects`),
    );
    const row = list.items.find((x) => x.id === made.id);
    expect(row?.leadId).toBe(f.m1.id);
    expect(row?.leadName).toBeTruthy();
    const cleared = json<{ leadId: string | null }>(
      await pm.patch(`/api/subprojects/${made.id}`).send({ leadId: null }),
    );
    expect(cleared.leadId).toBeNull();
    expect(
      (
        await pm
          .patch(`/api/subprojects/${made.id}`)
          .send({ leadId: "00000000-0000-4000-8000-000000000000" })
      ).status,
    ).toBe(404);
    await pm.delete(`/api/subprojects/${made.id}`);
  });
  it("lists projects with subprojects, and guards deletes", async () => {
    const tree = await pm.get("/api/projects?withSubprojects=true");
    expect(tree.status).toBe(200);
    const row = json<{ items: Array<{ id: string; subprojects: Array<{ projectId: string }> }> }>(
      tree,
    ).items.find((p) => p.id === f.project.id);
    expect(row?.subprojects.length).toBeGreaterThan(0);
    expect(row?.subprojects.every((s) => s.projectId === f.project.id)).toBe(true);

    const made = await pm
      .post(`/api/projects/${f.project.id}/subprojects`)
      .send({ name: "Disposable", code: "IGNORED" });
    expect(made.status).toBe(201);
    const next = await pm.post(`/api/projects/${f.project.id}/subprojects`).send({ name: "Again" });
    expect(next.status).toBe(201);
    const a = json<{ id: string; code: string }>(made).code;
    const b = json<{ id: string; code: string }>(next).code;
    expect(a).toMatch(/^PRJ-\d{2,}$/);
    expect(Number(b.slice(4))).toBe(Number(a.slice(4)) + 1);
    expect((await pm.delete(`/api/subprojects/${json<{ id: string }>(next).id}`)).status).toBe(204);
    const id = json<{ id: string }>(made).id;
    expect((await pm.delete(`/api/subprojects/${id}`)).status).toBe(204);
    expect((await pm.delete(`/api/subprojects/${id}`)).status).toBe(404);
    // in use: subA has activities/stories in the fixture or at least the project has subprojects
    expect((await pm.delete(`/api/projects/${f.project.id}`)).status).toBe(409);
    expect((await member.delete(`/api/subprojects/${id}`)).status).toBe(403);
  });
  it("requires JSON bodies on writes", async () => {
    const res = await pm.post("/api/tags").set("Content-Type", "text/plain").send("name=x");
    expect(res.status).toBe(415);
  });
  it("paginates activities with a keyset cursor", async () => {
    const first = await pm.get(`/api/activities?projectId=${f.project.id}&limit=1`);
    const page1 = json<ListBody>(first);
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBeTruthy();
    const second = await pm.get(
      `/api/activities?projectId=${f.project.id}&limit=1&cursor=${page1.nextCursor ?? ""}`,
    );
    expect(json<ListBody>(second).items[0]?.id).not.toBe(page1.items[0]?.id);
  });
});
