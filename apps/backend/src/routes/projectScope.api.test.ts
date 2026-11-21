import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectDto } from "@myapp/shared";
import { createApp } from "../app";
import { db } from "../db/client";
import { projects } from "../db/schema";
import { inArray } from "drizzle-orm";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";

/**
 * Project visibility rule (documented by these tests): a PM manages every project and is unrestricted;
 * a team member sees only projects they own or belong to, everywhere, and gets 404 for anything else.
 */
type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let m1: Agent;
let m2: Agent;
let hiddenActivityId: string;
let visibleActivityId: string;
const extraProjectIds: string[] = [];

async function loginAs(email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/login").send({ email, password: f.password })).status).toBe(
    200,
  );
  return agent;
}

beforeAll(async () => {
  f = await createFixture();
  [pm, m1, m2] = await Promise.all([loginAs(f.pm.email), loginAs(f.m1.email), loginAs(f.m2.email)]);
  visibleActivityId = (await rawActivity(f.project.id, f.pm.id, { assigneeId: f.m1.id })).id;
  hiddenActivityId = (await rawActivity(f.otherProject.id, f.pm.id, { assigneeId: f.m1.id })).id;
});
it("shows every team member the same org-wide Workload as a PM", async () => {
  type Wl = {
    items: Array<{ userId: string; dueThisWeek: number }>;
    members: Array<{ userId: string | null; total: number; completed: number }>;
  };
  const asPm = json<Wl>(await pm.get("/api/workload"));
  const asMember = json<Wl>(await m1.get("/api/workload"));
  // The roster includes the PM and people on other projects, and the counts match what the PM sees.
  expect(asMember.items.map((r) => r.userId)).toEqual(asPm.items.map((r) => r.userId));
  expect(asMember.items.some((r) => r.userId === f.pm.id)).toBe(true);
  expect(asMember.items.some((r) => r.userId === f.m2.id)).toBe(true);
  expect(asMember.members.map((m) => [m.userId, m.total, m.completed])).toEqual(
    asPm.members.map((m) => [m.userId, m.total, m.completed]),
  );
  // Seeing the roster does not open any other project's data.
  const acts = json<{ items: Array<{ id: string }> }>(await m1.get("/api/activities")).items;
  expect(acts.map((a) => a.id)).not.toContain(hiddenActivityId);
  expect((await m1.get("/api/admin-log")).status).toBe(403);
});

it("lets any role create a project, which then belongs to them", async () => {
  const res = await m1.post("/api/projects").send({ name: `Member project ${f.tag}` });
  expect(res.status).toBe(201);
  const created = json<ProjectDto>(res);
  extraProjectIds.push(created.id);
  const mine = json<{ items: ProjectDto[] }>(await m1.get("/api/projects")).items.map((p) => p.id);
  expect(mine).toContain(created.id);
  // Created for someone else, the creator is still added as a member so it stays visible to them.
  const other = json<ProjectDto>(
    await m1
      .post("/api/projects")
      .send({ name: `Owned by PM ${f.tag}`, ownerId: f.pm.id, memberIds: [] }),
  );
  extraProjectIds.push(other.id);
  const again = json<{ items: ProjectDto[] }>(await m1.get("/api/projects")).items.map((p) => p.id);
  expect(again).toContain(other.id);
});

it("lists each project with its owner and team, and lets any role edit but not archive", async () => {
  const mk = json<ProjectDto>(
    await m1
      .post("/api/projects")
      .send({ name: `Team view ${f.tag}`, ownerId: f.pm.id, memberIds: [f.m2.id] }),
  );
  extraProjectIds.push(mk.id);
  const list = json<{ items: ProjectDto[] }>(await m1.get("/api/projects")).items;
  const row = list.find((p) => p.id === mk.id)!;
  expect(row.ownerName).toBe(f.pm.fullName);
  expect(row.members?.map((m) => m.id).sort()).toEqual([f.m1.id, f.m2.id].sort());
  // A project with an owner but nobody else still lists cleanly.
  const solo = json<ProjectDto>(await m1.post("/api/projects").send({ name: `Solo ${f.tag}` }));
  extraProjectIds.push(solo.id);
  const soloRow = json<{ items: ProjectDto[] }>(await m1.get("/api/projects")).items.find(
    (p) => p.id === solo.id,
  )!;
  expect(soloRow.members).toEqual([]);

  const edited = await m1
    .patch(`/api/projects/${mk.id}`)
    .send({ name: "Renamed by member", memberIds: [f.m1.id] });
  expect(edited.status).toBe(200);
  expect(json<ProjectDto>(edited).name).toBe("Renamed by member");
  expect((await m1.patch(`/api/projects/${mk.id}`).send({ archived: true })).status).toBe(403);
  expect((await m1.delete(`/api/projects/${mk.id}`)).status).toBe(403);
  expect((await request(app).patch(`/api/projects/${mk.id}`).send({ name: "x" })).status).toBe(401);
});

afterAll(async () => {
  if (extraProjectIds.length)
    await db.delete(projects).where(inArray(projects.id, extraProjectIds));
  await f.cleanup();
});

describe("creating and editing projects with an owner and team members", () => {
  it("defaults the owner to the creator and stores the members", async () => {
    const res = await pm
      .post("/api/projects")
      .send({ name: `Scoped ${f.tag}`, memberIds: [f.m1.id] });
    expect(res.status).toBe(201);
    const p = json<ProjectDto>(res);
    extraProjectIds.push(p.id);
    expect(p.ownerId).toBe(f.pm.id);
    expect(p.ownerName).toBe("Test PM");
    expect(p.memberIds).toEqual([f.m1.id]);
  });

  it("sets an explicit owner and replaces the member list on update", async () => {
    const created = json<ProjectDto>(
      await pm
        .post("/api/projects")
        .send({ name: `Edit ${f.tag}`, ownerId: f.m2.id, memberIds: [f.m1.id] }),
    );
    extraProjectIds.push(created.id);
    expect(created.ownerId).toBe(f.m2.id);
    const updated = json<ProjectDto>(
      await pm
        .patch(`/api/projects/${created.id}`)
        .send({ ownerId: f.pm.id, memberIds: [f.m2.id, f.pm.id] }),
    );
    expect(updated.ownerId).toBe(f.pm.id);
    expect([...(updated.memberIds ?? [])].sort()).toEqual([f.m2.id, f.pm.id].sort());
  });

  it("rejects unknown users and leaves members untouched on failure", async () => {
    const res = await pm
      .post("/api/projects")
      .send({ name: `Bad ${f.tag}`, memberIds: ["00000000-0000-4000-8000-000000000000"] });
    expect(res.status).toBe(404);
  });

  it("lets a team member create and edit projects", async () => {
    const made = await m1.post("/api/projects").send({ name: `Member ${f.tag}` });
    expect(made.status).toBe(201);
    const id = json<ProjectDto>(made).id;
    expect((await m1.patch(`/api/projects/${id}`).send({ name: `Edited ${f.tag}` })).status).toBe(
      200,
    );
    await pm.delete(`/api/projects/${id}`);
  });
});

describe("a team member sees only assigned projects", () => {
  it("lists only their projects; a PM sees all", async () => {
    const mine = json<{ items: ProjectDto[] }>(await m1.get("/api/projects")).items.map(
      (p) => p.id,
    );
    expect(mine).toContain(f.project.id);
    expect(mine).not.toContain(f.otherProject.id);
    const all = json<{ items: ProjectDto[] }>(await pm.get("/api/projects")).items.map((p) => p.id);
    expect(all).toEqual(expect.arrayContaining([f.project.id, f.otherProject.id]));
  });

  it("an owner who is not a member still sees the project", async () => {
    const owned = json<ProjectDto>(
      await pm.post("/api/projects").send({ name: `Owned ${f.tag}`, ownerId: f.m2.id }),
    );
    extraProjectIds.push(owned.id);
    const ids = json<{ items: ProjectDto[] }>(await m2.get("/api/projects")).items.map((p) => p.id);
    expect(ids).toContain(owned.id);
  });

  it("scopes activities, search, workload, RAID, Kano and OST", async () => {
    const acts = json<{ items: Array<{ id: string }> }>(await m1.get("/api/activities")).items.map(
      (a) => a.id,
    );
    expect(acts).toContain(visibleActivityId);
    expect(acts).not.toContain(hiddenActivityId);

    const workload = json<{ items: Array<{ userId: string }> }>(
      await m1.get("/api/workload"),
    ).items;
    expect(workload.some((w) => w.userId === f.m1.id)).toBe(true);

    // The other project's records are absent from every "all projects" list.
    await pm
      .post(`/api/projects/${f.otherProject.id}/raid`)
      .send({ itemType: "risk", title: "Hidden risk", impact: 2, likelihood: 2 });
    const raid = json<{ items: Array<{ projectId: string }> }>(await m1.get("/api/raid")).items;
    expect(raid.every((r) => r.projectId !== f.otherProject.id)).toBe(true);
    const kano = json<{ items: Array<{ projectId: string }> }>(await m1.get("/api/kano")).items;
    expect(kano.every((r) => r.projectId !== f.otherProject.id)).toBe(true);
    const tree = json<{ outcomes: Array<{ projectId: string }> }>(
      await m1.get("/api/ost"),
    ).outcomes;
    expect(tree.every((o) => o.projectId !== f.otherProject.id)).toBe(true);
  });

  it("blocks single-record and per-project routes for unassigned projects", async () => {
    for (const path of [
      `/api/projects/${f.otherProject.id}`,
      `/api/projects/${f.otherProject.id}/raid`,
      `/api/projects/${f.otherProject.id}/kano`,
      `/api/projects/${f.otherProject.id}/ost`,
      `/api/projects/${f.otherProject.id}/subprojects`,
      `/api/activities/${hiddenActivityId}`,
      `/api/story-map?projectId=${f.otherProject.id}`,
      `/api/activities?projectId=${f.otherProject.id}`,
    ]) {
      expect((await m1.get(path)).status, path).toBe(404);
    }
    expect((await m1.get(`/api/activities/${visibleActivityId}`)).status).toBe(200);
    expect((await m1.get(`/api/projects/${f.project.id}/raid`)).status).toBe(200);
  });

  it("a PM still reaches every project", async () => {
    expect((await pm.get(`/api/projects/${f.otherProject.id}/raid`)).status).toBe(200);
    expect((await pm.get(`/api/activities/${hiddenActivityId}`)).status).toBe(200);
  });

  it("a user assigned to nothing sees empty lists, not errors", async () => {
    const lonely = json<ProjectDto>(await pm.post("/api/projects").send({ name: `Solo ${f.tag}` }));
    extraProjectIds.push(lonely.id);
    // m2 is a member of f.project only, so removing that membership leaves nothing assigned.
    await pm.patch(`/api/projects/${f.project.id}`).send({ memberIds: [f.m1.id] });
    const res = await m2.get("/api/projects");
    expect(json<{ items: ProjectDto[] }>(res).items.map((p) => p.id)).not.toContain(f.project.id);
    expect(json<{ items: unknown[] }>(await m2.get("/api/activities")).items).toEqual([]);
    expect(json<{ items: unknown[] }>(await m2.get("/api/raid")).items).toEqual([]);
    expect((await m2.get("/api/home")).status).toBe(200);
    expect((await m2.get("/api/workload")).status).toBe(200);
  });
});
