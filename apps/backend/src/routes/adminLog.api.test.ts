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

describe("DELETE /api/admin-log/items/:sourceModule/:itemId", () => {
  it("deletes one RAID action, Kano spec, OST solution and USM feature, never their parents", async () => {
    const raid = json<{ id: string; mitigatingActions: Array<{ id: string }> }>(
      await pm.post(`/api/projects/${f.project.id}/raid`).send({
        itemType: "risk",
        description: "Delete test",
        impact: 2,
        mitigatingActions: [
          { description: "a1", sprintKey: "2026-S50", responsibleId: f.m1.id },
          { description: "a2", sprintKey: "2026-S50", responsibleId: f.m1.id },
        ],
      }),
    );
    const [a1, a2] = raid.mitigatingActions;
    expect((await pm.delete(`/api/admin-log/items/raid/${a1!.id}`)).status).toBe(204);
    const raidAfter = json<{ mitigatingActions: Array<{ id: string }> }>(
      await pm.get(`/api/projects/${f.project.id}/raid`).then((r) => ({
        body: (r.body as { items: Array<{ id: string }> }).items.find((i) => i.id === raid.id),
      })),
    );
    expect(raidAfter.mitigatingActions.map((a) => a.id)).toEqual([a2!.id]);

    const kano = json<{ id: string; specs: Array<{ id: string }> }>(
      await pm
        .post(`/api/projects/${f.project.id}/kano`)
        .send({ revisionRequest: "Spec delete", specs: [{ label: "s1" }, { label: "s2" }] }),
    );
    expect((await pm.delete(`/api/admin-log/items/kano/${kano.specs[0]!.id}`)).status).toBe(204);
    const kanoAfter = {
      specs: (
        (await pm.get(`/api/projects/${f.project.id}/kano`)).body as {
          items: Array<{ id: string; specs: Array<{ id: string }> }>;
        }
      ).items.find((k) => k.id === kano.id)!.specs,
    };
    expect(kanoAfter.specs.map((x) => x.id)).toEqual([kano.specs[1]!.id]);

    const outcome = json<{ id: string }>(
      await pm.post(`/api/projects/${f.project.id}/ost/outcomes`).send({ title: "O" }),
    );
    const opp = json<{ id: string }>(
      await pm.post(`/api/ost/outcomes/${outcome.id}/opportunities`).send({
        title: "R",
        solutions: [{ title: "S1" }, { title: "S2" }],
      }),
    );
    const tree = async () =>
      json<{
        opportunities: Array<{ id: string }>;
        solutions: Array<{ id: string; opportunityId: string }>;
      }>(await pm.get(`/api/projects/${f.project.id}/ost`));
    const sols = (await tree()).solutions.filter((x) => x.opportunityId === opp.id);
    expect((await pm.delete(`/api/admin-log/items/ost/${sols[0]!.id}`)).status).toBe(204);
    const t = await tree();
    expect(t.opportunities.some((o) => o.id === opp.id)).toBe(true);
    expect(t.solutions.filter((x) => x.opportunityId === opp.id)).toHaveLength(1);

    expect((await pm.delete(`/api/admin-log/items/user_story/${featureId}`)).status).toBe(204);
    const steps = json<{ items: Array<{ features: Array<{ id: string }> }> }>(
      await pm.get("/api/story-map/steps").query({ projectId: f.project.id }),
    );
    expect(steps.items.length).toBeGreaterThan(0);
    expect(steps.items.flatMap((x) => x.features).some((x) => x.id === featureId)).toBe(false);
  });

  it("answers 404 for a missing task, 400 for a bad module or id, 403 for members, 401 signed out", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect((await pm.delete(`/api/admin-log/items/raid/${ghost}`)).status).toBe(404);
    expect((await pm.delete(`/api/admin-log/items/bogus/${ghost}`)).status).toBe(400);
    expect((await pm.delete("/api/admin-log/items/raid/not-a-uuid")).status).toBe(400);
    expect((await member.delete(`/api/admin-log/items/raid/${actionId}`)).status).toBe(403);
    expect((await request(app).delete(`/api/admin-log/items/raid/${actionId}`)).status).toBe(401);
    // The action survived the rejected attempts.
    const log = json<AdminLogResponse>(await pm.get("/api/admin-log"));
    expect(log.projects.flatMap((g) => g.items).some((i) => i.id === actionId)).toBe(true);
  });
});

describe("DELETE /api/work-items/:sourceModule/:itemId (any authenticated role)", () => {
  it("lets a team member and a PM delete one RAID action, Kano spec and OST solution, keeping parents", async () => {
    const raid = json<{ id: string; mitigatingActions: Array<{ id: string }> }>(
      await pm.post(`/api/projects/${f.project.id}/raid`).send({
        itemType: "risk",
        description: "Shared delete",
        impact: 2,
        mitigatingActions: [
          { description: "a1", sprintKey: "2026-S50", responsibleId: f.m1.id },
          { description: "a2", sprintKey: "2026-S50", responsibleId: f.m1.id },
        ],
      }),
    );
    const [a1, a2] = raid.mitigatingActions;
    expect((await member.delete(`/api/work-items/raid/${a1!.id}`)).status).toBe(204);
    expect((await pm.delete(`/api/work-items/raid/${a2!.id}`)).status).toBe(204);
    const raidList = (await pm.get(`/api/projects/${f.project.id}/raid`)).body as {
      items: Array<{ id: string; mitigatingActions: unknown[] }>;
    };
    const parent = raidList.items.find((i) => i.id === raid.id);
    expect(parent?.mitigatingActions).toHaveLength(0);

    const kano = json<{ id: string; specs: Array<{ id: string }> }>(
      await pm
        .post(`/api/projects/${f.project.id}/kano`)
        .send({ revisionRequest: "Shared spec delete", specs: [{ label: "s1" }, { label: "s2" }] }),
    );
    expect((await member.delete(`/api/work-items/kano/${kano.specs[0]!.id}`)).status).toBe(204);
    const kanoAfter = {
      specs: (
        (await pm.get(`/api/projects/${f.project.id}/kano`)).body as {
          items: Array<{ id: string; specs: Array<{ id: string }> }>;
        }
      ).items.find((k) => k.id === kano.id)!.specs,
    };
    expect(kanoAfter.specs.map((x) => x.id)).toEqual([kano.specs[1]!.id]);

    const outcome = json<{ id: string }>(
      await pm.post(`/api/projects/${f.project.id}/ost/outcomes`).send({ title: "O2" }),
    );
    const opp = json<{ id: string }>(
      await pm.post(`/api/ost/outcomes/${outcome.id}/opportunities`).send({
        title: "R2",
        solutions: [{ title: "S1" }, { title: "S2" }],
      }),
    );
    const tree = async () =>
      json<{
        opportunities: Array<{ id: string }>;
        solutions: Array<{ id: string; opportunityId: string }>;
      }>(await pm.get(`/api/projects/${f.project.id}/ost`));
    const sols = (await tree()).solutions.filter((x) => x.opportunityId === opp.id);
    expect((await member.delete(`/api/work-items/ost/${sols[0]!.id}`)).status).toBe(204);
    const t = await tree();
    expect(t.opportunities.some((o) => o.id === opp.id)).toBe(true);
    expect(t.solutions.filter((x) => x.opportunityId === opp.id)).toHaveLength(1);
  });

  it("answers 404, 400 and 401, and keeps Admin Log approval PM-only", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect((await member.delete(`/api/work-items/raid/${ghost}`)).status).toBe(404);
    expect((await member.delete(`/api/work-items/bogus/${ghost}`)).status).toBe(400);
    expect((await member.delete("/api/work-items/raid/not-a-uuid")).status).toBe(400);
    expect((await request(app).delete(`/api/work-items/raid/${ghost}`)).status).toBe(401);
    expect(
      (
        await member
          .patch(`/api/admin-log/items/raid/${ghost}/approval`)
          .send({ pmApproval: "APPROVED" })
      ).status,
    ).toBe(403);
    expect((await member.get("/api/admin-log")).status).toBe(403);
  });
});
