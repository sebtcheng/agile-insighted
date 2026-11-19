import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { portfolioQuerySchema } from "@myapp/shared";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  activities,
  activityDependencies,
  releases,
  sprintMemberCapacity,
  sprints,
  subprojects,
} from "../db/schema";
import { createFixture, rawActivity, setProjectArchived, type Fixture } from "../test/helpers";
import { createRaidItem } from "./moduleService";
import { getPortfolio } from "./portfolioService";
import { escapeLike, search } from "./searchService";
import { getWorkload } from "./workloadService";

// Wednesday 18 Nov 2026 in Manila. Week is Mon 16 to Sun 22.
const NOW = new Date("2026-11-18T04:00:00Z");
const defaults = portfolioQuerySchema.parse({});
const started = new Date("2026-10-01T00:00:00Z");
const doneFields = {
  status: "done" as const,
  percentComplete: 100,
  startedAt: started,
  completedAt: started,
};

let f: Fixture;
let ids: Record<string, string>;

beforeAll(async () => {
  f = await createFixture();
  const p = f.project.id;
  const mk = (name: string, o: Parameters<typeof rawActivity>[2]) =>
    rawActivity(p, f.pm.id, { title: `${name} ${f.tag}`, subprojectId: f.subA.id, ...o });

  const future = await db
    .insert(releases)
    .values({ projectId: p, name: "R-future", targetDate: "2026-12-01" })
    .returning();
  const past = await db
    .insert(releases)
    .values({ projectId: p, name: "R-past", targetDate: "2026-10-01" })
    .returning();

  const a1 = await mk("a1", { assigneeId: f.m1.id, releaseId: future[0]?.id });
  const a2 = await mk("a2", {
    status: "in_progress",
    startedAt: started,
    isBlocked: true,
    blockedReason: "x",
    assigneeId: f.m1.id,
  });
  const a3 = await mk("a3", { dueDate: "2026-01-01" });
  const a4 = await mk("a4", {});
  const a5 = await mk("a5", { releaseId: past[0]?.id });
  const a6 = await mk("a6", {});
  const a7 = await mk("a7", doneFields);
  const a8 = await mk("a8", doneFields);
  await db.insert(activityDependencies).values([
    { blockedActivityId: a4.id, blockingActivityId: a5.id }, // a4 waits on an unfinished activity
    { blockedActivityId: a6.id, blockingActivityId: a7.id }, // a6's blocker is done: not waiting
  ]);
  ids = { a1: a1.id, a2: a2.id, a3: a3.id, a4: a4.id, a5: a5.id, a6: a6.id, a7: a7.id, a8: a8.id };

  await db.update(sprints).set({ status: "active" }).where(eq(sprints.id, f.sprint.id));
  await db
    .update(subprojects)
    .set({ health: "at_risk", leadId: f.m2.id })
    .where(eq(subprojects.id, f.subB.id));
  await rawActivity(p, f.pm.id, { title: `b1 ${f.tag}`, subprojectId: f.subB.id });

  const k = { projectId: p, createdById: f.pm.id };
  await createRaidItem({
    ...k,
    itemType: "risk",
    description: "high open",
    impact: 3,
    status: "open",
  });
  await createRaidItem({
    ...k,
    itemType: "risk",
    description: "high in progress",
    impact: 3,
    status: "in_progress",
  });
  await createRaidItem({
    ...k,
    itemType: "risk",
    description: "high closed",
    impact: 3,
    status: "closed",
  });
  await createRaidItem({
    ...k,
    itemType: "risk",
    description: "medium open",
    impact: 2,
  });
});
afterAll(async () => {
  await f.cleanup();
});

const mine = <T extends { id: string }>(rows: T[]) =>
  rows.filter((r) => r.id === f.subA.id || r.id === f.subB.id);

describe("portfolio", () => {
  it("counts open, blocked, waiting, overdue and percent done from the data", async () => {
    const { items } = await getPortfolio(f.pmActor, defaults, NOW);
    const a = items.find((r) => r.id === f.subA.id);
    expect(a).toMatchObject({
      code: "SUB-A",
      total: 8,
      open: 6,
      blocked: 1,
      waitingOnDependency: 1, // a4 only: a6's blocker is done
      overdue: 1, // a3 due Jan 2026
      percentDone: 25, // 2 of 8
      openHighRaid: 2, // open and in-progress High items; closed and Medium excluded
    });
    expect(a?.activeSprint?.name).toBe("S1");
  });

  it("picks the next upcoming planned release for the subproject, ignoring past targets", async () => {
    const { items } = await getPortfolio(f.pmActor, defaults, NOW);
    const a = items.find((r) => r.id === f.subA.id);
    expect(a?.nextRelease).toMatchObject({ name: "R-future", targetDate: "2026-12-01" });
    expect(items.find((r) => r.id === f.subB.id)?.nextRelease).toBeNull();
  });

  it("filters by health, lead, blockers and 'my subprojects'", async () => {
    const run = async (q: object) =>
      mine((await getPortfolio(f.m1Actor, portfolioQuerySchema.parse(q), NOW)).items).map(
        (r) => r.code,
      );
    expect(await run({ health: "at_risk" })).toEqual(["SUB-B"]);
    expect(await run({ leadId: f.m2.id })).toEqual(["SUB-B"]);
    expect(await run({ hasBlockers: "true" })).toEqual(["SUB-A"]);
    // m1 has work assigned in SUB-A and leads nothing, so "mine" shows SUB-A only.
    expect(await run({ mine: "true" })).toEqual(["SUB-A"]);
  });

  it("sorts and keeps a stable order", async () => {
    const byOpen = mine(
      (
        await getPortfolio(
          f.pmActor,
          portfolioQuerySchema.parse({ sort: "open", dir: "desc" }),
          NOW,
        )
      ).items,
    );
    expect(byOpen.map((r) => r.code)).toEqual(["SUB-A", "SUB-B"]);
    const byHealth = mine(
      (await getPortfolio(f.pmActor, portfolioQuerySchema.parse({ sort: "health" }), NOW)).items,
    );
    expect(byHealth.map((r) => r.code)).toEqual(["SUB-B", "SUB-A"]); // at risk before on track
  });

  it("hides subprojects of archived projects", async () => {
    await setProjectArchived(f.project.id, true);
    expect(mine((await getPortfolio(f.pmActor, defaults, NOW)).items)).toHaveLength(0);
    await setProjectArchived(f.project.id, false);
  });
});

describe("workload", () => {
  beforeAll(async () => {
    const p = f.project.id;
    const mk = (title: string, o: Parameters<typeof rawActivity>[2]) =>
      rawActivity(p, f.pm.id, { title: `${title} ${f.tag}`, assigneeId: f.m1.id, ...o });
    for (let i = 0; i < 4; i += 1)
      await mk(`wip${i}`, { status: "in_progress", startedAt: started });
    await mk("due1", { dueDate: "2026-11-17" });
    await mk("due2", { dueDate: "2026-11-22" });
    await mk("next-week", { dueDate: "2026-11-23" });
    await mk("sprint1", { sprintId: f.sprint.id });
    await mk("sprint2", { sprintId: f.sprint.id });
    await rawActivity(p, f.pm.id, {
      title: `m2 ${f.tag}`,
      assigneeId: f.m2.id,
      sprintId: f.sprint.id,
    });
    await db.insert(sprintMemberCapacity).values([
      { sprintId: f.sprint.id, userId: f.m1.id, capacityItems: 1 },
      { sprintId: f.sprint.id, userId: f.m2.id, capacityItems: 5 },
    ]);
  });

  it("flags over-limit WIP and over-capacity, and counts due-this-week, blocked and waiting", async () => {
    const { items } = await getWorkload({ now: NOW, projectId: f.project.id });
    const m1 = items.find((r) => r.userId === f.m1.id);
    const m2 = items.find((r) => r.userId === f.m2.id);
    expect(m1).toMatchObject({
      inProgress: 5, // 4 wip + the blocked a2 in progress
      wipLimit: 3,
      overWipLimit: true,
      dueThisWeek: 2,
      blocked: 1,
      sprintCapacity: 1,
      sprintAssigned: 2,
      overCapacity: true,
    });
    expect(m1?.sprint?.name).toBe("S1");
    expect(m2).toMatchObject({
      overWipLimit: false,
      sprintAssigned: 1,
      sprintCapacity: 5,
      overCapacity: false,
    });
  });

  it("counts activities waiting on an unfinished dependency per assignee", async () => {
    await db
      .update(activities)
      .set({ assigneeId: f.m2.id })
      .where(eq(activities.id, ids.a4 ?? ""));
    const { items } = await getWorkload({ now: NOW, projectId: f.project.id });
    expect(items.find((r) => r.userId === f.m2.id)?.waitingOnDependency).toBe(1);
  });

  it("orders people alphabetically and exposes no ranking or score fields", async () => {
    const { items } = await getWorkload({ now: NOW, projectId: f.project.id });
    const names = items.map((r) => r.fullName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const key of Object.keys(items[0] ?? {}))
      expect(key).not.toMatch(/rank|score|velocity|output|productivity/i);
  });
});

describe("search", () => {
  let token: string;
  beforeAll(async () => {
    token = `zq${f.tag}`;
    await rawActivity(f.project.id, f.pm.id, {
      title: `Calibrate ${token} engagement indicator`,
      subprojectId: f.subA.id,
    });
    await rawActivity(f.project.id, f.pm.id, {
      title: `${token} onboarding checklist`,
      subprojectId: f.subA.id,
    });
    await rawActivity(f.otherProject.id, f.pm.id, { title: `Unrelated ${token} elsewhere` });
  });

  it("finds activities by a partial word and ranks prefix matches first", async () => {
    const res = await search(token.slice(0, 8));
    const titles = res.activities.map((a) => a.title);
    expect(titles).toContain(`Calibrate ${token} engagement indicator`);
    expect(titles).toContain(`Unrelated ${token} elsewhere`);
    // A title that starts with the term outranks titles that merely contain it.
    expect(titles[0]).toBe(`${token} onboarding checklist`);
    expect(res.activities[0]?.subprojectCode).toBe("SUB-A");
  });

  it("finds subprojects by code or name and people by name", async () => {
    expect((await search("SUB-A")).subprojects.map((s) => s.code)).toContain("SUB-A");
    expect((await search("Sub B")).subprojects.map((s) => s.code)).toContain("SUB-B");
    expect((await search("Test Member One")).people.map((p) => p.id)).toContain(f.m1.id);
  });

  it("limits each group", async () => {
    const res = await search("a", 2);
    expect(res.subprojects.length).toBeLessThanOrEqual(2);
    expect((await search("zq", 1)).activities.length).toBeLessThanOrEqual(1);
  });

  it("handles empty and very short queries without error", async () => {
    expect(await search("")).toEqual({ query: "", activities: [], subprojects: [], people: [] });
    expect(await search("   ")).toMatchObject({ activities: [], subprojects: [], people: [] });
    const one = await search("z");
    expect(one.activities).toEqual([]); // activity search needs 3+ characters
    const two = await search("zq");
    expect(two.activities).toEqual([]);
  });

  it("treats LIKE wildcards literally", async () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect((await search("%%%")).activities).toEqual([]);
    expect((await search("___")).activities).toEqual([]);
  });

  it("hides activities of archived projects", async () => {
    await setProjectArchived(f.project.id, true);
    expect(
      (await search(token)).activities.filter(
        (a) => a.title.includes(token) && !a.title.startsWith("Unrelated"),
      ),
    ).toEqual([]);
    await setProjectArchived(f.project.id, false);
  });
});

describe("read-model API", () => {
  const app = createApp();
  it("requires a signed-in user and validates parameters", async () => {
    for (const path of ["/api/portfolio", "/api/workload", "/api/search?q=abc"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: f.m1.email, password: f.password });
    expect((await agent.get("/api/portfolio?health=bogus")).status).toBe(400);
    expect((await agent.get(`/api/search?q=${"x".repeat(101)}`)).status).toBe(400);
    expect((await agent.get("/api/search")).status).toBe(200);
    expect((await agent.get("/api/portfolio?sort=open&dir=desc&mine=true")).status).toBe(200);
    expect((await agent.get("/api/workload")).status).toBe(200);
    expect((await agent.get(`/api/workload/${f.m1.id}/items`)).status).toBe(200);
  });
});
