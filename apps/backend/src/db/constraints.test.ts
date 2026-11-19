import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgErrorOf } from "../errors";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";
import { db } from "./client";
import { activities, projects, sprints } from "./schema";

let f: Fixture;
beforeAll(async () => {
  f = await createFixture();
});
afterAll(async () => {
  await f.cleanup();
});

/** Asserts that the database itself (not the service layer) rejected the write, and names the constraint. */
async function rejectedBy(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    const pg = pgErrorOf(err);
    expect(pg, "expected a PostgreSQL error").not.toBeNull();
    return pg?.constraint;
  }
  throw new Error("Expected the database to reject this write, but it succeeded");
}

describe("database-level rules", () => {
  it("rejects a subproject from another project", async () => {
    const c = await rejectedBy(rawActivity(f.project.id, f.pm.id, { subprojectId: f.otherSub.id }));
    expect(c).toBe("activities_project_subproject_fk");
  });

  it("rejects a sprint from another project", async () => {
    const c = await rejectedBy(rawActivity(f.project.id, f.pm.id, { sprintId: f.otherSprint.id }));
    expect(c).toBe("activities_project_sprint_fk");
  });

  it("rejects a sprint scoped to a subproject of another project", async () => {
    const c = await rejectedBy(
      db.insert(sprints).values({
        projectId: f.project.id,
        subprojectId: f.otherSub.id,
        name: "Bad scope",
        startDate: "2026-02-01",
        endDate: "2026-02-14",
      }),
    );
    expect(c).toBe("sprints_project_subproject_fk");
  });

  it("rejects done with percent below 100", async () => {
    const c = await rejectedBy(
      rawActivity(f.project.id, f.pm.id, {
        status: "done",
        percentComplete: 90,
        startedAt: new Date(),
        completedAt: new Date(),
      }),
    );
    expect(c).toBe("activities_done_is_100");
  });

  it("rejects percent outside 0 to 100", async () => {
    expect(await rejectedBy(rawActivity(f.project.id, f.pm.id, { percentComplete: 101 }))).toBe(
      "activities_percent_range",
    );
    expect(await rejectedBy(rawActivity(f.project.id, f.pm.id, { percentComplete: -1 }))).toBe(
      "activities_percent_range",
    );
  });

  it("rejects blocked without a reason", async () => {
    expect(await rejectedBy(rawActivity(f.project.id, f.pm.id, { isBlocked: true }))).toBe(
      "activities_blocked_has_reason",
    );
  });

  it("rejects done without completed_at and leaving todo without started_at", async () => {
    expect(
      await rejectedBy(
        rawActivity(f.project.id, f.pm.id, {
          status: "done",
          percentComplete: 100,
          startedAt: new Date(),
        }),
      ),
    ).toBe("activities_done_has_completed_at");
    expect(await rejectedBy(rawActivity(f.project.id, f.pm.id, { status: "in_progress" }))).toBe(
      "activities_started_after_todo",
    );
  });

  it("allows only one active sprint per scope, but one per subproject scope too", async () => {
    await db.update(sprints).set({ status: "active" }).where(eq(sprints.id, f.sprint.id));
    const second = await rejectedBy(
      db.insert(sprints).values({
        projectId: f.project.id,
        name: "S2",
        goal: "Another",
        startDate: "2026-02-01",
        endDate: "2026-02-14",
        status: "active",
      }),
    );
    expect(second).toBe("sprints_one_active_per_scope");

    // A different scope (a subproject) may have its own active sprint.
    await db.insert(sprints).values({
      projectId: f.project.id,
      subprojectId: f.subA.id,
      name: "S-sub",
      goal: "Scoped",
      startDate: "2026-02-01",
      endDate: "2026-02-14",
      status: "active",
    });
  });

  it("rejects project codes that differ only by case", async () => {
    const c = await rejectedBy(
      db
        .insert(projects)
        .values({ name: "Dup", code: f.project.code.toLowerCase(), ownerId: f.pm.id }),
    );
    expect(c).toBe("projects_code_lower_uq");
  });

  it("rejects a sprint ending before it starts", async () => {
    expect(
      await rejectedBy(
        db.insert(sprints).values({
          projectId: f.project.id,
          name: "Backwards",
          startDate: "2026-03-10",
          endDate: "2026-03-01",
        }),
      ),
    ).toBe("sprints_dates_ordered");
  });

  it("nulls only the subproject column when a subproject is deleted", async () => {
    const act = await rawActivity(f.project.id, f.pm.id, { subprojectId: f.subB.id });
    await db.execute(sql`DELETE FROM subprojects WHERE id = ${f.subB.id}`);
    const [after] = await db.select().from(activities).where(eq(activities.id, act.id));
    expect(after?.subprojectId).toBeNull();
    expect(after?.projectId).toBe(f.project.id);
  });

  it("maintains updated_at by trigger", async () => {
    const act = await rawActivity(f.project.id, f.pm.id);
    await db.execute(sql`SELECT pg_sleep(0.05)`);
    await db.update(activities).set({ title: "Renamed" }).where(eq(activities.id, act.id));
    const [after] = await db.select().from(activities).where(eq(activities.id, act.id));
    expect(after && after.updatedAt.getTime() > act.updatedAt.getTime()).toBe(true);
  });
});
