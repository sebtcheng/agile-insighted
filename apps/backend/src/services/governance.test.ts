import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateActivityInput } from "@myapp/shared";
import { db } from "../db/client";
import {
  activities,
  activityEvents,
  gateOverrides,
  releases,
  sprintMemberCapacity,
  sprintScopeChanges,
  sprints,
} from "../db/schema";
import { AppError, pgErrorOf } from "../errors";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";
import * as activityService from "./activityService";
import * as gov from "./governanceService";

let f: Fixture;
beforeAll(async () => {
  f = await createFixture();
});
afterAll(async () => {
  await f.cleanup();
});

const base: CreateActivityInput = {
  title: "Task",
  status: "todo",
  priority: "medium",
  workType: "feature",
  track: "delivery",
  percentComplete: 0,
};

async function appError(promise: Promise<unknown>): Promise<AppError> {
  const err: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

const mk = (o: Partial<CreateActivityInput> = {}, actor = f.pmActor) =>
  activityService.create({ actor }, f.project.id, { ...base, ...o });

describe("Definition of Done gate", () => {
  let activityId: string;
  beforeAll(async () => {
    await gov.createTemplate(f.project.id, { kind: "done", label: "Code reviewed" });
    await gov.createTemplate(f.project.id, { kind: "done", label: "Tests passing" });
    await gov.createTemplate(f.project.id, { kind: "ready", label: "Has acceptance criteria" });
    activityId = (await mk({ assigneeId: f.m1.id, status: "in_review" })).activity.id;
  });

  it("blocks done until every active done item is checked, listing what is missing", async () => {
    const err = await appError(
      activityService.update({ actor: f.m1Actor }, activityId, { status: "done" }),
    );
    expect(err.status).toBe(422);
    expect(err.code).toBe("dod_incomplete");
    expect((err.details as { missing: string[] }).missing.sort()).toEqual([
      "Code reviewed",
      "Tests passing",
    ]);
  });

  it("ignores ready items and inactive done items", async () => {
    const items = await gov.getActivityChecklist(activityId);
    expect(items.map((i) => i.label).sort()).toEqual(["Code reviewed", "Tests passing"]);
  });

  it("lets a member tick only their own activity, then complete it", async () => {
    const items = await gov.getActivityChecklist(activityId);
    const other = (await mk({ assigneeId: f.m2.id })).activity.id;
    const first = items[0];
    if (!first) throw new Error("no checklist items");
    expect(
      (await appError(gov.setChecklistCheck(f.m1Actor, other, first.templateId, true))).status,
    ).toBe(403);

    for (const item of items)
      await gov.setChecklistCheck(f.m1Actor, activityId, item.templateId, true);
    const done = await activityService.update({ actor: f.m1Actor }, activityId, { status: "done" });
    expect(done.activity.status).toBe("done");
    expect(
      await db.select().from(gateOverrides).where(eq(gateOverrides.entityId, activityId)),
    ).toHaveLength(0);
  });

  it("lets a PM override with a reason, recording an override row and an event note", async () => {
    const id = (await mk({ status: "in_review" })).activity.id;
    expect(
      (await appError(activityService.update({ actor: f.pmActor }, id, { status: "done" }))).code,
    ).toBe("dod_incomplete");
    await activityService.update({ actor: f.pmActor }, id, {
      status: "done",
      overrideReason: "Shipped in hotfix, checks done offline",
    });
    const [override] = await db.select().from(gateOverrides).where(eq(gateOverrides.entityId, id));
    expect(override).toMatchObject({ gate: "dod", entityType: "activity", userId: f.pm.id });
    const events = await db.select().from(activityEvents).where(eq(activityEvents.activityId, id));
    expect(events.some((e) => e.note?.includes("Definition of Done overridden"))).toBe(true);
  });

  it("never lets a team member override", async () => {
    const id = (await mk({ assigneeId: f.m1.id, status: "in_review" })).activity.id;
    expect(
      (
        await appError(
          activityService.update({ actor: f.m1Actor }, id, {
            status: "done",
            overrideReason: "trust me",
          }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("one in, one out", () => {
  let active: typeof sprints.$inferSelect;
  let planning: typeof sprints.$inferSelect;
  let inSprint: string;
  beforeAll(async () => {
    const [a] = await db
      .update(sprints)
      .set({ status: "active" })
      .where(eq(sprints.id, f.sprint.id))
      .returning();
    const [p] = await db
      .insert(sprints)
      .values({
        projectId: f.project.id,
        name: "Planning",
        goal: "Next",
        startDate: "2026-02-01",
        endDate: "2026-02-14",
      })
      .returning();
    if (!a || !p) throw new Error("sprints missing");
    active = a;
    planning = p;
    // Put work in while the sprint is still unrestricted by switching rows directly.
    inSprint = (
      await rawActivity(f.project.id, f.pm.id, { sprintId: active.id, title: "Already in" })
    ).id;
  });

  it("rejects adding to an active sprint without a trade or override", async () => {
    const id = (await mk()).activity.id;
    const err = await appError(
      activityService.update({ actor: f.pmActor }, id, { sprintId: active.id }),
    );
    expect(err.status).toBe(409);
    expect(err.code).toBe("scope_change_required");
    const [row] = await db.select().from(activities).where(eq(activities.id, id));
    expect(row?.sprintId).toBeNull();
  });

  it("rejects creating directly into an active sprint without a trade", async () => {
    expect((await appError(mk({ sprintId: active.id }))).code).toBe("scope_change_required");
  });

  it("accepts a trade: logs the change and returns the removed item to the backlog with an event", async () => {
    const id = (await mk()).activity.id;
    await activityService.update({ actor: f.pmActor }, id, {
      sprintId: active.id,
      removeActivityId: inSprint,
      tradeReason: "Customer escalation outranks it",
    });
    const [removed] = await db.select().from(activities).where(eq(activities.id, inSprint));
    expect(removed?.sprintId).toBeNull();
    const changes = await db
      .select()
      .from(sprintScopeChanges)
      .where(eq(sprintScopeChanges.sprintId, active.id));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      addedActivityId: id,
      removedActivityId: inSprint,
      approvedById: f.pm.id,
    });
    const events = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.activityId, inSprint));
    expect(events.map((e) => e.eventType)).toContain("sprint_changed");
    // The added item also got its own sprint_changed event.
    const addedEvents = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.activityId, id));
    expect(addedEvents.map((e) => e.eventType)).toContain("sprint_changed");
    inSprint = id;
  });

  it("rejects a trade with a bad target: another sprint, itself, or no reason", async () => {
    const id = (await mk()).activity.id;
    const elsewhere = (await rawActivity(f.project.id, f.pm.id, { sprintId: planning.id })).id;
    expect(
      (
        await appError(
          activityService.update({ actor: f.pmActor }, id, {
            sprintId: active.id,
            removeActivityId: elsewhere,
            tradeReason: "x",
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await appError(
          activityService.update({ actor: f.pmActor }, id, {
            sprintId: active.id,
            removeActivityId: id,
            tradeReason: "x",
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await appError(
          activityService.update({ actor: f.pmActor }, id, {
            sprintId: active.id,
            removeActivityId: inSprint,
          }),
        )
      ).status,
    ).toBe(422);
  });

  it("accepts a PM override with a reason and records it", async () => {
    const id = (await mk()).activity.id;
    await activityService.update({ actor: f.pmActor }, id, {
      sprintId: active.id,
      overrideReason: "Exec request",
    });
    const [override] = await db.select().from(gateOverrides).where(eq(gateOverrides.entityId, id));
    expect(override).toMatchObject({ gate: "scope_change", userId: f.pm.id });
  });

  it("does not restrict planning sprints", async () => {
    const id = (await mk()).activity.id;
    const res = await activityService.update({ actor: f.pmActor }, id, { sprintId: planning.id });
    expect(res.activity.sprintId).toBe(planning.id);
  });

  it("does not let a team member move work into a sprint at all", async () => {
    const id = (await mk({ assigneeId: f.m1.id })).activity.id;
    expect(
      (await appError(activityService.update({ actor: f.m1Actor }, id, { sprintId: planning.id })))
        .status,
    ).toBe(403);
  });
});

describe("dependencies", () => {
  it("rejects self-dependency and cycles", async () => {
    const [a, b, c] = await Promise.all([mk(), mk(), mk()]).then((r) =>
      r.map((x) => x.activity.id),
    );
    if (!a || !b || !c) throw new Error("ids");
    expect((await appError(gov.addDependency(f.pmActor, a, a))).status).toBe(422);
    await gov.addDependency(f.pmActor, a, b); // a waits on b
    await gov.addDependency(f.pmActor, b, c); // b waits on c
    const cycle = await appError(gov.addDependency(f.pmActor, c, a)); // c waits on a would close the loop
    expect(cycle.status).toBe(422);
    expect(cycle.message).toMatch(/cycle/);
    // Two-node loop too.
    expect((await appError(gov.addDependency(f.pmActor, b, a))).message).toMatch(/cycle/);
  });

  it("derives waiting-on-dependency from unfinished blockers, without storing it", async () => {
    const a = (await mk()).activity.id;
    const b = (await mk()).activity.id;
    await gov.addDependency(f.pmActor, a, b);
    expect((await activityService.toDto(db, a)).waitingOnDependency).toBe(true);
    expect((await activityService.toDto(db, b)).waitingOnDependency).toBe(false);
    await activityService.update({ actor: f.pmActor }, b, {
      status: "done",
      overrideReason: "n/a",
    });
    expect((await activityService.toDto(db, a)).waitingOnDependency).toBe(false);
  });

  it("limits team members to activities assigned to them, and keeps dependencies in one project", async () => {
    const mine = (await mk({ assigneeId: f.m1.id })).activity.id;
    const theirs = (await mk({ assigneeId: f.m2.id })).activity.id;
    const unassigned = (await mk()).activity.id;
    expect((await appError(gov.addDependency(f.m1Actor, unassigned, theirs))).status).toBe(403);
    await gov.addDependency(f.m1Actor, mine, theirs); // assigned to one end: allowed
    await gov.removeDependency(f.m1Actor, mine, theirs);
    const foreign = (await rawActivity(f.otherProject.id, f.pm.id)).id;
    expect((await appError(gov.addDependency(f.pmActor, unassigned, foreign))).status).toBe(422);
  });
});

describe("releases and capacity", () => {
  it("keeps exactly one MVP release per project by moving the flag", async () => {
    const r1 = await gov.createRelease(f.project.id, { name: "v1.0 MVP", isMvp: true });
    const r2 = await gov.createRelease(f.project.id, { name: "v1.1", isMvp: false });
    await gov.updateRelease(r2.id, { isMvp: true });
    const rows = await gov.listReleases(f.project.id);
    expect(rows.filter((r) => r.isMvp).map((r) => r.id)).toEqual([r2.id]);
    expect(rows.find((r) => r.id === r1.id)?.isMvp).toBe(false);
  });

  it("nulls release_id on activities when a release is deleted, keeping project_id", async () => {
    const rel = await gov.createRelease(f.project.id, { name: "Temp", isMvp: false });
    const act = await mk({ releaseId: rel.id });
    expect(act.activity.releaseId).toBe(rel.id);
    await gov.deleteRelease(rel.id);
    const [row] = await db.select().from(activities).where(eq(activities.id, act.activity.id));
    expect(row?.releaseId).toBeNull();
    expect(row?.projectId).toBe(f.project.id);
  });

  it("reports per-member capacity against assigned open items", async () => {
    await mk({
      assigneeId: f.m1.id,
      sprintId: f.sprint.id,
      status: "todo",
      overrideReason: "capacity test",
    });
    const cap = await gov.setSprintCapacity(f.sprint.id, [
      { userId: f.m1.id, capacityItems: 0 },
      { userId: f.m2.id, capacityItems: 5 },
    ]);
    const m1 = cap.members.find((m) => m.userId === f.m1.id);
    expect(m1?.overCapacity).toBe(true);
    expect(cap.members.find((m) => m.userId === f.m2.id)?.overCapacity).toBe(false);
  });
});

describe("database-level rules (Phase 2)", () => {
  async function rejectedBy(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (err) {
      return pgErrorOf(err)?.constraint;
    }
    throw new Error("Expected the database to reject this write");
  }

  it("rejects a second MVP release", async () => {
    await db.update(releases).set({ isMvp: false }).where(eq(releases.projectId, f.project.id));
    await db.insert(releases).values({ projectId: f.project.id, name: "MVP-A", isMvp: true });
    expect(
      await rejectedBy(
        db.insert(releases).values({ projectId: f.project.id, name: "MVP-B", isMvp: true }),
      ),
    ).toBe("releases_one_mvp_per_project");
  });

  it("rejects a release from another project on an activity", async () => {
    const [foreign] = await db
      .insert(releases)
      .values({ projectId: f.otherProject.id, name: "Other release" })
      .returning();
    if (!foreign) throw new Error("release missing");
    expect(await rejectedBy(rawActivity(f.project.id, f.pm.id, { releaseId: foreign.id }))).toBe(
      "activities_project_release_fk",
    );
  });

  it("rejects negative capacity", async () => {
    expect(
      await rejectedBy(
        db
          .insert(sprintMemberCapacity)
          .values({ sprintId: f.sprint.id, userId: f.pm.id, capacityItems: -1 }),
      ),
    ).toBe("sprint_member_capacity_nonneg");
  });

  it("rejects an empty override reason", async () => {
    expect(
      await rejectedBy(
        db.insert(gateOverrides).values({
          gate: "dod",
          entityType: "activity",
          entityId: f.project.id,
          reason: "   ",
          userId: f.pm.id,
        }),
      ),
    ).toBe("gate_overrides_reason_not_empty");
  });
});
