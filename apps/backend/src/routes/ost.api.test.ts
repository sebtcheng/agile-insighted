import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OstTreeDto, StoryMapDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
type Id = { id: string };
type ErrorBody = { error: { code: string } };
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let anon: Agent;
let outcomeId: string;
let oppId: string;

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
  outcomeId = json<Id>(
    await pm.post(`/api/projects/${f.project.id}/ost/outcomes`).send({
      title: "Reduce dropouts by 20%",
      subprojectId: f.subA.id,
      metricName: "Dropout rate",
      baselineValue: 30,
      targetValue: 24,
    }),
  ).id;
  oppId = json<Id>(
    await pm
      .post(`/api/ost/outcomes/${outcomeId}/opportunities`)
      .send({ title: "Students feel lost" }),
  ).id;
});
afterAll(async () => {
  await f.cleanup();
});

const newSolution = async (title = "Onboarding checklist") =>
  json<{ id: string; code: string; validationStatus: string }>(
    await pm.post(`/api/ost/opportunities/${oppId}/solutions`).send({ title }),
  );
const tree = async () => json<OstTreeDto>(await pm.get(`/api/projects/${f.project.id}/ost`));

describe("OST API", () => {
  it("requires sign in and keeps structure PM-only", async () => {
    expect((await anon.get(`/api/projects/${f.project.id}/ost`)).status).toBe(401);
    expect(
      (await member.post(`/api/projects/${f.project.id}/ost/outcomes`).send({ title: "x" })).status,
    ).toBe(403);
    expect(
      (await member.post(`/api/ost/opportunities/${oppId}/solutions`).send({ title: "x" })).status,
    ).toBe(403);
  });

  it("returns the tree with numeric metrics and solution codes", async () => {
    const sol = await newSolution();
    expect(sol.code).toMatch(/^OST-\d{2,}$/);
    expect(sol.validationStatus).toBe("planned");
    const t = await tree();
    const o = t.outcomes.find((x) => x.id === outcomeId);
    expect(o?.baselineValue).toBe(30);
    expect(o?.targetValue).toBe(24);
    expect(o?.subprojectCode).toBe("SUB-A");
    expect(o?.subprojectName).toBeTruthy();
    expect(t.solutions.some((s) => s.id === sol.id)).toBe(true);
  });

  it("allows only one targeted opportunity per outcome", async () => {
    const other = json<Id>(
      await pm
        .post(`/api/ost/outcomes/${outcomeId}/opportunities`)
        .send({ title: "Too many portals" }),
    );
    await pm.patch(`/api/ost/opportunities/${oppId}`).send({ isTargeted: true });
    await pm.patch(`/api/ost/opportunities/${other.id}`).send({ isTargeted: true });
    const t = await tree();
    const targeted = t.opportunities.filter((o) => o.outcomeId === outcomeId && o.isTargeted);
    expect(targeted.map((o) => o.id)).toEqual([other.id]);
  });

  it("has a flat Outcome > Opportunity > Solution tree with no nesting or assumptions", async () => {
    const sol = await newSolution("Flat");
    const t = (await tree()) as unknown as Record<string, unknown>;
    expect(Object.keys(t).sort()).toEqual(["opportunities", "outcomes", "solutions"]);
    const opp = (t.opportunities as Array<Record<string, unknown>>).find((o) => o.id === oppId);
    expect(opp).toBeDefined();
    expect("parentOpportunityId" in (opp ?? {})).toBe(false);
    // The removed endpoints and fields are gone.
    expect(
      (await pm.post(`/api/ost/solutions/${sol.id}/assumptions`).send({ statement: "x" })).status,
    ).toBe(404);
    const out2 = json<Id>(
      await pm.post(`/api/projects/${f.project.id}/ost/outcomes`).send({ title: "Second outcome" }),
    );
    const child = json<Id>(
      await pm
        .post(`/api/ost/outcomes/${out2.id}/opportunities`)
        .send({ title: "Top level", parentOpportunityId: oppId }),
    );
    const again = (await tree()).opportunities.find((o) => o.id === child.id);
    expect(again?.outcomeId).toBe(out2.id);
  });

  it("lets only a PM mark a solution validated, which drives the convert gate", async () => {
    const sol = await newSolution("Marked");
    expect(
      (await member.patch(`/api/ost/solutions/${sol.id}`).send({ validationStatus: "validated" }))
        .status,
    ).toBe(403);
    const ok = await pm
      .patch(`/api/ost/solutions/${sol.id}`)
      .send({ validationStatus: "validated" });
    expect(ok.status).toBe(200);
    expect((await tree()).solutions.find((s) => s.id === sol.id)?.validationStatus).toBe(
      "validated",
    );
  });

  it("blocks converting an unvalidated solution, allows a logged PM override", async () => {
    const sol = await newSolution("Gate");
    const blocked = await pm
      .post(`/api/ost/solutions/${sol.id}/convert`)
      .send({ subprojectId: f.subA.id });
    expect(blocked.status).toBe(422);
    expect(json<ErrorBody>(blocked).error.code).toBe("validation_incomplete");

    const ok = await pm
      .post(`/api/ost/solutions/${sol.id}/convert`)
      .send({ subprojectId: f.subA.id, overrideReason: "Pilot already running" });
    expect(ok.status).toBe(201);
    const log = json<{ items: Array<{ gate: string; entityType: string }> }>(
      await pm.get(`/api/gate-overrides?entityType=solution&entityId=${sol.id}`),
    );
    expect(log.items).toHaveLength(1);
    expect(log.items[0]?.gate).toBe("validation");

    expect(
      (await pm.post(`/api/ost/solutions/${sol.id}/convert`).send({ subprojectId: f.subA.id }))
        .status,
    ).toBe(409);
  });

  it("converts a validated solution into a backlog story and links it", async () => {
    const sol = await newSolution("Validated one");
    await pm.patch(`/api/ost/solutions/${sol.id}`).send({ validationStatus: "validated" });
    const res = await pm
      .post(`/api/ost/solutions/${sol.id}/convert`)
      .send({ subprojectId: f.subA.id });
    expect(res.status).toBe(201);
    const { storyId, storyCode } = json<{ storyId: string; storyCode: string }>(res);
    expect(storyCode).toMatch(/^USM-/);
    const map = json<StoryMapDto>(await pm.get(`/api/story-map?subprojectId=${f.subA.id}`));
    expect(map.stories.find((s) => s.id === storyId)?.story).toBe("Validated one");
    expect((await tree()).solutions.find((s) => s.id === sol.id)?.convertedStoryCode).toBe(
      storyCode,
    );
    // A member cannot override or convert.
    expect(
      (await member.post(`/api/ost/solutions/${sol.id}/convert`).send({ subprojectId: f.subA.id }))
        .status,
    ).toBe(403);
  });

  it("rejects a subproject from another project when converting", async () => {
    const sol = await newSolution("Cross project");
    const res = await pm
      .post(`/api/ost/solutions/${sol.id}/convert`)
      .send({ subprojectId: f.otherSub.id, overrideReason: "test" });
    expect(res.status).toBe(404);
  });
});
