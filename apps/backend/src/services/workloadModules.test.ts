import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAssignee, type WorkItem } from "@myapp/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { kanoRequestSpecs, raidMitigatingActions } from "../db/schema";
import { createFixture, type Fixture } from "../test/helpers";
import { getHome } from "./homeService";
import { setKanoSpecCompleted } from "./kanoService";
import { updateSolution } from "./ostService";
import { setMitigatingActionCompleted } from "./raidService";
import * as m from "./moduleService";
import { memberRollups } from "./workItemRollups";
import * as usm from "./usmService";
import { getWorkload } from "./workloadService";

// Wednesday 18 Nov 2026 in Manila. Week is Mon 16 to Sun 22.
const NOW = new Date("2026-11-18T04:00:00Z");
let f: Fixture;

beforeAll(async () => {
  f = await createFixture();
  // Everything lives in the second project.
  const k = { projectId: f.otherProject.id, createdById: f.pm.id };

  const outcome = await m.createOutcome({ ...k, title: "Outcome" });
  const opp = await m.createOpportunity({ ...k, outcomeId: outcome.id, title: "Opportunity" });
  await m.createSolution({
    ...k,
    opportunityId: opp.id,
    title: "OST solution",
    ownerId: f.m1.id,
    targetDate: "2026-11-20",
  });
  // One unowned solution so there is something for the Unassigned bucket.
  await m.createSolution({
    ...k,
    opportunityId: opp.id,
    title: "OST orphan",
    targetDate: "2026-11-25",
  });

  const req = await m.createKanoRequest({ ...k, revisionRequest: "Revise the form" });
  await db.insert(kanoRequestSpecs).values({
    kanoRequestId: req.id,
    label: "Kano spec",
    responsibleId: f.m1.id,
    targetDate: "2026-11-02",
  });

  const raid = await m.createRaidItem({ ...k, itemType: "risk", description: "Risk", impact: 2 });
  await db.insert(raidMitigatingActions).values({
    raidItemId: raid.id,
    description: "RAID action",
    responsibleId: f.m1.id,
    targetDate: "2026-11-19",
    isCompleted: true,
    completedAt: new Date("2026-11-17T02:00:00Z"),
  });

  const persona = await usm.createPersona(f.pmActor, {
    projectId: f.otherProject.id,
    name: "Teacher",
  });
  const step = await usm.createStep(f.pmActor, {
    projectId: f.otherProject.id,
    personaId: persona.id,
    title: "Sign in",
  });
  await usm.createFeature({
    projectId: f.otherProject.id,
    stepId: step.id,
    title: "USM feature",
    responsibleId: f.m1.id,
    targetDate: "2026-11-21",
  });
});
afterAll(async () => {
  await f.cleanup();
});

const row = async () => {
  const res = await getWorkload({ now: NOW });
  const person = res.items.find((r) => r.userId === f.m1.id);
  const member = res.members.find((r) => r.userId === f.m1.id);
  return { res, person, member };
};

describe("workload across modules", () => {
  it("counts OST, USM, Kano and RAID items", async () => {
    const { person, member } = await row();
    expect(member).toMatchObject({ total: 4, delayed: 1, completed: 1, ongoing: 2 });
    expect(member?.byModule).toMatchObject({ ost: 1, kano: 1, user_story: 1, raid: 1 });
    expect(person?.dueThisWeek).toBe(3); // like Home: OST (Fri 20), USM (Sat 21) and the overdue Kano spec
  });

  it("exposes only the person and due-this-week fields, with counts across every project", async () => {
    const { person, member } = await row();
    expect(Object.keys(person ?? {}).sort()).toEqual(["dueThisWeek", "fullName", "userId"]);
    expect(member?.total).toBe(4);
  });

  it("lists every assigned item with its module for the expandable row", async () => {
    const { member } = await row();
    expect(member?.items.map((i) => i.sourceModule).sort()).toEqual([
      "kano",
      "ost",
      "raid",
      "user_story",
    ]);
    expect(member?.items.every((i) => i.title && i.scheduleStatus)).toBe(true);
  });

  it("reconciles with the Home totals for the same projects", async () => {
    const scope = [f.project.id, f.otherProject.id];
    const home = await getHome(f.pmActor, { now: NOW }, scope);
    const { members } = await getWorkload({ now: NOW, scope });
    const sum = (pick: (r: (typeof members)[number]) => number) =>
      members.reduce((n, r) => n + pick(r), 0);
    expect(sum((r) => r.total)).toBe(home.summary.total);
    expect(sum((r) => r.completed)).toBe(home.summary.completed);
    expect(sum((r) => r.ongoing)).toBe(home.summary.ongoing);
    expect(sum((r) => r.onTime)).toBe(home.summary.onTime);
    expect(sum((r) => r.delayed)).toBe(home.summary.delayed);
    expect(members.find((r) => r.userId === null)?.total).toBe(1); // the unowned solution
  });
});

describe("completion toggles from Home, Workload and Projects use each module's own rules", () => {
  const find = (items: WorkItem[], module: WorkItem["sourceModule"]) =>
    items.find(
      (i) => i.sourceModule === module && i.itemKind === (module === "ost" ? "activity" : "step"),
    );

  it("exposes the identifiers each module toggle needs", async () => {
    const { member } = await row();
    const items = member?.items ?? [];
    expect(find(items, "kano")?.parentId).toBeTruthy();
    expect(find(items, "raid")?.parentId).toBeTruthy();
    expect(find(items, "user_story")?.parentId).toBeTruthy();
    expect(find(items, "ost")?.parentId).toBeTruthy();
  });

  it("persists is_completed and completed_at exactly like ticking inside Kano, RAID, OST and USM", async () => {
    const before = await row();
    const items = before.member?.items ?? [];
    const kano = find(items, "kano")!;
    const raid = find(items, "raid")!;
    const ost = find(items, "ost")!;
    const story = find(items, "user_story")!;
    const completedBefore = before.member?.completed ?? 0;

    // Tick the open ones through the module services (the endpoints the checkbox calls).
    await setKanoSpecCompleted(kano.parentId!, kano.id, true);
    await updateSolution(ost.id, { validationStatus: "validated" });
    await usm.updateFeature(story.id, { isCompleted: true });
    // Untick the completed RAID action.
    await setMitigatingActionCompleted(raid.parentId!, raid.id, false);

    const [spec] = await db.select().from(kanoRequestSpecs).where(eq(kanoRequestSpecs.id, kano.id));
    expect(spec?.isCompleted).toBe(true);
    expect(spec?.completedAt).toBeInstanceOf(Date);
    const [act] = await db
      .select()
      .from(raidMitigatingActions)
      .where(eq(raidMitigatingActions.id, raid.id));
    expect(act?.isCompleted).toBe(false);
    expect(act?.completedAt).toBeNull();

    const after = await row();
    const byId = new Map((after.member?.items ?? []).map((i) => [i.id, i]));
    expect(byId.get(kano.id)).toMatchObject({ isCompleted: true });
    expect(byId.get(kano.id)?.completedAt).toBeTruthy();
    expect(byId.get(ost.id)).toMatchObject({ isCompleted: true });
    expect(byId.get(story.id)).toMatchObject({ isCompleted: true });
    expect(byId.get(raid.id)).toMatchObject({ isCompleted: false, completedAt: null });
    // 3 newly completed, 1 reopened: Workload and Home counts follow.
    expect(after.member?.completed).toBe(completedBefore + 2);
    const home = await getHome(f.pmActor, { now: NOW }, [f.project.id, f.otherProject.id]);
    expect(home.summary.completed).toBeGreaterThanOrEqual(after.member?.completed ?? 0);

    // Restore the fixture state for later tests.
    await setKanoSpecCompleted(kano.parentId!, kano.id, false);
    await updateSolution(ost.id, { validationStatus: "planned" });
    await usm.updateFeature(story.id, { isCompleted: false });
    await setMitigatingActionCompleted(raid.parentId!, raid.id, true);
  });
});

describe("assignee resolution", () => {
  const people = [
    { id: "11111111-1111-4111-8111-111111111111", fullName: "Klein Reyes", email: "klein@x.test" },
    { id: "22222222-2222-4222-8222-222222222222", fullName: "Clea Santos", email: "clea@x.test" },
  ];
  it("matches id, full name, first name and email, trimmed and case-insensitive", () => {
    const [klein, clea] = people;
    expect(resolveAssignee(klein!.id, people)).toBe(klein);
    expect(resolveAssignee("  KLEIN  ", people)).toBe(klein);
    expect(resolveAssignee("clea santos", people)).toBe(clea);
    expect(resolveAssignee("Clea@X.test", people)).toBe(clea);
    expect(resolveAssignee("", people)).toBeNull();
    expect(resolveAssignee("Nobody", people)).toBeNull();
    expect(resolveAssignee(null, people)).toBeNull();
  });
  it("lets an exact id win over a name that happens to match another person", () => {
    const tricky = [
      { id: "aaaa", fullName: "Bob", email: null },
      { id: "bbbb", fullName: "aaaa", email: null },
    ];
    expect(resolveAssignee("aaaa", tricky)?.id).toBe("aaaa");
  });
  it("routes display-name assignees to the right row and unknown ones to Unassigned", () => {
    const item = (
      id: string,
      assigneeId: string | null,
      assigneeName: string | null,
    ): WorkItem => ({
      id,
      sourceModule: "kano",
      itemKind: "step",
      title: id,
      parentTitle: null,
      projectId: "p",
      subprojectId: null,
      assigneeId,
      assigneeName,
      dueDate: null,
      isCompleted: false,
      completedAt: null,
      scheduleStatus: "no_due_date",
    });
    const rows = memberRollups(
      [
        item("a", null, "Klein"),
        item("b", "clea@x.test", null),
        item("c", null, null),
        item("d", null, "Ghost"),
      ],
      people,
    );
    expect(rows.find((r) => r.userId === people[0]!.id)?.total).toBe(1);
    expect(rows.find((r) => r.userId === people[1]!.id)?.total).toBe(1);
    expect(rows.find((r) => r.userId === null)?.total).toBe(2);
  });
});
