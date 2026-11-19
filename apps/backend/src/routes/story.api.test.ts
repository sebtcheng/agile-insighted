import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoryDto, StoryMapDto, ToggleStoryActionStepResult } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
type ErrorBody = { error: { code: string; message: string; details?: { missing?: string[] } } };
const json = <T>(res: { body: unknown }): T => res.body as T;
const DUE = "2026-12-15";

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let anon: Agent;
let backboneId: string;
let stepId: string;
let personaId: string;
let releaseId: string;

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
  backboneId = json<{ id: string }>(
    await pm.post(`/api/projects/${f.project.id}/journey-steps`).send({ name: "Onboard" }),
  ).id;
  stepId = json<{ id: string }>(
    await pm
      .post(`/api/projects/${f.project.id}/journey-steps`)
      .send({ name: "Create account", parentStepId: backboneId }),
  ).id;
  personaId = json<{ id: string }>(
    await pm.post(`/api/projects/${f.project.id}/personas`).send({ name: "Teacher" }),
  ).id;
  releaseId = json<{ id: string }>(
    await pm.post(`/api/projects/${f.project.id}/releases`).send({ name: "R1" }),
  ).id;
});
afterAll(async () => {
  await f.cleanup();
});

const step = (label: string, extra: Record<string, unknown> = {}) => ({
  label,
  responsibleId: f.m1.id,
  targetDate: DUE,
  ...extra,
});

const newStory = async (extra: Record<string, unknown> = {}) =>
  json<StoryDto>(
    await member.post(`/api/stories`).send({
      projectId: f.project.id,
      story: "As a teacher, I want a class view",
      journeyStepId: stepId,
      releaseId,
      personaId,
      ...extra,
    }),
  );

const mapped = () => ({ projectId: f.project.id, story: "x", journeyStepId: stepId, releaseId });

/** A journey step and a release that belong to the other project. */
async function otherProjectLinks() {
  const o = f.otherProject.id;
  return {
    stepId: json<{ id: string }>(
      await pm.post(`/api/projects/${o}/journey-steps`).send({ name: `Other ${Date.now()}` }),
    ).id,
    releaseId: json<{ id: string }>(
      await pm.post(`/api/projects/${o}/releases`).send({ name: `OR ${Date.now()}` }),
    ).id,
  };
}

async function asStoryLinks() {
  const l = await otherProjectLinks();
  return { journeyStepId: l.stepId, releaseId: l.releaseId };
}

const mapOf = async (projectId = f.project.id) =>
  json<StoryMapDto>(await pm.get(`/api/story-map?projectId=${projectId}`));

const toggle = (storyId: string, actionStepId: string | undefined, isCompleted: boolean) =>
  member.patch(`/api/stories/${storyId}/action-steps/${actionStepId ?? ""}`).send({ isCompleted });

describe("Story map API", () => {
  it("requires sign in", async () => {
    expect((await anon.get(`/api/story-map?projectId=${f.project.id}`)).status).toBe(401);
  });

  it("lets a team member propose a story but not shape the map", async () => {
    const story = await newStory({ storyPoints: 5 });
    expect(story.code).toMatch(/^USM-\d{2,}$/);
    expect(story.status).toBe("backlog");
    expect(story.personaName).toBe("Teacher");
    expect(story.projectName).toBe(f.project.name);
    expect(story.actionSteps).toEqual([]);
    expect(story.totalCount).toBe(0);
    expect(
      (await member.post(`/api/projects/${f.project.id}/journey-steps`).send({ name: "X" })).status,
    ).toBe(403);
    expect((await member.patch(`/api/stories/${story.id}`).send({ storyPoints: 8 })).status).toBe(
      403,
    );
    expect(
      (await member.post(`/api/projects/${f.project.id}/personas`).send({ name: "Y" })).status,
    ).toBe(403);
  });

  it("returns the project map with backbone, steps, personas and stories", async () => {
    const story = await newStory();
    const map = await mapOf();
    expect(map.steps.map((s) => s.id)).toEqual(expect.arrayContaining([backboneId, stepId]));
    expect(map.steps.every((s) => s.projectId === f.project.id)).toBe(true);
    expect(map.personas.some((p) => p.id === personaId)).toBe(true);
    expect(map.stories.some((s) => s.id === story.id)).toBe(true);
  });

  it("orders new stories at the bottom of their step", async () => {
    const a = await newStory();
    const b = await newStory();
    expect(b.position).toBeGreaterThan(a.position);
  });

  it("rejects bad input and cross-project references", async () => {
    const bad = await member.post(`/api/stories`).send({ ...mapped(), story: "x", storyPoints: 4 });
    expect(bad.status).toBe(400);
    expect((await member.post(`/api/stories`).send({ story: "no project" })).status).toBe(400);
    // A mapped story needs a journey step and a release.
    const noStep = await member
      .post(`/api/stories`)
      .send({ projectId: f.project.id, story: "x", releaseId });
    expect(noStep.status).toBe(400);
    const noRelease = await member
      .post(`/api/stories`)
      .send({ projectId: f.project.id, story: "x", journeyStepId: stepId });
    expect(noRelease.status).toBe(400);
    // Links from another project are refused with a clear message.
    const other = await otherProjectLinks();
    const crossRelease = await member
      .post(`/api/stories`)
      .send({ ...mapped(), releaseId: other.releaseId });
    expect(crossRelease.status).toBe(422);
    expect(json<ErrorBody>(crossRelease).error.message).toMatch(/different project/);
    const crossStep = await member
      .post(`/api/stories`)
      .send({ ...mapped(), journeyStepId: other.stepId });
    expect(crossStep.status).toBe(422);
    const nested = await pm
      .post(`/api/projects/${f.project.id}/journey-steps`)
      .send({ name: "Too deep", parentStepId: stepId });
    expect(nested.status).toBe(422);
  });

  it("deleting a step keeps its stories as unmapped", async () => {
    const temp = json<{ id: string }>(
      await pm
        .post(`/api/projects/${f.project.id}/journey-steps`)
        .send({ name: "Temp", parentStepId: backboneId }),
    );
    const story = await newStory({ journeyStepId: temp.id });
    expect((await pm.delete(`/api/journey-steps/${temp.id}`)).status).toBe(204);
    const map = await mapOf();
    expect(map.stories.find((s) => s.id === story.id)?.journeyStepId).toBeNull();
  });
});

describe("Story ownership and action steps", () => {
  it("creates a story with a person responsible, target date and action steps in one call", async () => {
    const story = await newStory({
      responsibleId: f.m2.id,
      targetDate: DUE,
      actionSteps: [step("Write the API"), step("Demo it", { responsibleId: f.pm.id })],
    });
    expect(story.responsibleId).toBe(f.m2.id);
    expect(story.responsibleName).toBe("Test Member Two");
    expect(story.targetDate).toBe(DUE);
    expect(story.actionSteps.map((s) => [s.label, s.responsibleName, s.targetDate])).toEqual([
      ["Write the API", "Test Member One", DUE],
      ["Demo it", "Test PM", DUE],
    ]);
    expect(story).toMatchObject({ completedCount: 0, totalCount: 2, completionPercentage: 0 });
    const onMap = (await mapOf()).stories.find((s) => s.id === story.id);
    expect(onMap?.actionSteps.map((s) => s.label)).toEqual(["Write the API", "Demo it"]);
  });

  it("validates assignees and dates on the story and its steps", async () => {
    const unknownUser = "00000000-0000-4000-8000-000000000000";
    const r1 = await member.post(`/api/stories`).send({ ...mapped(), responsibleId: unknownUser });
    expect(r1.status).toBe(422);
    const r2 = await member.post(`/api/stories`).send({
      ...mapped(),
      actionSteps: [step("No owner", { responsibleId: unknownUser })],
    });
    expect(r2.status).toBe(422);
    const r3 = await member.post(`/api/stories`).send({
      ...mapped(),
      actionSteps: [{ label: "Missing date", responsibleId: f.m1.id }],
    });
    expect(r3.status).toBe(400);
    const r4 = await member.post(`/api/stories`).send({ ...mapped(), targetDate: "15/12/2026" });
    expect(r4.status).toBe(400);
  });

  it("toggles one step and recalculates completion", async () => {
    const story = await newStory({ actionSteps: [step("A"), step("B")] });
    const first = story.actionSteps[0]?.id;
    const res = await toggle(story.id, first, true);
    expect(res.status).toBe(200);
    const body = json<ToggleStoryActionStepResult>(res);
    expect(body.step.isCompleted).toBe(true);
    expect(body.step.completedAt).not.toBeNull();
    expect(body.summary).toEqual({ completedCount: 1, totalCount: 2, completionPercentage: 50 });
    const other = await newStory();
    expect((await toggle(other.id, first, true)).status).toBe(404);
  });

  it("syncs steps atomically on update: edit, add, drop and reorder", async () => {
    const story = await newStory({ actionSteps: [step("Keep"), step("Drop")] });
    const keep = story.actionSteps[0];
    const synced = json<StoryDto>(
      await pm.patch(`/api/stories/${story.id}`).send({
        actionSteps: [
          step("New first"),
          step("Kept, renamed", { id: keep?.id, isCompleted: true }),
        ],
      }),
    );
    expect(synced.actionSteps.map((s) => [s.label, s.isCompleted])).toEqual([
      ["New first", false],
      ["Kept, renamed", true],
    ]);
    expect(synced.actionSteps[1]?.id).toBe(keep?.id);
    const foreign = await newStory({ actionSteps: [step("Elsewhere")] });
    const hijack = await pm.patch(`/api/stories/${story.id}`).send({
      storyPoints: 8,
      actionSteps: [step("Stolen", { id: foreign.actionSteps[0]?.id })],
    });
    expect(hijack.status).toBe(422);
    // The failed save rolled back as a whole.
    const after = (await mapOf()).stories.find((s) => s.id === story.id);
    expect(after?.actionSteps).toHaveLength(2);
    expect(after?.storyPoints).toBeNull();
  });

  it("only completes a story when 100% of its action steps are done", async () => {
    const story = await newStory({ actionSteps: [step("A"), step("B")] });
    const blocked = await pm.patch(`/api/stories/${story.id}`).send({ status: "completed" });
    expect(blocked.status).toBe(422);
    expect(json<ErrorBody>(blocked).error.code).toBe("story_steps_incomplete");
    expect(json<ErrorBody>(blocked).error.details?.missing).toEqual(["A", "B"]);

    for (const s of story.actionSteps) await toggle(story.id, s.id, true);
    const ok = await pm.patch(`/api/stories/${story.id}`).send({ status: "completed" });
    expect(ok.status).toBe(200);
    expect(json<StoryDto>(ok)).toMatchObject({ status: "completed", completionPercentage: 100 });

    // Unticking a step on a completed story reopens it.
    const undo = json<ToggleStoryActionStepResult>(
      await toggle(story.id, story.actionSteps[0]?.id, false),
    );
    expect(undo.status).toBe("in_progress");
  });

  it("lets a story without steps be completed and leaves sprint moves ungated", async () => {
    const story = await newStory();
    const intoSprint = await pm.patch(`/api/stories/${story.id}`).send({ sprintId: f.sprint.id });
    expect(intoSprint.status).toBe(200);
    const done = await pm.patch(`/api/stories/${story.id}`).send({ status: "completed" });
    expect(done.status).toBe(200);
  });
});

describe("Story map project visibility", () => {
  it("hides other projects from a team member and refuses writes there", async () => {
    const foreign = json<StoryDto>(
      await pm.post(`/api/stories`).send({
        projectId: f.otherProject.id,
        story: "Hidden story",
        ...(await asStoryLinks()),
      }),
    );
    expect(foreign.projectId).toBe(f.otherProject.id);
    expect((await member.get(`/api/story-map?projectId=${f.otherProject.id}`)).status).toBe(404);
    const all = json<StoryMapDto>(await member.get(`/api/story-map`));
    expect(all.stories.some((s) => s.id === foreign.id)).toBe(false);
    expect(all.stories.every((s) => s.projectId === f.project.id)).toBe(true);
    const write = await member
      .post(`/api/stories`)
      .send({ ...mapped(), projectId: f.otherProject.id });
    expect(write.status).toBe(404);
    expect((await toggle(foreign.id, foreign.id, true)).status).toBe(404);
    // A PM sees every project when no filter is given.
    const pmAll = json<StoryMapDto>(await pm.get(`/api/story-map`));
    expect(pmAll.stories.some((s) => s.id === foreign.id)).toBe(true);
  });
});
