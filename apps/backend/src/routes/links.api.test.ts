import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActivityUpdateResult, StoryDto, StoryMapDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let storyId: string;
let otherStoryId: string;
let activityId: string;

beforeAll(async () => {
  f = await createFixture();
  pm = request.agent(app);
  await pm.post("/api/auth/login").send({ email: f.pm.email, password: f.password });
  const link = async (projectId: string) => ({
    projectId,
    journeyStepId: json<{ id: string }>(
      await pm.post(`/api/projects/${projectId}/journey-steps`).send({ name: "Step" }),
    ).id,
    releaseId: json<{ id: string }>(
      await pm.post(`/api/projects/${projectId}/releases`).send({ name: "Rel" }),
    ).id,
  });
  storyId = json<StoryDto>(
    await pm.post(`/api/stories`).send({ ...(await link(f.project.id)), story: "Linked story" }),
  ).id;
  otherStoryId = json<StoryDto>(
    await pm
      .post(`/api/stories`)
      .send({ ...(await link(f.otherProject.id)), story: "Other project" }),
  ).id;
  activityId = json<ActivityUpdateResult>(
    await pm.post(`/api/projects/${f.project.id}/activities`).send({
      title: "Build it",
      subprojectId: f.subA.id,
      userStoryId: storyId,
    }),
  ).activity.id;
});
afterAll(async () => {
  await f.cleanup();
});

describe("activity links to stories", () => {
  it("stores the story link on create and shows it on the story map", async () => {
    const map = json<StoryMapDto>(await pm.get(`/api/story-map?projectId=${f.project.id}`));
    expect(map.stories.find((s) => s.id === storyId)?.linkedActivities).toBe(1);
  });

  it("rejects a story from another project", async () => {
    const res = await pm.patch(`/api/activities/${activityId}`).send({ userStoryId: otherStoryId });
    expect(res.status).toBe(422);
    const create = await pm
      .post(`/api/projects/${f.project.id}/activities`)
      .send({ title: "Bad link", userStoryId: otherStoryId });
    expect(create.status).toBe(422);
  });
});
