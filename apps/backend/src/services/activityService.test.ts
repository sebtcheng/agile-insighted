import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import { activities, activityEvents, projects, subprojects } from "../db/schema";
import { AppError } from "../errors";
import { createFixture, setProjectArchived, type Fixture } from "../test/helpers";
import * as activityService from "./activityService";
import { updateSprint } from "./projectService";

let f: Fixture;
beforeAll(async () => {
  f = await createFixture();
});
afterAll(async () => {
  await f.cleanup();
});

const base = {
  title: "Task",
  status: "todo" as const,
  priority: "medium" as const,
  workType: "feature" as const,
  track: "delivery" as const,
  percentComplete: 0,
};

async function eventsOf(id: string) {
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.activityId, id))
    .orderBy(activityEvents.occurredAt, activityEvents.id);
}

async function expectAppError(promise: Promise<unknown>, status: number) {
  const err: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
}

describe("activityService timestamps", () => {
  it("sets started_at on first leaving todo and keeps it afterwards", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, {
      ...base,
      assigneeId: f.m1.id,
    });
    expect(activity.startedAt).toBeNull();

    const t1 = new Date("2026-03-02T01:00:00Z");
    const a = await activityService.update({ actor: f.pmActor, now: t1 }, activity.id, {
      status: "in_progress",
    });
    expect(a.activity.startedAt).toBe(t1.toISOString());

    const t2 = new Date("2026-03-03T01:00:00Z");
    const b = await activityService.update({ actor: f.pmActor, now: t2 }, activity.id, {
      status: "in_review",
    });
    expect(b.activity.startedAt).toBe(t1.toISOString());
  });

  it("sets completed_at and 100% on done, and clears completed_at when reopened", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, base);
    const t = new Date("2026-03-04T01:00:00Z");
    const done = await activityService.update({ actor: f.pmActor, now: t }, activity.id, {
      status: "done",
    });
    expect(done.activity.completedAt).toBe(t.toISOString());
    expect(done.activity.percentComplete).toBe(100);
    expect(done.activity.startedAt).not.toBeNull();

    const reopened = await activityService.update({ actor: f.pmActor }, activity.id, {
      status: "in_progress",
      percentComplete: 60,
    });
    expect(reopened.activity.completedAt).toBeNull();
    expect(reopened.activity.percentComplete).toBe(60);
  });
});

describe("activityService events", () => {
  it("writes one event per changed tracked field, in the same call", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, base);
    await activityService.update({ actor: f.pmActor }, activity.id, {
      status: "in_progress",
      assigneeId: f.m1.id,
      sprintId: f.sprint.id,
      isBlocked: true,
      blockedReason: "Waiting",
    });
    const types = (await eventsOf(activity.id)).map((e) => e.eventType).sort();
    expect(types).toEqual(["assigned", "blocked", "sprint_changed", "status_changed"]);

    await activityService.update({ actor: f.pmActor }, activity.id, { isBlocked: false });
    expect((await eventsOf(activity.id)).map((e) => e.eventType)).toContain("unblocked");
  });

  it("writes no events for untracked edits", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, base);
    await activityService.update({ actor: f.pmActor }, activity.id, {
      title: "New title",
      priority: "high",
    });
    expect(await eventsOf(activity.id)).toHaveLength(0);
  });

  it("rolls back the activity change when the event write cannot happen (same transaction)", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, base);
    await expect(
      db.transaction(async (tx) => {
        await activityService.update(
          { actor: f.pmActor },
          activity.id,
          { status: "in_progress" },
          tx,
        );
        throw new Error("abort after service call");
      }),
    ).rejects.toThrow("abort after service call");
    const [row] = await db.select().from(activities).where(eq(activities.id, activity.id));
    expect(row?.status).toBe("todo");
    expect(await eventsOf(activity.id)).toHaveLength(0);
  });
});

describe("activityService rules", () => {
  it("requires a reason when blocking", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, base);
    await expectAppError(
      activityService.update({ actor: f.pmActor }, activity.id, { isBlocked: true }),
      422,
    );
    await expectAppError(
      activityService.update({ actor: f.pmActor }, activity.id, {
        isBlocked: true,
        blockedReason: "   ",
      }),
      422,
    );
  });

  it("clears the blocked reason when unblocking", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, base);
    await activityService.update({ actor: f.pmActor }, activity.id, {
      isBlocked: true,
      blockedReason: "Vendor",
    });
    const res = await activityService.update({ actor: f.pmActor }, activity.id, {
      isBlocked: false,
    });
    expect(res.activity.blockedReason).toBeNull();
  });

  it("rejects a subproject or sprint from another project", async () => {
    await expectAppError(
      activityService.create({ actor: f.pmActor }, f.project.id, {
        ...base,
        subprojectId: f.otherSub.id,
      }),
      422,
    );
    await expectAppError(
      activityService.create({ actor: f.pmActor }, f.project.id, {
        ...base,
        sprintId: f.otherSprint.id,
      }),
      422,
    );
  });

  it("makes archived projects and subprojects read-only", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, {
      ...base,
      subprojectId: f.subA.id,
    });

    await db
      .update(subprojects)
      .set({ archivedAt: new Date() })
      .where(eq(subprojects.id, f.subA.id));
    await expectAppError(
      activityService.update({ actor: f.pmActor }, activity.id, { status: "in_progress" }),
      409,
    );
    await expectAppError(
      activityService.create({ actor: f.pmActor }, f.project.id, {
        ...base,
        subprojectId: f.subA.id,
      }),
      409,
    );
    await db.update(subprojects).set({ archivedAt: null }).where(eq(subprojects.id, f.subA.id));

    await setProjectArchived(f.project.id, true);
    await expectAppError(
      activityService.update({ actor: f.pmActor }, activity.id, { status: "in_progress" }),
      409,
    );
    await expectAppError(activityService.create({ actor: f.pmActor }, f.project.id, base), 409);
    await setProjectArchived(f.project.id, false);
  });

  it("warns, but does not block, when moving past the WIP limit", async () => {
    await db.update(projects).set({ wipLimitPerPerson: 1 }).where(eq(projects.id, f.project.id));
    const first = await activityService.create({ actor: f.pmActor }, f.project.id, {
      ...base,
      assigneeId: f.m2.id,
    });
    const second = await activityService.create({ actor: f.pmActor }, f.project.id, {
      ...base,
      assigneeId: f.m2.id,
    });
    const r1 = await activityService.update({ actor: f.pmActor }, first.activity.id, {
      status: "in_progress",
    });
    expect(r1.warnings).toHaveLength(0);
    const r2 = await activityService.update({ actor: f.pmActor }, second.activity.id, {
      status: "in_progress",
    });
    expect(r2.activity.status).toBe("in_progress");
    expect(r2.warnings[0]).toMatch(/WIP limit/);
    await db.update(projects).set({ wipLimitPerPerson: 3 }).where(eq(projects.id, f.project.id));
  });

  it("lets a team member change only their own progress and blocker fields", async () => {
    const { activity } = await activityService.create({ actor: f.pmActor }, f.project.id, {
      ...base,
      assigneeId: f.m1.id,
    });
    const ok = await activityService.update({ actor: f.m1Actor }, activity.id, {
      status: "in_progress",
      percentComplete: 40,
    });
    expect(ok.activity.percentComplete).toBe(40);
    await expectAppError(
      activityService.update({ actor: f.m1Actor }, activity.id, { title: "Hijack" }),
      403,
    );
    await expectAppError(
      activityService.update({ actor: f.m1Actor }, activity.id, { assigneeId: f.m2.id }),
      403,
    );
    await expectAppError(
      activityService.update({ actor: f.m2Actor }, activity.id, { status: "done" }),
      403,
    );
    await expectAppError(activityService.create({ actor: f.m1Actor }, f.project.id, base), 403);
  });
});

describe("sprint goal rule", () => {
  it("does not let a sprint become active without a goal", async () => {
    // Clear the goal directly so the rule is tested on the service path.
    await db.execute(sql`UPDATE sprints SET goal = NULL WHERE id = ${f.sprint.id}`);
    await expectAppError(updateSprint(f.sprint.id, { status: "active" }), 422);
    await expectAppError(updateSprint(f.sprint.id, { status: "active", goal: "   " }), 422);
    const ok = await updateSprint(f.sprint.id, { status: "active", goal: "Ship it" });
    expect(ok.status).toBe("active");
  });
});
