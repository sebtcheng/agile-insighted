import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActivityUpdateResult, StoryDto, StoryMapDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
type Id = { id: string };
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let storyId: string;
let otherStoryId: string;
let assumptionId: string;
let activityId: string;

beforeAll(async () => {
  f = await createFixture();
  pm = request.agent(app);
  await pm.post("/api/auth/login").send({ email: f.pm.email, password: f.password });
  storyId = json<StoryDto>(
    await pm.post(`/api/subprojects/${f.subA.id}/stories`).send({ story: "Linked story" }),
  ).id;
  otherStoryId = json<StoryDto>(
    await pm.post(`/api/subprojects/${f.otherSub.id}/stories`).send({ story: "Other project" }),
  ).id;
  const outcome = json<Id>(
    await pm.post(`/api/projects/${f.project.id}/ost/outcomes`).send({ title: "Outcome" }),
  );
  const opp = json<Id>(
    await pm.post(`/api/ost/outcomes/${outcome.id}/opportunities`).send({ title: "Opp" }),
  );
  const sol = json<Id>(
    await pm.post(`/api/ost/opportunities/${opp.id}/solutions`).send({ title: "Sol" }),
  );
  assumptionId = json<Id>(
    await pm
      .post(`/api/ost/solutions/${sol.id}/assumptions`)
      .send({ statement: "It works", category: "feasibility" }),
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

describe("activity links to stories and assumptions", () => {
  it("stores the story link on create and shows it on the story map", async () => {
    const map = json<StoryMapDto>(await pm.get(`/api/story-map?subprojectId=${f.subA.id}`));
    expect(map.stories.find((s) => s.id === storyId)?.linkedActivities).toBe(1);
  });

  it("links and unlinks an assumption by update", async () => {
    const linked = json<ActivityUpdateResult>(
      await pm.patch(`/api/activities/${activityId}`).send({ ostAssumptionId: assumptionId }),
    );
    expect(linked.activity.ostAssumptionId).toBe(assumptionId);
    const cleared = json<ActivityUpdateResult>(
      await pm.patch(`/api/activities/${activityId}`).send({ ostAssumptionId: null }),
    );
    expect(cleared.activity.ostAssumptionId).toBeNull();
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
