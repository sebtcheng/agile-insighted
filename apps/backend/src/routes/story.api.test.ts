import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoryDto, StoryMapDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
type ErrorBody = { error: { code: string; details?: { missing?: string[] } } };
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let anon: Agent;
let templateId: string;
let backboneId: string;
let stepId: string;
let personaId: string;

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
  templateId = json<{ id: string }>(
    await pm
      .post(`/api/projects/${f.project.id}/checklist-templates`)
      .send({ kind: "ready", label: "Acceptance criteria written" }),
  ).id;
  backboneId = json<{ id: string }>(
    await pm.post(`/api/subprojects/${f.subA.id}/journey-steps`).send({ name: "Onboard" }),
  ).id;
  stepId = json<{ id: string }>(
    await pm
      .post(`/api/subprojects/${f.subA.id}/journey-steps`)
      .send({ name: "Create account", parentStepId: backboneId }),
  ).id;
  personaId = json<{ id: string }>(
    await pm.post(`/api/projects/${f.project.id}/personas`).send({ name: "Teacher" }),
  ).id;
});
afterAll(async () => {
  await f.cleanup();
});

const newStory = async (extra: Record<string, unknown> = {}) =>
  json<StoryDto>(
    await member.post(`/api/subprojects/${f.subA.id}/stories`).send({
      story: "As a teacher, I want a class view",
      journeyStepId: stepId,
      personaId,
      ...extra,
    }),
  );

describe("Story map API", () => {
  it("requires sign in", async () => {
    expect((await anon.get(`/api/story-map?subprojectId=${f.subA.id}`)).status).toBe(401);
  });

  it("lets a team member propose a story but not shape the map", async () => {
    const story = await newStory({ storyPoints: 5 });
    expect(story.code).toMatch(/^USM-\d{2,}$/);
    expect(story.status).toBe("backlog");
    expect(story.personaName).toBe("Teacher");
    expect(story.readyTotal).toBe(1);
    expect(
      (await member.post(`/api/subprojects/${f.subA.id}/journey-steps`).send({ name: "X" })).status,
    ).toBe(403);
    expect((await member.patch(`/api/stories/${story.id}`).send({ storyPoints: 8 })).status).toBe(
      403,
    );
    expect(
      (await member.post(`/api/projects/${f.project.id}/personas`).send({ name: "Y" })).status,
    ).toBe(403);
  });

  it("returns the map with backbone, steps, personas and stories", async () => {
    const story = await newStory();
    const map = json<StoryMapDto>(await pm.get(`/api/story-map?subprojectId=${f.subA.id}`));
    expect(map.steps.map((s) => s.id)).toEqual(expect.arrayContaining([backboneId, stepId]));
    expect(map.personas.some((p) => p.id === personaId)).toBe(true);
    expect(map.stories.some((s) => s.id === story.id)).toBe(true);
  });

  it("orders new stories at the bottom of their step", async () => {
    const a = await newStory();
    const b = await newStory();
    expect(b.position).toBeGreaterThan(a.position);
  });

  it("rejects bad input and cross-project references", async () => {
    expect((await newStory({ storyPoints: 4 })) as unknown).toBeTruthy();
    const bad = await member
      .post(`/api/subprojects/${f.subA.id}/stories`)
      .send({ story: "x", storyPoints: 4 });
    expect(bad.status).toBe(400);
    const cross = await member
      .post(`/api/subprojects/${f.subA.id}/stories`)
      .send({ story: "x", releaseId: f.otherSub.id });
    expect(cross.status).toBeGreaterThanOrEqual(400);
    expect(cross.status).toBeLessThan(500);
    const nested = await pm
      .post(`/api/subprojects/${f.subA.id}/journey-steps`)
      .send({ name: "Too deep", parentStepId: stepId });
    expect(nested.status).toBe(422);
  });

  it("blocks moving a story into a sprint until it is ready, then allows it", async () => {
    const story = await newStory();
    const blocked = await pm.patch(`/api/stories/${story.id}`).send({ sprintId: f.sprint.id });
    expect(blocked.status).toBe(422);
    expect(json<ErrorBody>(blocked).error.code).toBe("dor_incomplete");
    expect(json<ErrorBody>(blocked).error.details?.missing).toEqual([
      "Acceptance criteria written",
    ]);

    const tick = await member
      .put(`/api/stories/${story.id}/checklist/${templateId}`)
      .send({ checked: true });
    expect(tick.status).toBe(200);
    const ok = await pm.patch(`/api/stories/${story.id}`).send({ sprintId: f.sprint.id });
    expect(ok.status).toBe(200);
    expect(json<StoryDto>(ok).sprintId).toBe(f.sprint.id);
    expect(json<StoryDto>(ok).readyChecked).toBe(1);
  });

  it("lets a PM override the gate with a reason that is logged", async () => {
    const story = await newStory();
    const res = await pm
      .patch(`/api/stories/${story.id}`)
      .send({ status: "in_progress", overrideReason: "Customer escalation" });
    expect(res.status).toBe(200);
    const log = json<{ items: Array<{ gate: string; reason: string; entityId: string }> }>(
      await pm.get(`/api/gate-overrides?entityType=story&entityId=${story.id}`),
    );
    expect(log.items).toHaveLength(1);
    expect(log.items[0]?.gate).toBe("dor");
    expect(log.items[0]?.reason).toBe("Customer escalation");
  });

  it("does not gate changes that stay in the backlog", async () => {
    const story = await newStory();
    const res = await pm
      .patch(`/api/stories/${story.id}`)
      .send({ storyPoints: 3, status: "planning" });
    expect(res.status).toBe(200);
  });

  it("deleting a step keeps its stories as unmapped", async () => {
    const step = json<{ id: string }>(
      await pm
        .post(`/api/subprojects/${f.subA.id}/journey-steps`)
        .send({ name: "Temp", parentStepId: backboneId }),
    );
    const story = await newStory({ journeyStepId: step.id });
    expect((await pm.delete(`/api/journey-steps/${step.id}`)).status).toBe(204);
    const map = json<StoryMapDto>(await pm.get(`/api/story-map?subprojectId=${f.subA.id}`));
    expect(map.stories.find((s) => s.id === story.id)?.journeyStepId).toBeNull();
  });
});
