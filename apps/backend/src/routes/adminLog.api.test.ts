import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminLogResponse, UsmFeatureDto, UsmPersonaDto, UsmStepDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let featureId: string;
let actionId: string;
let raidId: string;

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
  const persona = json<UsmPersonaDto>(
    await pm.post("/api/story-map/personas").send({ projectId: f.project.id, name: "Admin" }),
  );
  const step = json<UsmStepDto>(
    await pm
      .post("/api/story-map/steps")
      .send({ projectId: f.project.id, personaId: persona.id, title: "S" }),
  );
  const feature = json<UsmFeatureDto>(
    await pm
      .post("/api/story-map/features")
      .send({ projectId: f.project.id, stepId: step.id, title: "Feature A" }),
  );
  featureId = feature.id;
  expect(feature.pmApproval).toBe("PENDING");
  const raid = json<{ id: string; mitigatingActions: Array<{ id: string; pmApproval: string }> }>(
    await pm.post(`/api/projects/${f.project.id}/raid`).send({
      itemType: "risk",
      description: "A risk",
      impact: 2,
      mitigatingActions: [
        { description: "Mitigate", sprintKey: "2026-S50", responsibleId: f.m1.id },
      ],
    }),
  );
  raidId = raid.id;
  actionId = raid.mitigatingActions[0]!.id;
  expect(raid.mitigatingActions[0]?.pmApproval).toBe("PENDING");
});
afterAll(async () => {
  await f.cleanup();
});

describe("GET /api/admin-log", () => {
  it("lists tasks grouped by project for a PM, defaulting to PENDING", async () => {
    const res = await pm.get("/api/admin-log");
    expect(res.status).toBe(200);
    const body = json<AdminLogResponse>(res);
    const group = body.projects.find((p) => p.projectId === f.project.id)!;
    expect(group.total).toBeGreaterThanOrEqual(2);
    const feature = group.items.find((i) => i.id === featureId)!;
    expect(feature).toMatchObject({ sourceModule: "user_story", pmApproval: "PENDING" });
    const action = group.items.find((i) => i.id === actionId)!;
    expect(action).toMatchObject({ sourceModule: "raid", pmApproval: "PENDING", itemKind: "step" });
    expect(group.pending).toBe(group.total - group.approved);
  });

  it("is forbidden for team members", async () => {
    expect((await member.get("/api/admin-log")).status).toBe(403);
  });
});

describe("PATCH /api/admin-log/items/:sourceModule/:itemId", () => {
  const url = () => `/api/admin-log/items/user_story/${featureId}`;

  it("rejects completion while PENDING, then allows it once approved", async () => {
    const refused = await pm.patch(url()).send({ isCompleted: true });
    expect(refused.status).toBe(403);
    expect(json<{ error: { code: string } }>(refused).error.code).toBe("pm_approval_required");

    const approved = await pm.patch(`${url()}/approval`).send({ pmApproval: "APPROVED" });
    expect(approved.status).toBe(200);
    expect(json<{ pmApproval: string }>(approved).pmApproval).toBe("APPROVED");

    const done = await pm.patch(url()).send({ isCompleted: true });
    expect(done.status).toBe(200);
    expect(json<{ isCompleted: boolean }>(done).isCompleted).toBe(true);
  });

  it("lets a PM edit every detail of a task and keeps the Sunday end date in sync", async () => {
    const res = await pm.patch(url()).send({
      title: "Feature A renamed",
      assigneeId: f.m2.id,
      sprintKey: "2026-S50",
    });
    expect(res.status).toBe(200);
    expect(json<{ title: string; assigneeId: string; dueDate: string }>(res)).toMatchObject({
      title: "Feature A renamed",
      assigneeId: f.m2.id,
      dueDate: "2026-12-13",
    });
  });

  it("approves and edits a RAID mitigating action in its own table", async () => {
    const res = await pm
      .patch(`/api/admin-log/items/raid/${actionId}`)
      .send({ title: "Mitigate harder", pmApproval: "APPROVED", isCompleted: true });
    expect(res.status).toBe(200);
    expect(json<{ title: string; isCompleted: boolean; pmApproval: string }>(res)).toMatchObject({
      title: "Mitigate harder",
      isCompleted: true,
      pmApproval: "APPROVED",
    });
  });

  it("rejects non-PM callers with 403 for edits and approvals", async () => {
    expect((await member.patch(url()).send({ title: "x" })).status).toBe(403);
    expect((await member.patch(`${url()}/approval`).send({ pmApproval: "APPROVED" })).status).toBe(
      403,
    );
  });

  it("validates the body and the item", async () => {
    expect((await pm.patch(url()).send({ pmApproval: "MAYBE" })).status).toBe(400);
    expect((await pm.patch(url()).send({})).status).toBe(422);
    expect(
      (await pm.patch(`/api/admin-log/items/user_story/${raidId}`).send({ title: "x" })).status,
    ).toBe(404);
  });

  it("never lets a module edit endpoint change the approval", async () => {
    const res = await pm.patch(`/api/story-map/features/${featureId}`).send({
      pmApproval: "PENDING",
      title: "Feature A again",
    });
    expect(res.status).toBe(200);
    const log = json<AdminLogResponse>(await pm.get("/api/admin-log"));
    const item = log.projects
      .find((p) => p.projectId === f.project.id)!
      .items.find((i) => i.id === featureId)!;
    expect(item.pmApproval).toBe("APPROVED");
  });
});
