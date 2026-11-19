import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InsightsDto } from "@myapp/shared";
import { createApp } from "../app";
import { env } from "../env";
import { localDate, weekStart } from "../services/dateBuckets";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";

const json = <T>(res: { body: unknown }): T => res.body as T;
const DAY = 86_400_000;

const app = createApp();
let f: Fixture;
let pm: ReturnType<typeof request.agent>;
let anon: ReturnType<typeof request.agent>;

const weekOf = (daysAgo: number) =>
  weekStart(localDate(new Date(Date.now() - daysAgo * DAY), env.APP_TIMEZONE));

/** Completed `daysAgo` days back, started `cycleDays` before that. */
const done = (daysAgo: number, cycleDays: number, extra: Record<string, unknown> = {}) => {
  const completedAt = new Date(Date.now() - daysAgo * DAY);
  return rawActivity(f.project.id, f.pm.id, {
    title: "Done item",
    status: "done",
    percentComplete: 100,
    completedAt,
    startedAt: new Date(completedAt.getTime() - cycleDays * DAY),
    ...extra,
  });
};

beforeAll(async () => {
  f = await createFixture();
  pm = request.agent(app);
  await pm.post("/api/auth/login").send({ email: f.pm.email, password: f.password });
  anon = request.agent(app);
  // Weeks back: 1 (two items), 2 (three, one a defect), 3 (one), 4 (none), 5 (two).
  await done(7, 2);
  await done(8, 2);
  await done(14, 2, { workType: "defect" });
  await done(15, 2);
  await done(16, 2);
  await done(21, 2);
  await done(35, 2);
  await done(36, 2);
  // Open work: one aging in progress, one blocked in review, one todo.
  await rawActivity(f.project.id, f.pm.id, {
    title: "Old and running",
    status: "in_progress",
    startedAt: new Date(Date.now() - 10 * DAY),
  });
  await rawActivity(f.project.id, f.pm.id, {
    title: "Stuck in review",
    status: "in_review",
    isBlocked: true,
    blockedReason: "Waiting on vendor",
    startedAt: new Date(Date.now() - 3 * DAY),
  });
  await rawActivity(f.project.id, f.pm.id, { title: "Not started", status: "todo" });
});
afterAll(async () => {
  await f.cleanup();
});

const get = async (qs: string) => {
  const res = await pm.get(`/api/insights?projectId=${f.project.id}${qs}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return json<InsightsDto>(res);
};

describe("Insights API", () => {
  it("requires sign in and validates the window", async () => {
    expect((await anon.get("/api/insights")).status).toBe(401);
    expect((await pm.get("/api/insights?weeks=2")).status).toBe(400);
    expect((await pm.get("/api/insights?weeks=99")).status).toBe(400);
  });

  it("returns weekly throughput with empty weeks as zero and the current week marked partial", async () => {
    const d = await get("&weeks=6");
    expect(d.throughput).toHaveLength(7);
    expect(d.throughput.at(-1)?.partial).toBe(true);
    expect(d.throughput.filter((w) => w.partial)).toHaveLength(1);
    const count = (daysAgo: number) =>
      d.throughput.find((w) => w.weekStart === weekOf(daysAgo))?.count;
    expect(count(7)).toBe(2);
    expect(count(14)).toBe(3);
    expect(count(21)).toBe(1);
    expect(count(28)).toBe(0);
    expect(count(35)).toBe(2);
    // Mean of the 6 complete weeks: (2 + 3 + 1 + 0 + 2 + 0) / 6 = 1.3.
    expect(d.throughputAverage).toBe(1.3);
  });

  it("computes cycle time percentiles from started and completed times", async () => {
    const d = await get("&weeks=6");
    expect(d.cycleTime.sample).toBe(8);
    expect(d.cycleTime.p50).toBe(2);
    expect(d.cycleTime.p95).toBe(2);
    expect(d.cycleTime.average).toBe(2);
  });

  it("reports WIP, blocked count and the oldest work in progress", async () => {
    const d = await get("&weeks=6");
    expect(d.wip).toEqual({ current: 2, inProgress: 1, inReview: 1, blocked: 1 });
    expect(d.aging[0]?.title).toBe("Old and running");
    expect(d.aging[0]?.ageDays).toBeGreaterThanOrEqual(10);
    expect(d.aging.map((a) => a.title)).not.toContain("Not started");
  });

  it("splits completed work by type", async () => {
    const d = await get("&weeks=6");
    const defect = d.flowDistribution.find((x) => x.workType === "defect");
    const feature = d.flowDistribution.find((x) => x.workType === "feature");
    expect(defect?.count).toBe(1);
    expect(feature?.count).toBe(7);
    expect(d.flowDistribution.reduce((a, b) => a + b.share, 0)).toBeCloseTo(100, 0);
  });

  it("forecasts the open items from complete weeks only", async () => {
    const d = await get("&weeks=6");
    expect(d.forecast.remaining).toBe(3);
    expect(d.forecast.samples).toHaveLength(6);
    expect(d.forecast.note).toBeNull();
    const w = d.forecast.weeksToFinish;
    expect(w && w.p50 >= 1 && w.p50 <= w.p85 && w.p85 <= w.p95).toBe(true);
    expect(d.forecast.itemsDone.map((h) => h.weeks)).toEqual([2, 4, 8]);
    // Same inputs, same forecast.
    expect((await get("&weeks=6")).forecast).toEqual(d.forecast);
  });

  it("scopes to a subproject and explains an empty history", async () => {
    const d = await get(`&weeks=6&subprojectId=${f.subB.id}`);
    expect(d.throughput.every((w) => w.count === 0)).toBe(true);
    expect(d.cycleTime.sample).toBe(0);
    expect(d.cycleTime.p50).toBeNull();
    expect(d.forecast.weeksToFinish).toBeNull();
    expect(d.forecast.note).toMatch(/nothing was completed/i);
  });
});
