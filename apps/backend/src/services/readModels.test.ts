import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  activityDependencies,
  projectMembers,
  projects,
  releases,
  sprintMemberCapacity,
  sprints,
  subprojects,
} from "../db/schema";
import { createFixture, rawActivity, setProjectArchived, type Fixture } from "../test/helpers";
import { createRaidItem } from "./moduleService";
import { escapeLike, search } from "./searchService";
import { getWorkload } from "./workloadService";

// Wednesday 18 Nov 2026 in Manila. Week is Mon 16 to Sun 22.
const NOW = new Date("2026-11-18T04:00:00Z");
const started = new Date("2026-10-01T00:00:00Z");
const doneFields = {
  status: "done" as const,
  percentComplete: 100,
  startedAt: started,
  completedAt: started,
};

let f: Fixture;

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

  await mk("a1", { assigneeId: f.m1.id, releaseId: future[0]?.id });
  await mk("a2", {
    status: "in_progress",
    startedAt: started,
    isBlocked: true,
    blockedReason: "x",
    assigneeId: f.m1.id,
  });
  await mk("a3", { dueDate: "2026-01-01" });
  const a4 = await mk("a4", {});
  const a5 = await mk("a5", { releaseId: past[0]?.id });
  const a6 = await mk("a6", {});
  const a7 = await mk("a7", doneFields);
  await mk("a8", doneFields);
  await db.insert(activityDependencies).values([
    { blockedActivityId: a4.id, blockingActivityId: a5.id }, // a4 waits on an unfinished activity
    { blockedActivityId: a6.id, blockingActivityId: a7.id }, // a6's blocker is done: not waiting
  ]);

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

  it("counts owned and team-member projects per person, zero when none", async () => {
    const before = (await getWorkload({ now: NOW })).items;
    const get = (rows: typeof before, id: string) => rows.find((r) => r.userId === id)!;
    const [extra] = await db
      .insert(projects)
      .values({ name: `WL ${f.tag}`, code: `WL-${f.tag}`, ownerId: f.m2.id })
      .returning({ id: projects.id });
    await db.insert(projectMembers).values({ projectId: extra!.id, userId: f.m1.id });
    try {
      const after = (await getWorkload({ now: NOW })).items;
      expect(get(after, f.m2.id).ownedProjectsCount).toBe(
        get(before, f.m2.id).ownedProjectsCount + 1,
      );
      expect(get(after, f.m1.id).teamMemberProjectsCount).toBe(
        get(before, f.m1.id).teamMemberProjectsCount + 1,
      );
      expect(get(after, f.m1.id).ownedProjectsCount).toBe(get(before, f.m1.id).ownedProjectsCount);
      for (const r of after) {
        expect(Number.isInteger(r.ownedProjectsCount) && r.ownedProjectsCount >= 0).toBe(true);
        expect(Number.isInteger(r.teamMemberProjectsCount) && r.teamMemberProjectsCount >= 0).toBe(
          true,
        );
      }
    } finally {
      await db.delete(projects).where(eq(projects.id, extra!.id));
    }
  });

  it("counts due-this-week per person", async () => {
    const { items } = await getWorkload({ now: NOW });
    expect(items.find((r) => r.userId === f.m1.id)).toMatchObject({ dueThisWeek: 2 });
  });

  it("orders people alphabetically and exposes no ranking or score fields", async () => {
    const { items } = await getWorkload({ now: NOW });
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
    for (const path of ["/api/workload", "/api/search?q=abc"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: f.m1.email, password: f.password });
    expect((await agent.get(`/api/search?q=${"x".repeat(101)}`)).status).toBe(400);
    expect((await agent.get("/api/search")).status).toBe(200);
    expect((await agent.get("/api/workload")).status).toBe(200);
    expect((await agent.get(`/api/workload/${f.m1.id}/items`)).status).toBe(200);
  });
});
