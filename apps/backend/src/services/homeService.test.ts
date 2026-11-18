import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";
import { getHome } from "./homeService";

let f: Fixture;
// Wednesday 18 Nov 2026, noon in Manila. Week is Mon 16 to Sun 22, next week 23 to 29, month ends 30 Nov.
const NOW = new Date("2026-11-18T04:00:00Z");
const titles = (rows: Array<{ title: string }>) => rows.map((r) => r.title).sort();

beforeAll(async () => {
  f = await createFixture();
  const mk = (title: string, o: Parameters<typeof rawActivity>[2]) =>
    rawActivity(f.project.id, f.pm.id, { title, assigneeId: f.m1.id, ...o });
  const started = new Date("2026-11-01T00:00:00Z");
  await mk("monday", { dueDate: "2026-11-16", status: "in_progress", startedAt: started });
  await mk("sunday", { dueDate: "2026-11-22" });
  await mk("overdue", { dueDate: "2026-11-02" });
  await mk("next-monday", { dueDate: "2026-11-23" });
  await mk("month-end", { dueDate: "2026-11-30" });
  await mk("december", { dueDate: "2026-12-01" });
  await mk("no-date", {});
  await mk("done-this-week", {
    dueDate: "2026-11-17",
    status: "done",
    percentComplete: 100,
    startedAt: started,
    completedAt: new Date("2026-11-17T02:00:00Z"),
  });
  await mk("done-last-week", {
    dueDate: "2026-11-12",
    status: "done",
    percentComplete: 100,
    startedAt: started,
    completedAt: new Date("2026-11-12T02:00:00Z"),
  });
  // Completed Sunday 15 Nov at 23:30 Manila is last week even though it is Monday 16 in UTC-ahead zones.
  await mk("done-sunday-night", {
    dueDate: "2026-11-16",
    status: "done",
    percentComplete: 100,
    startedAt: started,
    completedAt: new Date("2026-11-15T15:30:00Z"),
  });
  await rawActivity(f.project.id, f.pm.id, {
    title: "someone-else",
    assigneeId: f.m2.id,
    dueDate: "2026-11-17",
  });
});
afterAll(async () => {
  await f.cleanup();
});

describe("getHome", () => {
  it("shows a team member only their own activities, bucketed Monday to Sunday", async () => {
    const home = await getHome(f.m1Actor, { now: NOW, timeZone: "Asia/Manila" });
    const mine = (rows: Array<{ title: string; projectId: string }>) =>
      rows.filter((r) => r.projectId === f.project.id);
    expect(titles(mine(home.thisWeek))).toEqual(["done-this-week", "monday", "overdue", "sunday"]);
    expect(titles(mine(home.nextWeek))).toEqual(["next-monday"]);
    expect(titles(mine(home.thisMonth))).toEqual(["month-end"]);
  });

  it("excludes no-due-date items, December items, and done items from other weeks", async () => {
    const home = await getHome(f.m1Actor, { now: NOW, timeZone: "Asia/Manila" });
    const all = [...home.thisWeek, ...home.nextWeek, ...home.thisMonth].map((r) => r.title);
    for (const hidden of [
      "no-date",
      "december",
      "done-last-week",
      "done-sunday-night",
      "someone-else",
    ]) {
      expect(all).not.toContain(hidden);
    }
  });

  it("flags overdue open items only", async () => {
    const home = await getHome(f.m1Actor, { now: NOW, timeZone: "Asia/Manila" });
    const row = (t: string) => home.thisWeek.find((r) => r.title === t);
    expect(row("overdue")?.isOverdue).toBe(true);
    expect(row("monday")?.isOverdue).toBe(true); // due 16 Nov, today is 18 Nov
    expect(row("sunday")?.isOverdue).toBe(false);
    expect(row("done-this-week")?.isOverdue).toBe(false);
  });

  it("lets a PM see other people's work and filter by assignee", async () => {
    // The unfiltered PM view is capped (see truncated), so assert on filtered views that cannot depend on
    // how much other data is in the shared development database.
    const all = await getHome(f.pmActor, { now: NOW, timeZone: "Asia/Manila" });
    expect(typeof all.truncated).toBe("boolean");
    const filtered = await getHome(f.pmActor, {
      now: NOW,
      timeZone: "Asia/Manila",
      assigneeId: f.m2.id,
    });
    expect(
      filtered.thisWeek.filter((r) => r.projectId === f.project.id).map((r) => r.title),
    ).toEqual(["someone-else"]);
  });
});
