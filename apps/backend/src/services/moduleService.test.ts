import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import {
  checklistChecks,
  checklistTemplates,
  journeySteps,
  kanoRequests,
  ostAssumptions,
  ostOpportunities,
  ostOutcomes,
  ostSolutions,
  personas,
  raidItems,
  releases,
  userStories,
} from "../db/schema";
import { pgErrorOf } from "../errors";
import { createFixture, rawActivity, type Fixture } from "../test/helpers";
import * as m from "./moduleService";

let f: Fixture;
let k: { projectId: string; createdById: string };
let storyId: string;
let foreignRelease: string;
let templateId: string;
let activityId: string;

beforeAll(async () => {
  f = await createFixture();
  k = { projectId: f.project.id, createdById: f.pm.id };
  const story = await m.createStory({
    ...k,
    subprojectId: f.subA.id,
    story: "As a teacher, I want x so that y",
  });
  storyId = story.id;
  const [rel] = await db
    .insert(releases)
    .values({ projectId: f.otherProject.id, name: "Foreign" })
    .returning();
  if (!rel) throw new Error("release");
  foreignRelease = rel.id;
  const [tpl] = await db
    .insert(checklistTemplates)
    .values({ projectId: f.project.id, kind: "done", label: "Reviewed" })
    .returning();
  if (!tpl) throw new Error("template");
  templateId = tpl.id;
  activityId = (await rawActivity(f.project.id, f.pm.id)).id;
});
afterAll(async () => {
  await f.cleanup();
});

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

let seqCounter = 50_000;
const nextRaw = () => (seqCounter += 1);

describe("OST constraints", () => {
  it("rejects a second targeted opportunity per outcome", async () => {
    const outcome = await m.createOutcome({ ...k, title: "Reduce dropouts" });
    const base = {
      projectId: f.project.id,
      createdById: f.pm.id,
      outcomeId: outcome.id,
      isTargeted: true,
    };
    await db.insert(ostOpportunities).values({ ...base, title: "First" });
    expect(await rejectedBy(db.insert(ostOpportunities).values({ ...base, title: "Second" }))).toBe(
      "ost_opportunities_one_targeted_per_outcome",
    );
    // A different outcome may have its own targeted opportunity.
    const other = await m.createOutcome({ ...k, title: "Other outcome" });
    await db.insert(ostOpportunities).values({ ...base, outcomeId: other.id, title: "Elsewhere" });
  });

  it("rejects a second riskiest assumption per solution", async () => {
    const outcome = await m.createOutcome({ ...k, title: "O" });
    const opp = await m.createOpportunity({ ...k, outcomeId: outcome.id, title: "Opp" });
    const sol = await m.createSolution({ ...k, opportunityId: opp.id, title: "Sol" });
    const base = {
      ...k,
      solutionId: sol.id,
      statement: "s",
      category: "desirability" as const,
      isRiskiest: true,
    };
    await db.insert(ostAssumptions).values(base);
    expect(await rejectedBy(db.insert(ostAssumptions).values(base))).toBe(
      "ost_assumptions_one_riskiest_per_solution",
    );
  });
});

describe("cross-project references are rejected on every module table", () => {
  const p = () => ({ projectId: f.project.id, createdById: f.pm.id });

  it("ost_outcomes, personas, journey_steps, raid_items: subproject", async () => {
    expect(
      await rejectedBy(
        db.insert(ostOutcomes).values({ ...p(), title: "t", subprojectId: f.otherSub.id }),
      ),
    ).toBe("ost_outcomes_project_subproject_fk");
    expect(
      await rejectedBy(
        db.insert(personas).values({ ...p(), name: "x", subprojectId: f.otherSub.id }),
      ),
    ).toBe("personas_project_subproject_fk");
    expect(
      await rejectedBy(
        db.insert(journeySteps).values({ ...p(), name: "x", subprojectId: f.otherSub.id }),
      ),
    ).toBe("journey_steps_project_subproject_fk");
    expect(
      await rejectedBy(
        db.insert(raidItems).values({
          ...p(),
          raisedById: f.pm.id,
          seq: nextRaw(),
          itemType: "risk",
          description: "d",
          impact: 2,
          subprojectId: f.otherSub.id,
        }),
      ),
    ).toBe("raid_items_project_subproject_fk");
  });

  it("user_stories: subproject, sprint and release", async () => {
    const story = { ...p(), story: "s", subprojectId: f.subA.id };
    expect(
      await rejectedBy(
        db.insert(userStories).values({ ...story, seq: nextRaw(), subprojectId: f.otherSub.id }),
      ),
    ).toBe("user_stories_project_subproject_fk");
    expect(
      await rejectedBy(
        db.insert(userStories).values({ ...story, seq: nextRaw(), sprintId: f.otherSprint.id }),
      ),
    ).toBe("user_stories_project_sprint_fk");
    expect(
      await rejectedBy(
        db.insert(userStories).values({ ...story, seq: nextRaw(), releaseId: foreignRelease }),
      ),
    ).toBe("user_stories_project_release_fk");
  });

  it("kano_requests: subproject, target sprint and target release", async () => {
    const req = { ...p(), description: "d", requesterName: "r" };
    expect(
      await rejectedBy(
        db.insert(kanoRequests).values({ ...req, seq: nextRaw(), subprojectId: f.otherSub.id }),
      ),
    ).toBe("kano_requests_project_subproject_fk");
    expect(
      await rejectedBy(
        db
          .insert(kanoRequests)
          .values({ ...req, seq: nextRaw(), targetSprintId: f.otherSprint.id }),
      ),
    ).toBe("kano_requests_project_target_sprint_fk");
    expect(
      await rejectedBy(
        db.insert(kanoRequests).values({ ...req, seq: nextRaw(), targetReleaseId: foreignRelease }),
      ),
    ).toBe("kano_requests_project_target_release_fk");
  });
});

describe("value-set and range constraints", () => {
  const story = () => ({
    projectId: f.project.id,
    createdById: f.pm.id,
    story: "s",
    subprojectId: f.subA.id,
    seq: nextRaw(),
  });
  const req = () => ({
    projectId: f.project.id,
    createdById: f.pm.id,
    description: "d",
    requesterName: "r",
    seq: nextRaw(),
  });
  const raid = () => ({
    projectId: f.project.id,
    createdById: f.pm.id,
    raisedById: f.pm.id,
    itemType: "risk" as const,
    description: "d",
    impact: 2,
    seq: nextRaw(),
  });

  it("restricts story points to the Fibonacci set", async () => {
    expect(await rejectedBy(db.insert(userStories).values({ ...story(), storyPoints: 4 }))).toBe(
      "user_stories_points_allowed",
    );
    expect(await rejectedBy(db.insert(userStories).values({ ...story(), storyPoints: 0 }))).toBe(
      "user_stories_points_allowed",
    );
    await db.insert(userStories).values({ ...story(), storyPoints: 21 });
  });

  it("restricts WSJF inputs, including a zero job size", async () => {
    expect(
      await rejectedBy(db.insert(kanoRequests).values({ ...req(), wsjfBusinessValue: 4 })),
    ).toBe("kano_requests_wsjf_inputs");
    expect(await rejectedBy(db.insert(kanoRequests).values({ ...req(), wsjfJobSize: 0 }))).toBe(
      "kano_requests_wsjf_inputs",
    );
  });

  it("restricts RICE inputs", async () => {
    expect(
      await rejectedBy(db.insert(kanoRequests).values({ ...req(), riceConfidence: 101 })),
    ).toBe("kano_requests_rice_confidence");
    expect(await rejectedBy(db.insert(kanoRequests).values({ ...req(), riceImpact: "4" }))).toBe(
      "kano_requests_rice_impact",
    );
    expect(await rejectedBy(db.insert(kanoRequests).values({ ...req(), riceEffort: "0" }))).toBe(
      "kano_requests_rice_effort",
    );
    expect(await rejectedBy(db.insert(kanoRequests).values({ ...req(), riceReach: -1 }))).toBe(
      "kano_requests_rice_reach",
    );
  });

  it("restricts RAID impact and likelihood to 1 through 3", async () => {
    expect(await rejectedBy(db.insert(raidItems).values({ ...raid(), impact: 4 }))).toBe(
      "raid_items_impact_range",
    );
    expect(await rejectedBy(db.insert(raidItems).values({ ...raid(), impact: 0 }))).toBe(
      "raid_items_impact_range",
    );
    expect(await rejectedBy(db.insert(raidItems).values({ ...raid(), likelihood: 4 }))).toBe(
      "raid_items_likelihood_range",
    );
  });
});

describe("checklist_checks targets", () => {
  const who = () => ({ templateId, checkedById: f.pm.id });
  it("rejects a duplicate check on the same activity or story", async () => {
    await db.insert(checklistChecks).values({ ...who(), activityId });
    expect(await rejectedBy(db.insert(checklistChecks).values({ ...who(), activityId }))).toBe(
      "checklist_checks_activity_template_uq",
    );
    await db.insert(checklistChecks).values({ ...who(), storyId });
    expect(await rejectedBy(db.insert(checklistChecks).values({ ...who(), storyId }))).toBe(
      "checklist_checks_story_template_uq",
    );
  });
  it("rejects a check with both or neither of story and activity", async () => {
    expect(
      await rejectedBy(db.insert(checklistChecks).values({ ...who(), storyId, activityId })),
    ).toBe("checklist_checks_one_target");
    expect(await rejectedBy(db.insert(checklistChecks).values(who()))).toBe(
      "checklist_checks_one_target",
    );
  });
});

describe("generated columns", () => {
  it("builds padded, non-truncating codes from seq", async () => {
    const outcome = await m.createOutcome({ ...k, title: "Codes" });
    const opp = await m.createOpportunity({ ...k, outcomeId: outcome.id, title: "Opp" });
    const sol = await m.createSolution({ ...k, opportunityId: opp.id, title: "Sol" });
    expect(sol.code).toBe(`OST-${String(sol.seq).padStart(2, "0")}`);

    const [big] = await db
      .insert(userStories)
      .values({
        projectId: f.project.id,
        createdById: f.pm.id,
        subprojectId: f.subA.id,
        story: "s",
        seq: 100,
      })
      .returning();
    expect(big?.code).toBe("USM-100"); // not truncated to USM-10
    const [mid] = await db
      .insert(kanoRequests)
      .values({
        // Second project, so this hand-picked seq cannot collide with the fixture project's counter.
        projectId: f.otherProject.id,
        createdById: f.pm.id,
        description: "d",
        requesterName: "r",
        seq: 7,
      })
      .returning();
    expect(mid?.code).toBe("REQ-007");
    const raid = await m.createRaidItem({ ...k, itemType: "issue", description: "d", impact: 2 });
    expect(raid.code).toBe(`RAID-${String(raid.seq).padStart(2, "0")}`);
  });

  it("computes WSJF, including null cases", async () => {
    const full = await m.createKanoRequest({
      ...k,
      description: "a",
      requesterName: "r",
      wsjf: { businessValue: 8, timeCriticality: 5, riskReduction: 3, jobSize: 5 },
    });
    expect(full.wsjfScore).toBe("3.20"); // (8 + 5 + 3) / 5
    const rounded = await m.createKanoRequest({
      ...k,
      description: "b",
      requesterName: "r",
      wsjf: { businessValue: 1, timeCriticality: 1, riskReduction: 2, jobSize: 3 },
    });
    expect(rounded.wsjfScore).toBe("1.33");
    const missing = await m.createKanoRequest({ ...k, description: "c", requesterName: "r" });
    expect(missing.wsjfScore).toBeNull();
    const [partial] = await db
      .insert(kanoRequests)
      .values({
        projectId: f.project.id,
        createdById: f.pm.id,
        description: "d",
        requesterName: "r",
        seq: nextRaw(),
        wsjfBusinessValue: 5,
        wsjfJobSize: 2,
      })
      .returning();
    expect(partial?.wsjfScore).toBeNull(); // any missing input gives null, not a wrong number
  });

  it("computes RICE, including null cases", async () => {
    const r = await m.createKanoRequest({
      ...k,
      description: "rice",
      requesterName: "r",
      rice: { reach: 1000, impact: "2", confidence: 80, effort: "4" },
    });
    expect(r.riceScore).toBe("400.00");
    const [zeroConf] = await db
      .insert(kanoRequests)
      .values({
        projectId: f.project.id,
        createdById: f.pm.id,
        description: "z",
        requesterName: "r",
        seq: nextRaw(),
        riceReach: 10,
        riceImpact: "1",
        riceConfidence: 0,
        riceEffort: "1",
      })
      .returning();
    expect(zeroConf?.riceScore).toBe("0.00");
    const none = await m.createKanoRequest({ ...k, description: "none", requesterName: "r" });
    expect(none.riceScore).toBeNull();
  });

  it("computes severity as impact times likelihood, null when likelihood is unknown", async () => {
    const known = await m.createRaidItem({
      ...k,
      itemType: "risk",
      description: "k",
      impact: 3,
      likelihood: 2,
    });
    expect(known.severityScore).toBe(6);
    const unknown = await m.createRaidItem({ ...k, itemType: "risk", description: "u", impact: 3 });
    expect(unknown.severityScore).toBeNull();
  });
});

describe("sequence assignment under concurrency", () => {
  const N = 20;
  const assertUnique = (rows: Array<{ seq: number; code: string }>) => {
    expect(rows).toHaveLength(N);
    expect(new Set(rows.map((r) => r.seq)).size).toBe(N);
    expect(new Set(rows.map((r) => r.code)).size).toBe(N);
    expect(Math.min(...rows.map((r) => r.seq))).toBeGreaterThan(0);
  };
  const par = <T>(make: (i: number) => Promise<T>) =>
    Promise.all(Array.from({ length: N }, (_, i) => make(i)));

  it("OST solutions", async () => {
    const outcome = await m.createOutcome({ ...k, title: "Concurrent" });
    const opp = await m.createOpportunity({ ...k, outcomeId: outcome.id, title: "Opp" });
    assertUnique(
      await par((i) => m.createSolution({ ...k, opportunityId: opp.id, title: `S${i}` })),
    );
  });
  it("user stories", async () => {
    assertUnique(
      await par((i) => m.createStory({ ...k, subprojectId: f.subA.id, story: `story ${i}` })),
    );
  });
  it("Kano requests", async () => {
    assertUnique(
      await par((i) => m.createKanoRequest({ ...k, description: `req ${i}`, requesterName: "r" })),
    );
  });
  it("RAID items", async () => {
    assertUnique(
      await par((i) =>
        m.createRaidItem({ ...k, itemType: "risk", description: `risk ${i}`, impact: 1 }),
      ),
    );
  });
  it("tolerates gaps: a rolled-back insert burns a number but never reuses it", async () => {
    const before = await m.createKanoRequest({ ...k, description: "before", requesterName: "r" });
    await db
      .transaction(async (tx) => {
        await m.createKanoRequest({ ...k, description: "rolled back", requesterName: "r" }, tx);
        throw new Error("abort");
      })
      .catch(() => undefined);
    const after = await m.createKanoRequest({ ...k, description: "after", requesterName: "r" });
    expect(after.seq).toBeGreaterThan(before.seq);
    const rows = await db
      .select({ d: kanoRequests.description })
      .from(kanoRequests)
      .where(eq(kanoRequests.description, "rolled back"));
    expect(rows).toHaveLength(0);
  });
});

describe("OST validation roll-up", () => {
  it("is validated only when the riskiest assumption is validated (pure function)", () => {
    expect(m.computeSolutionValidation([{ isRiskiest: true, validationStatus: "validated" }])).toBe(
      "validated",
    );
    expect(
      m.computeSolutionValidation([
        { isRiskiest: true, validationStatus: "validated" },
        { isRiskiest: false, validationStatus: "invalidated" },
      ]),
    ).toBe("validated");
    expect(
      m.computeSolutionValidation([
        { isRiskiest: false, validationStatus: "validated" },
        { isRiskiest: true, validationStatus: "planned" },
      ]),
    ).toBe("planned");
  });
  it("is invalidated if the riskiest assumption is invalidated", () => {
    expect(
      m.computeSolutionValidation([{ isRiskiest: true, validationStatus: "invalidated" }]),
    ).toBe("invalidated");
  });
  it("stays planned with no riskiest assumption, even if others are validated", () => {
    expect(m.computeSolutionValidation([])).toBe("planned");
    expect(
      m.computeSolutionValidation([
        { isRiskiest: false, validationStatus: "validated" },
        { isRiskiest: false, validationStatus: "validated" },
      ]),
    ).toBe("planned");
  });
  it("mirrors an in-progress riskiest assumption", () => {
    expect(
      m.computeSolutionValidation([{ isRiskiest: true, validationStatus: "in_progress" }]),
    ).toBe("in_progress");
  });

  it("keeps the stored solution status in step with assumption changes, in the same transaction", async () => {
    const outcome = await m.createOutcome({ ...k, title: "Rollup" });
    const opp = await m.createOpportunity({ ...k, outcomeId: outcome.id, title: "Opp" });
    const sol = await m.createSolution({ ...k, opportunityId: opp.id, title: "Sol" });
    const status = async () =>
      (await db.select().from(ostSolutions).where(eq(ostSolutions.id, sol.id)))[0]
        ?.validationStatus;

    const a1 = await m.createAssumption({
      ...k,
      solutionId: sol.id,
      statement: "a1",
      category: "desirability",
      isRiskiest: true,
    });
    const a2 = await m.createAssumption({
      ...k,
      solutionId: sol.id,
      statement: "a2",
      category: "feasibility",
    });
    expect(await status()).toBe("planned");

    await m.updateAssumption(a2.id, { validationStatus: "validated" });
    expect(await status()).toBe("planned"); // not the riskiest
    await m.updateAssumption(a1.id, { validationStatus: "validated" });
    expect(await status()).toBe("validated");

    await m.updateAssumption(a2.id, { isRiskiest: true }); // moves the riskiest flag to a2 (validated)
    const flags = await m.listSolutionAssumptions(sol.id);
    expect(flags.filter((a) => a.isRiskiest).map((a) => a.id)).toEqual([a2.id]);
    await m.updateAssumption(a2.id, { validationStatus: "invalidated" });
    expect(await status()).toBe("invalidated");

    await m.deleteAssumption(a2.id);
    expect(await status()).toBe("planned");

    // A failure after the assumption change rolls the roll-up back too.
    await db
      .transaction(async (tx) => {
        await m.updateAssumption(a1.id, { isRiskiest: true, validationStatus: "invalidated" }, tx);
        throw new Error("abort");
      })
      .catch(() => undefined);
    expect(await status()).toBe("planned");
  });
});

describe("misc", () => {
  it("maintains updated_at on module tables", async () => {
    const outcome = await m.createOutcome({ ...k, title: "Touch" });
    await db.execute(sql`SELECT pg_sleep(0.05)`);
    await db.update(ostOutcomes).set({ title: "Touched" }).where(eq(ostOutcomes.id, outcome.id));
    const [after] = await db.select().from(ostOutcomes).where(eq(ostOutcomes.id, outcome.id));
    expect(after && after.updatedAt.getTime() > outcome.updatedAt.getTime()).toBe(true);
  });
  it("treats persona names and root journey steps as unique (case-insensitive, nulls not distinct)", async () => {
    await m.createPersona({ ...k, name: "Teacher" });
    expect(await rejectedBy(m.createPersona({ ...k, name: "TEACHER" }))).toBe(
      "personas_project_name_lower_uq",
    );
    await m.createJourneyStep({ ...k, subprojectId: f.subA.id, name: "Discover" });
    expect(
      await rejectedBy(m.createJourneyStep({ ...k, subprojectId: f.subA.id, name: "Discover" })),
    ).toBe("journey_steps_scope_name_uq");
  });
});
