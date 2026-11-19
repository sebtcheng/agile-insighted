import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsmFeatureDto, UsmPersonaDto, UsmStepDto } from "@myapp/shared";
import { createApp } from "../app";
import { loadWorkItems } from "../services/workItemService";
import { createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;
const DUE = "2026-12-15";
const BASE = "/api/story-map";

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;

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
});
afterAll(async () => {
  await f.cleanup();
});

const persona = async (name: string, projectId = f.project.id) =>
  json<UsmPersonaDto>(await pm.post(`${BASE}/personas`).send({ projectId, name }));
const step = async (personaId: string, title: string, extra: Record<string, unknown> = {}) =>
  json<UsmStepDto>(
    await pm.post(`${BASE}/steps`).send({ projectId: f.project.id, personaId, title, ...extra }),
  );
const titles = async (personaId: string) =>
  json<{ items: UsmStepDto[] }>(
    await pm.get(`${BASE}/steps`).query({ projectId: f.project.id, personaId }),
  ).items.map((s) => s.title);

describe("USM personas", () => {
  it("allows several users per project and lists them in order", async () => {
    await persona("Teacher");
    await persona("Parent");
    const res = await pm.get(`${BASE}/personas`).query({ projectId: f.project.id });
    expect(res.status).toBe(200);
    expect(json<{ items: UsmPersonaDto[] }>(res).items.map((p) => p.name)).toEqual([
      "Teacher",
      "Parent",
    ]);
  });
  it("rejects a duplicate user name in the same project", async () => {
    await persona("Dup");
    const res = await pm.post(`${BASE}/personas`).send({ projectId: f.project.id, name: "dup" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
  it("only the PM may add users", async () => {
    const res = await member
      .post(`${BASE}/personas`)
      .send({ projectId: f.project.id, name: "Nope" });
    expect(res.status).toBe(403);
  });
});

describe("USM steps", () => {
  it("appends, inserts mid-flow and keeps a dense order", async () => {
    const p = await persona("Flow");
    await step(p.id, "A");
    await step(p.id, "B");
    await step(p.id, "C");
    await step(p.id, "Mid", { insertAtIndex: 1 });
    await step(p.id, "First", { insertAtIndex: 0 });
    expect(await titles(p.id)).toEqual(["First", "A", "Mid", "B", "C"]);
    const orders = json<{ items: UsmStepDto[] }>(
      await pm.get(`${BASE}/steps`).query({ projectId: f.project.id, personaId: p.id }),
    ).items.map((s) => s.sortOrder);
    expect(orders).toEqual([0, 1, 2, 3, 4]);
  });
  it("reorders atomically and rejects a partial or foreign id list", async () => {
    const p = await persona("Reorder");
    const a = await step(p.id, "A");
    const b = await step(p.id, "B");
    const c = await step(p.id, "C");
    const ok = await pm
      .patch(`${BASE}/steps/reorder`)
      .send({ projectId: f.project.id, personaId: p.id, stepIds: [c.id, a.id, b.id] });
    expect(ok.status).toBe(200);
    expect(await titles(p.id)).toEqual(["C", "A", "B"]);
    const partial = await pm
      .patch(`${BASE}/steps/reorder`)
      .send({ projectId: f.project.id, personaId: p.id, stepIds: [a.id, b.id] });
    expect(partial.status).toBe(422);
    const other = await persona("Other");
    const foreign = await step(other.id, "X");
    const bad = await pm
      .patch(`${BASE}/steps/reorder`)
      .send({ projectId: f.project.id, personaId: p.id, stepIds: [a.id, b.id, foreign.id] });
    expect(bad.status).toBe(422);
    expect(await titles(p.id)).toEqual(["C", "A", "B"]);
  });
  it("deleting a step cascades its features and closes the gap", async () => {
    const p = await persona("Delete");
    const a = await step(p.id, "A");
    const b = await step(p.id, "B");
    const feat = json<UsmFeatureDto>(
      await pm.post(`${BASE}/features`).send({ projectId: f.project.id, stepId: a.id, title: "F" }),
    );
    expect((await pm.delete(`${BASE}/steps/${a.id}`)).status).toBe(204);
    const left = json<{ items: UsmStepDto[] }>(
      await pm.get(`${BASE}/steps`).query({ projectId: f.project.id, personaId: p.id }),
    ).items;
    expect(left.map((s) => [s.id, s.sortOrder])).toEqual([[b.id, 0]]);
    expect((await pm.patch(`${BASE}/features/${feat.id}`).send({ title: "x" })).status).toBe(404);
  });
});

describe("USM step features", () => {
  it("rejects a project that does not match the step's project", async () => {
    const p = await persona("Mismatch");
    const s = await step(p.id, "S");
    const res = await pm
      .post(`${BASE}/features`)
      .send({ projectId: f.otherProject.id, stepId: s.id, title: "F" });
    expect(res.status).toBe(422);
  });
  it("persists person, date and completion, setting and clearing completed_at", async () => {
    const p = await persona("Feat");
    const s = await step(p.id, "S");
    const created = json<UsmFeatureDto>(
      await pm.post(`${BASE}/features`).send({
        projectId: f.project.id,
        stepId: s.id,
        title: "Sign-in form",
        responsibleId: f.m1.id,
        targetDate: DUE,
      }),
    );
    expect(created).toMatchObject({
      responsibleId: f.m1.id,
      targetDate: DUE,
      isCompleted: false,
      completedAt: null,
    });
    const done = json<UsmFeatureDto>(
      await pm.patch(`${BASE}/features/${created.id}`).send({ isCompleted: true }),
    );
    expect(done.isCompleted).toBe(true);
    expect(done.completedAt).not.toBeNull();
    const undone = json<UsmFeatureDto>(
      await pm.patch(`${BASE}/features/${created.id}`).send({ isCompleted: false }),
    );
    expect(undone.completedAt).toBeNull();
    const withFeatures = json<{ items: UsmStepDto[] }>(
      await pm.get(`${BASE}/steps`).query({ projectId: f.project.id, personaId: p.id }),
    ).items[0];
    expect(withFeatures?.features).toHaveLength(1);
  });
  it("lets a team member tick but not edit", async () => {
    const p = await persona("Member");
    const s = await step(p.id, "S");
    const feat = json<UsmFeatureDto>(
      await pm.post(`${BASE}/features`).send({ projectId: f.project.id, stepId: s.id, title: "F" }),
    );
    expect(
      (await member.patch(`${BASE}/features/${feat.id}`).send({ isCompleted: true })).status,
    ).toBe(200);
    expect((await member.patch(`${BASE}/features/${feat.id}`).send({ title: "Z" })).status).toBe(
      403,
    );
  });
  it("feeds Home and Workload through the shared work-item selector", async () => {
    const p = await persona("Rollup");
    const s = await step(p.id, "S");
    const mk = async (title: string, extra: Record<string, unknown>) =>
      json<UsmFeatureDto>(
        await pm
          .post(`${BASE}/features`)
          .send({ projectId: f.project.id, stepId: s.id, title, responsibleId: f.m1.id, ...extra }),
      );
    await mk("Late", { targetDate: "2000-01-01" });
    await mk("Finished", { targetDate: DUE, isCompleted: true });
    const { items } = await loadWorkItems({ projectId: f.project.id });
    const usm = items.filter(
      (i) => i.sourceModule === "user_story" && i.parentTitle?.startsWith("Rollup"),
    );
    expect(usm.map((i) => i.title).sort()).toEqual(["Finished", "Late"]);
    expect(usm.every((i) => i.assigneeId === f.m1.id && i.parentTitle === "Rollup › S")).toBe(true);
    expect(usm.find((i) => i.title === "Late")?.scheduleStatus).toBe("delayed");
    expect(usm.find((i) => i.title === "Finished")?.isCompleted).toBe(true);
  });
});

describe("USM add user (persona) contract", () => {
  it("creates from projectId and name alone: 201, trimmed, with a per-project sort order", async () => {
    const a = await pm
      .post(`${BASE}/personas`)
      .send({ projectId: f.project.id, name: "  First  " });
    expect(a.status).toBe(201);
    expect(json<UsmPersonaDto>(a)).toMatchObject({ name: "First", projectId: f.project.id });
    const b = await pm.post(`${BASE}/personas`).send({ projectId: f.project.id, name: "Second" });
    expect(json<UsmPersonaDto>(b).sortOrder).toBe(json<UsmPersonaDto>(a).sortOrder + 1);
    const other = await pm
      .post(`${BASE}/personas`)
      .send({ projectId: f.otherProject.id, name: "X" });
    expect(json<UsmPersonaDto>(other).sortOrder).toBe(0);
  });
  it("answers bad input with a structured error, never an empty body", async () => {
    for (const body of [
      { projectId: f.project.id, name: "   " },
      { projectId: f.project.id },
      { name: "No project" },
      { projectId: "not-a-uuid", name: "Bad id" },
    ]) {
      const res = await pm.post(`${BASE}/personas`).send(body);
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(json<{ error: { code: string; message: string } }>(res).error.message).toBeTruthy();
    }
  });
  it("tells the caller when the name is a duplicate", async () => {
    await pm.post(`${BASE}/personas`).send({ projectId: f.project.id, name: "Twin" });
    const res = await pm.post(`${BASE}/personas`).send({ projectId: f.project.id, name: "twin" });
    expect(res.status).toBe(409);
    expect(json<{ error: { message: string } }>(res).error.message).toBeTruthy();
  });
});
