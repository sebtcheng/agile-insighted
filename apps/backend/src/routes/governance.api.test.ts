import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
type ErrorBody = { error: { code: string } };
type Template = { id: string };
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let anon: Agent;
let templateId: string;
let releaseId: string;
let activityId: string;
let otherActivityId: string;

async function loginAs(email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/login").send({ email, password: f.password })).status).toBe(
    200,
  );
  return agent;
}

beforeAll(async () => {
  f = await createFixture();
  pm = await loginAs(f.pm.email);
  member = await loginAs(f.m1.email);
  anon = request.agent(app);
  templateId = json<Template>(
    await pm
      .post(`/api/projects/${f.project.id}/checklist-templates`)
      .send({ kind: "done", label: "Reviewed" }),
  ).id;
  releaseId = json<Template>(
    await pm.post(`/api/projects/${f.project.id}/releases`).send({ name: "v1" }),
  ).id;
  const own = await pm
    .post(`/api/projects/${f.project.id}/activities`)
    .send({ title: "Mine", assigneeId: f.m1.id });
  const other = await pm
    .post(`/api/projects/${f.project.id}/activities`)
    .send({ title: "Other", assigneeId: f.m2.id });
  activityId = json<{ activity: { id: string } }>(own).activity.id;
  otherActivityId = json<{ activity: { id: string } }>(other).activity.id;
});
afterAll(async () => {
  await f.cleanup();
});

describe("Phase 2 permission map per endpoint", () => {
  const pmOnly: Array<{ name: string; call: (a: Agent) => request.Test }> = [
    {
      name: "POST releases",
      call: (a) => a.post(`/api/projects/${f.project.id}/releases`).send({ name: "Zed" }),
    },
    {
      name: "PATCH releases",
      call: (a) => a.patch(`/api/releases/${releaseId}`).send({ name: "Renamed" }),
    },
    { name: "DELETE releases", call: (a) => a.delete(`/api/releases/${releaseId}`) },
    {
      name: "PUT capacity",
      call: (a) => a.put(`/api/sprints/${f.sprint.id}/capacity`).send({ members: [] }),
    },
    {
      name: "POST checklist template",
      call: (a) =>
        a
          .post(`/api/projects/${f.project.id}/checklist-templates`)
          .send({ kind: "done", label: "X" }),
    },
    {
      name: "PATCH checklist template",
      call: (a) => a.patch(`/api/checklist-templates/${templateId}`).send({ isActive: true }),
    },
    { name: "GET gate overrides", call: (a) => a.get("/api/gate-overrides") },
  ];

  it.each(pmOnly)("$name returns 401 signed out and 403 for a team member", async ({ call }) => {
    expect((await call(anon)).status).toBe(401);
    const res = await call(member);
    expect(res.status).toBe(403);
    expect(json<ErrorBody>(res).error.code).toBe("forbidden");
  });

  it("lets the PM use them", async () => {
    expect(
      (await pm.put(`/api/sprints/${f.sprint.id}/capacity`).send({ members: [] })).status,
    ).toBe(200);
    expect((await pm.patch(`/api/releases/${releaseId}`).send({ isMvp: true })).status).toBe(200);
    expect((await pm.get("/api/gate-overrides")).status).toBe(200);
  });

  it("requires sign-in for the shared endpoints", async () => {
    expect((await anon.get(`/api/activities/${activityId}/checklist`)).status).toBe(401);
    expect(
      (
        await anon
          .post(`/api/activities/${activityId}/dependencies`)
          .send({ blockingActivityId: otherActivityId })
      ).status,
    ).toBe(401);
    expect(
      (
        await anon
          .put(`/api/activities/${activityId}/checklist/${templateId}`)
          .send({ checked: true })
      ).status,
    ).toBe(401);
  });

  it("lets a member tick their own checklist but not someone else's", async () => {
    expect(
      (
        await member
          .put(`/api/activities/${activityId}/checklist/${templateId}`)
          .send({ checked: true })
      ).status,
    ).toBe(200);
    expect(
      (
        await member
          .put(`/api/activities/${otherActivityId}/checklist/${templateId}`)
          .send({ checked: true })
      ).status,
    ).toBe(403);
  });

  it("surfaces the Definition of Done gate as a clear 422 with the missing items", async () => {
    const res = await member.patch(`/api/activities/${otherActivityId}`).send({ status: "done" });
    expect(res.status).toBe(403); // not their activity
    const own = await pm
      .post(`/api/projects/${f.project.id}/activities`)
      .send({ title: "Gate", assigneeId: f.m1.id });
    const id = json<{ activity: { id: string } }>(own).activity.id;
    const blocked = await member.patch(`/api/activities/${id}`).send({ status: "done" });
    expect(blocked.status).toBe(422);
    expect(json<ErrorBody>(blocked).error.code).toBe("dod_incomplete");
  });

  it("lets a member change dependencies only on their assigned activities", async () => {
    const third = json<{ activity: { id: string } }>(
      await pm.post(`/api/projects/${f.project.id}/activities`).send({ title: "Third" }),
    ).activity.id;
    expect(
      (
        await member
          .post(`/api/activities/${third}/dependencies`)
          .send({ blockingActivityId: otherActivityId })
      ).status,
    ).toBe(403);
    expect(
      (
        await member
          .post(`/api/activities/${activityId}/dependencies`)
          .send({ blockingActivityId: otherActivityId })
      ).status,
    ).toBe(201);
    expect(
      (await member.delete(`/api/activities/${activityId}/dependencies/${otherActivityId}`)).status,
    ).toBe(204);
  });
});
