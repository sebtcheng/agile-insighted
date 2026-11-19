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

  it("rejects a parent opportunity from another outcome", async () => {
    const out2 = json<Id>(
      await pm.post(`/api/projects/${f.project.id}/ost/outcomes`).send({ title: "Second outcome" }),
    );
    const res = await pm
      .post(`/api/ost/outcomes/${out2.id}/opportunities`)
      .send({ title: "Child", parentOpportunityId: oppId });
    expect(res.status).toBe(404);
  });

  it("rolls the solution status up from the riskiest assumption", async () => {
    const sol = await newSolution("Roll-up");
    const a = json<Id>(
      await member
        .post(`/api/ost/solutions/${sol.id}/assumptions`)
        .send({ statement: "Students will use it", category: "desirability" }),
    );
    // No riskiest assumption yet: stays planned even when the assumption is validated.
    await member.patch(`/api/ost/assumptions/${a.id}`).send({ validationStatus: "validated" });
    expect((await tree()).solutions.find((s) => s.id === sol.id)?.validationStatus).toBe("planned");

    await pm.patch(`/api/ost/assumptions/${a.id}`).send({ isRiskiest: true });
    expect((await tree()).solutions.find((s) => s.id === sol.id)?.validationStatus).toBe(
      "validated",
    );
    await member.patch(`/api/ost/assumptions/${a.id}`).send({ validationStatus: "invalidated" });
    expect((await tree()).solutions.find((s) => s.id === sol.id)?.validationStatus).toBe(
      "invalidated",
    );
    await pm.delete(`/api/ost/assumptions/${a.id}`);
    expect((await tree()).solutions.find((s) => s.id === sol.id)?.validationStatus).toBe("planned");
  });

  it("lets members record results but not change the statement or riskiest flag", async () => {
    const sol = await newSolution("Member limits");
    const a = json<Id>(
      await member
        .post(`/api/ost/solutions/${sol.id}/assumptions`)
        .send({ statement: "Teachers have time", category: "feasibility" }),
    );
    expect(
      (await member.patch(`/api/ost/assumptions/${a.id}`).send({ resultNotes: "5 of 6 agreed" }))
        .status,
    ).toBe(200);
    expect(
      (await member.patch(`/api/ost/assumptions/${a.id}`).send({ isRiskiest: true })).status,
    ).toBe(403);
    expect(
      (await member.patch(`/api/ost/assumptions/${a.id}`).send({ statement: "x" })).status,
    ).toBe(403);
    expect((await member.delete(`/api/ost/assumptions/${a.id}`)).status).toBe(403);
  });

  it("moves the riskiest flag instead of failing on a second one", async () => {
    const sol = await newSolution("Flag move");
    const make = async (statement: string) =>
      json<Id>(
        await pm
          .post(`/api/ost/solutions/${sol.id}/assumptions`)
          .send({ statement, category: "viability", isRiskiest: true }),
      );
    const a = await make("First");
    const b = await make("Second");
    const mine = (await tree()).assumptions.filter((x) => x.solutionId === sol.id);
    expect(mine.find((x) => x.id === a.id)?.isRiskiest).toBe(false);
    expect(mine.find((x) => x.id === b.id)?.isRiskiest).toBe(true);
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
    const a = json<Id>(
      await pm.post(`/api/ost/solutions/${sol.id}/assumptions`).send({
        statement: "It works",
        category: "usability",
        isRiskiest: true,
      }),
    );
    await member.patch(`/api/ost/assumptions/${a.id}`).send({ validationStatus: "validated" });
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
