import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectWorkItemsResponse, WorkItem } from "@myapp/shared";
import { createApp } from "../app";
import { db } from "../db/client";
import { kanoRequestSpecs, raidMitigatingActions } from "../db/schema";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";
import * as m from "../services/moduleService";
import * as usm from "../services/usmService";

type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;
// Far enough from any real "today" that the schedule status never flips while the suite runs.
const PAST = "2000-01-01";
const FUTURE = "2999-12-31";

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

/** One action per module in a project, so the same shape can fill the project and a decoy project. */
async function seedProject(projectId: string, suffix: string, owner: string | null) {
  const k = { projectId, createdById: f.pm.id };
  const outcome = await m.createOutcome({ ...k, title: `Outcome ${suffix}` });
  const opp = await m.createOpportunity({ ...k, outcomeId: outcome.id, title: `Req ${suffix}` });
  await m.createSolution({
    ...k,
    opportunityId: opp.id,
    title: `OST solution ${suffix}`,
    ownerId: owner,
    targetDate: FUTURE,
  });
  const req = await m.createKanoRequest({ ...k, revisionRequest: `Revise ${suffix}` });
  await db.insert(kanoRequestSpecs).values({
    kanoRequestId: req.id,
    label: `Kano spec ${suffix}`,
    responsibleId: owner,
    targetDate: PAST,
  });
  const raid = await m.createRaidItem({
    ...k,
    itemType: "risk",
    description: `Risk ${suffix}`,
    impact: 2,
  });
  await db.insert(raidMitigatingActions).values({
    raidItemId: raid.id,
    description: `RAID action ${suffix}`,
    responsibleId: f.m2.id,
    targetDate: FUTURE,
    isCompleted: true,
    completedAt: new Date(),
  });
  const persona = await usm.createPersona(f.pmActor, { projectId, name: `User ${suffix}` });
  const step = await usm.createStep(f.pmActor, {
    projectId,
    personaId: persona.id,
    title: "Sign in",
  });
  await usm.createFeature({ projectId, stepId: step.id, title: `USM feature ${suffix}` });
}

beforeAll(async () => {
  f = await createFixture();
  pm = await loginAs(f.pm.email);
  member = await loginAs(f.m1.email);
  await seedProject(f.project.id, "A", f.m1.id);
  await rawActivity(f.project.id, f.pm.id, {
    title: `Core activity ${f.tag}`,
    assigneeId: f.m1.id,
    dueDate: FUTURE,
  });
  // A decoy project whose items must never leak in.
  await seedProject(f.otherProject.id, "B", f.m1.id);
});
afterAll(async () => {
  await f.cleanup();
});

const list = async (query: Record<string, string> = {}, agent: Agent = pm) => {
  const res = await agent.get(`/api/projects/${f.project.id}/work-items`).query(query);
  expect(res.status).toBe(200);
  return json<ProjectWorkItemsResponse>(res).items;
};
// OST titles carry their code ("OST-01 ..."); compare on the text after it.
const plain = (title: string) => title.replace(/^[A-Z]+-\d+ /, "");
const titles = (items: WorkItem[]) => items.map((i) => plain(i.title)).sort();

describe("GET /projects/:id/work-items", () => {
  it("returns this project's actions from all four modules and its core activities, and nothing else", async () => {
    const items = await list();
    expect(titles(items)).toEqual(
      [
        "Kano spec A",
        "OST solution A",
        "RAID action A",
        "USM feature A",
        `Core activity ${f.tag}`,
      ].sort(),
    );
    expect(items.every((i) => i.projectId === f.project.id)).toBe(true);
    expect(new Set(items.map((i) => i.sourceModule))).toEqual(
      new Set(["ost", "kano", "raid", "user_story", "project"]),
    );
  });

  it("carries dates, assignees, completion and schedule status without needing a sprint or release", async () => {
    const by = Object.fromEntries((await list()).map((i) => [plain(i.title), i]));
    expect(by["OST solution A"]).toMatchObject({
      dueDate: FUTURE,
      assigneeId: f.m1.id,
      isCompleted: false,
      scheduleStatus: "ongoing_on_time",
      subprojectId: null,
    });
    expect(by["Kano spec A"]).toMatchObject({ dueDate: PAST, scheduleStatus: "delayed" });
    expect(by["RAID action A"]).toMatchObject({
      assigneeId: f.m2.id,
      isCompleted: true,
      scheduleStatus: "completed_on_time",
    });
    expect(by["USM feature A"]).toMatchObject({
      assigneeId: null,
      dueDate: null,
      scheduleStatus: "no_due_date",
    });
    expect(by["USM feature A"]?.parentTitle).toContain("Sign in");
  });

  it("filters by module", async () => {
    expect(titles(await list({ module: "ost" }))).toEqual(["OST solution A"]);
    expect(titles(await list({ module: "kano" }))).toEqual(["Kano spec A"]);
    expect(titles(await list({ module: "raid" }))).toEqual(["RAID action A"]);
    expect(titles(await list({ module: "user_story" }))).toEqual(["USM feature A"]);
    expect(titles(await list({ module: "project" }))).toEqual([`Core activity ${f.tag}`]);
  });

  it("filters by status", async () => {
    expect(titles(await list({ status: "delayed" }))).toEqual(["Kano spec A"]);
    expect(titles(await list({ status: "completed" }))).toEqual(["RAID action A"]);
    expect(titles(await list({ status: "no_due_date" }))).toEqual(["USM feature A"]);
    expect(titles(await list({ status: "ongoing" }))).toEqual(
      ["OST solution A", `Core activity ${f.tag}`].sort(),
    );
    expect(titles(await list({ status: "on_time" }))).toEqual(
      ["OST solution A", "RAID action A", `Core activity ${f.tag}`].sort(),
    );
  });

  it("filters by assignee, which is also how Assigned to me works", async () => {
    const mine = ["Kano spec A", "OST solution A", `Core activity ${f.tag}`].sort();
    expect(titles(await list({ assigneeId: f.m1.id }))).toEqual(mine);
    expect(titles(await list({ assigneeId: f.m1.id }, member))).toEqual(mine);
    expect(titles(await list({ assigneeId: f.m2.id }))).toEqual(["RAID action A"]);
    expect(titles(await list({ module: "ost", status: "delayed" }))).toEqual([]);
  });

  it("lists open items first, soonest due first", async () => {
    const items = await list();
    const open = items.filter((i) => !i.isCompleted);
    expect(items.slice(0, open.length)).toEqual(open);
    expect(plain(open[0]?.title ?? "")).toBe("Kano spec A"); // the overdue one
    expect(plain(items.at(-1)?.title ?? "")).toBe("RAID action A"); // finished items last
  });

  it("rejects bad filters and hides a project from members who are not on it", async () => {
    const bad = await pm.get(`/api/projects/${f.project.id}/work-items`).query({ module: "nope" });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
    const hidden = await member.get(`/api/projects/${f.otherProject.id}/work-items`);
    expect(hidden.status).toBe(404);
  });
});
