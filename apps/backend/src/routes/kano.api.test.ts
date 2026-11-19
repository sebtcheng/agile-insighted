import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { KanoDto, StoryMapDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let anon: Agent;
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
  releaseId = json<{ id: string }>(
    await pm.post(`/api/projects/${f.project.id}/releases`).send({ name: "v1", isMvp: true }),
  ).id;
});
afterAll(async () => {
  await f.cleanup();
});

const base = () => `/api/projects/${f.project.id}/kano`;
const submit = async (extra: Record<string, unknown> = {}) =>
  json<KanoDto>(
    await member.post(base()).send({
      description: "Export engagement data to CSV",
      requesterName: "Dr. Reyes",
      subprojectId: f.subA.id,
      ...extra,
    }),
  );

describe("Kano API", () => {
  it("requires sign in", async () => {
    expect((await anon.get(base())).status).toBe(401);
    expect((await anon.post(base()).send({})).status).toBe(401);
  });

  it("lets a team member submit an unevaluated request with a REQ code", async () => {
    const r = await submit();
    expect(r.code).toMatch(/^REQ-\d{3,}$/);
    expect(r.kanoCategory).toBeNull();
    expect(r.decision).toBeNull();
    expect(r.wsjfScore).toBeNull();
    expect(r.riceScore).toBeNull();
  });

  it("only the PM can categorize, score, decide, delete or promote", async () => {
    const r = await submit();
    for (const res of [
      await member.patch(`/api/kano/${r.id}`).send({ kanoCategory: "must_be" }),
      await member.delete(`/api/kano/${r.id}`),
      await member.post(`/api/kano/${r.id}/promote`).send({}),
    ]) {
      expect(res.status).toBe(403);
    }
  });

  it("computes WSJF and RICE in the database and ignores nothing typed", async () => {
    const r = await submit();
    const scored = json<KanoDto>(
      await pm.patch(`/api/kano/${r.id}`).send({
        kanoCategory: "performance",
        decision: "approve_mvp",
        wsjfBusinessValue: 8,
        wsjfTimeCriticality: 5,
        wsjfRiskReduction: 3,
        wsjfJobSize: 2,
        riceReach: 1000,
        riceImpact: 2,
        riceConfidence: 80,
        riceEffort: 4,
      }),
    );
    expect(scored.wsjfScore).toBe(8);
    expect(scored.riceScore).toBe(400);
    expect(scored.kanoCategory).toBe("performance");

    const partial = json<KanoDto>(await pm.patch(`/api/kano/${r.id}`).send({ wsjfJobSize: null }));
    expect(partial.wsjfScore).toBeNull();
  });

  it("rejects values outside the allowed scales", async () => {
    const r = await submit();
    for (const body of [
      { wsjfBusinessValue: 4 },
      { riceImpact: 5 },
      { riceConfidence: 101 },
      { riceEffort: 0 },
      { kanoCategory: "nope" },
    ]) {
      expect((await pm.patch(`/api/kano/${r.id}`).send(body)).status).toBe(400);
    }
  });

  it("sorts by WSJF with unscored requests last and filters by category", async () => {
    const hi = await submit({ description: "High value" });
    await pm.patch(`/api/kano/${hi.id}`).send({
      kanoCategory: "attractive",
      wsjfBusinessValue: 13,
      wsjfTimeCriticality: 13,
      wsjfRiskReduction: 13,
      wsjfJobSize: 1,
    });
    const list = json<{ items: KanoDto[] }>(await pm.get(base()));
    const scored = list.items.filter((i) => i.wsjfScore !== null).map((i) => i.wsjfScore as number);
    expect(scored).toEqual([...scored].sort((a, b) => b - a));
    const lastScoredIndex = list.items.map((i) => i.wsjfScore !== null).lastIndexOf(true);
    const firstUnscored = list.items.findIndex((i) => i.wsjfScore === null);
    if (firstUnscored !== -1) expect(firstUnscored).toBeGreaterThan(lastScoredIndex);

    const only = json<{ items: KanoDto[] }>(await pm.get(`${base()}?kanoCategory=attractive`));
    expect(only.items.length).toBeGreaterThan(0);
    expect(only.items.every((i) => i.kanoCategory === "attractive")).toBe(true);
    const un = json<{ items: KanoDto[] }>(await pm.get(`${base()}?unevaluated=true`));
    expect(un.items.every((i) => i.kanoCategory === null)).toBe(true);
  });

  it("promotes a request to a story once, carrying the target release", async () => {
    const r = await submit();
    await pm
      .patch(`/api/kano/${r.id}`)
      .send({ targetReleaseId: releaseId, decision: "approve_mvp" });
    const res = await pm.post(`/api/kano/${r.id}/promote`).send({});
    expect(res.status).toBe(201);
    const body = json<{ request: KanoDto; storyId: string }>(res);
    expect(body.request.promotedStoryCode).toMatch(/^USM-/);

    const map = json<StoryMapDto>(await pm.get(`/api/story-map?subprojectId=${f.subA.id}`));
    const story = map.stories.find((s) => s.id === body.storyId);
    expect(story?.story).toBe("Export engagement data to CSV");
    expect(story?.releaseId).toBe(releaseId);
    expect(story?.status).toBe("backlog");

    expect((await pm.post(`/api/kano/${r.id}/promote`).send({})).status).toBe(409);
  });

  it("needs a subproject to promote", async () => {
    const r = await submit({ subprojectId: null });
    expect((await pm.post(`/api/kano/${r.id}/promote`).send({})).status).toBe(422);
  });

  it("rejects a target release or subproject from another project", async () => {
    const r = await submit();
    const res = await pm.patch(`/api/kano/${r.id}`).send({ subprojectId: f.otherSub.id });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
