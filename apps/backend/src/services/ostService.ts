import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type {
  AssumptionDto,
  ConvertSolutionInput,
  CreateAssumptionInput,
  CreateOpportunityInput,
  CreateOutcomeInput,
  CreateSolutionInput,
  OpportunityDto,
  OstTreeDto,
  OutcomeDto,
  SolutionDto,
  UpdateAssumptionInput,
  UpdateOpportunityInput,
  UpdateOutcomeInput,
  UpdateSolutionInput,
} from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import {
  ostAssumptions,
  ostOpportunities,
  ostOutcomes,
  ostSolutions,
  projects,
  subprojects,
  userStories,
  users,
} from "../db/schema";
import { AppError, conflict, forbidden, notFound, unprocessable } from "../errors";
import { can, type Actor } from "../permissions";
import { recordOverride } from "./governanceService";
import {
  createAssumption as insertAssumption,
  createOpportunity as insertOpportunity,
  createOutcome as insertOutcome,
  createSolution as insertSolution,
  createStory,
  recalcSolutionValidation,
} from "./moduleService";

/**
 * Opportunity Solution Tree: outcome > opportunities (nestable) > solutions > assumptions with tests.
 * A solution's validation status is a roll-up of its riskiest assumption, maintained in the same
 * transaction as every assumption change (moduleService.recalcSolutionValidation). A solution converts
 * to a user story only once validated; a PM can override with a reason that is logged.
 */

async function assertOpen(tx: DbOrTx, projectId: string) {
  const [p] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) throw notFound("Project");
  if (p.archivedAt) throw conflict("This project is archived and read-only");
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));
const str = (n: number | null | undefined): string | null | undefined =>
  n === undefined ? undefined : n === null ? null : String(n);

// ---------------------------------------------------------------- read
export async function getTree(projectId: string, subprojectId?: string): Promise<OstTreeDto> {
  const outcomeRows = await db
    .select({ o: ostOutcomes, subprojectCode: subprojects.code })
    .from(ostOutcomes)
    .leftJoin(subprojects, eq(subprojects.id, ostOutcomes.subprojectId))
    .where(
      and(
        eq(ostOutcomes.projectId, projectId),
        subprojectId ? eq(ostOutcomes.subprojectId, subprojectId) : undefined,
      ),
    )
    .orderBy(asc(ostOutcomes.createdAt), asc(ostOutcomes.id));
  const outcomeIds = outcomeRows.map((r) => r.o.id);
  if (outcomeIds.length === 0)
    return { outcomes: [], opportunities: [], solutions: [], assumptions: [] };

  const opps = await db
    .select()
    .from(ostOpportunities)
    .where(inArray(ostOpportunities.outcomeId, outcomeIds))
    .orderBy(asc(ostOpportunities.createdAt), asc(ostOpportunities.id));
  const oppIds = opps.map((o) => o.id);
  const sols =
    oppIds.length === 0
      ? []
      : await db
          .select({ s: ostSolutions, ownerName: users.fullName, storyCode: userStories.code })
          .from(ostSolutions)
          .leftJoin(users, eq(users.id, ostSolutions.ownerId))
          .leftJoin(userStories, eq(userStories.id, ostSolutions.convertedStoryId))
          .where(inArray(ostSolutions.opportunityId, oppIds))
          .orderBy(asc(ostSolutions.seq));
  const solIds = sols.map((s) => s.s.id);
  const asms =
    solIds.length === 0
      ? []
      : await db
          .select()
          .from(ostAssumptions)
          .where(inArray(ostAssumptions.solutionId, solIds))
          .orderBy(asc(ostAssumptions.position), asc(ostAssumptions.id));

  const outcomes: OutcomeDto[] = outcomeRows.map(({ o, subprojectCode }) => ({
    id: o.id,
    subprojectId: o.subprojectId,
    subprojectCode,
    title: o.title,
    description: o.description,
    metricName: o.metricName,
    baselineValue: num(o.baselineValue),
    targetValue: num(o.targetValue),
    targetDate: o.targetDate,
  }));
  const opportunities: OpportunityDto[] = opps.map((o) => ({
    id: o.id,
    outcomeId: o.outcomeId,
    parentOpportunityId: o.parentOpportunityId,
    title: o.title,
    description: o.description,
    evidence: o.evidence,
    isTargeted: o.isTargeted,
  }));
  const solutions: SolutionDto[] = sols.map(({ s, ownerName, storyCode }) => ({
    id: s.id,
    opportunityId: s.opportunityId,
    code: s.code,
    title: s.title,
    validationStatus: s.validationStatus,
    ownerId: s.ownerId,
    ownerName,
    convertedStoryId: s.convertedStoryId,
    convertedStoryCode: storyCode,
  }));
  const assumptions: AssumptionDto[] = asms.map((a) => ({
    id: a.id,
    solutionId: a.solutionId,
    statement: a.statement,
    category: a.category,
    isRiskiest: a.isRiskiest,
    validationTest: a.validationTest,
    validationStatus: a.validationStatus,
    resultNotes: a.resultNotes,
    position: a.position,
  }));
  return { outcomes, opportunities, solutions, assumptions };
}

// ---------------------------------------------------------------- outcomes
export async function createOutcome(actor: Actor, projectId: string, input: CreateOutcomeInput) {
  return db.transaction(async (tx) => {
    await assertOpen(tx, projectId);
    return insertOutcome(
      {
        projectId,
        createdById: actor.id,
        subprojectId: input.subprojectId ?? null,
        title: input.title,
        description: input.description ?? undefined,
        metricName: input.metricName ?? undefined,
        baselineValue: str(input.baselineValue) ?? undefined,
        targetValue: str(input.targetValue) ?? undefined,
        targetDate: input.targetDate ?? undefined,
      },
      tx,
    );
  });
}

export async function updateOutcome(id: string, patch: UpdateOutcomeInput) {
  const { baselineValue, targetValue, ...rest } = patch;
  const set: Partial<typeof ostOutcomes.$inferInsert> = { ...rest };
  if (baselineValue !== undefined) set.baselineValue = str(baselineValue) ?? null;
  if (targetValue !== undefined) set.targetValue = str(targetValue) ?? null;
  if (Object.keys(set).length === 0) throw unprocessable("Nothing to change");
  const [current] = await db
    .select({ projectId: ostOutcomes.projectId })
    .from(ostOutcomes)
    .where(eq(ostOutcomes.id, id))
    .limit(1);
  if (!current) throw notFound("Outcome");
  await assertOpen(db, current.projectId);
  const [row] = await db.update(ostOutcomes).set(set).where(eq(ostOutcomes.id, id)).returning();
  if (!row) throw notFound("Outcome");
  return row;
}

export async function deleteOutcome(id: string) {
  const [row] = await db
    .delete(ostOutcomes)
    .where(eq(ostOutcomes.id, id))
    .returning({ id: ostOutcomes.id });
  if (!row) throw notFound("Outcome");
}

// ---------------------------------------------------------------- opportunities
export async function createOpportunity(
  actor: Actor,
  outcomeId: string,
  input: CreateOpportunityInput,
) {
  return db.transaction(async (tx) => {
    const [outcome] = await tx
      .select({ projectId: ostOutcomes.projectId })
      .from(ostOutcomes)
      .where(eq(ostOutcomes.id, outcomeId))
      .limit(1);
    if (!outcome) throw notFound("Outcome");
    await assertOpen(tx, outcome.projectId);
    if (input.parentOpportunityId) {
      const [parent] = await tx
        .select({ outcomeId: ostOpportunities.outcomeId })
        .from(ostOpportunities)
        .where(eq(ostOpportunities.id, input.parentOpportunityId))
        .limit(1);
      if (!parent || parent.outcomeId !== outcomeId) throw notFound("Parent opportunity");
    }
    return insertOpportunity(
      {
        projectId: outcome.projectId,
        createdById: actor.id,
        outcomeId,
        parentOpportunityId: input.parentOpportunityId ?? null,
        title: input.title,
        description: input.description ?? undefined,
        evidence: input.evidence ?? undefined,
        isTargeted: input.isTargeted,
      },
      tx,
    );
  });
}

export async function updateOpportunity(id: string, patch: UpdateOpportunityInput) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(ostOpportunities)
      .where(eq(ostOpportunities.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Opportunity");
    await assertOpen(tx, current.projectId);
    if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
    // One targeted opportunity per outcome: targeting this one clears the previous.
    if (patch.isTargeted) {
      await tx
        .update(ostOpportunities)
        .set({ isTargeted: false })
        .where(and(eq(ostOpportunities.outcomeId, current.outcomeId), ne(ostOpportunities.id, id)));
    }
    const [row] = await tx
      .update(ostOpportunities)
      .set(patch)
      .where(eq(ostOpportunities.id, id))
      .returning();
    if (!row) throw notFound("Opportunity");
    return row;
  });
}

export async function deleteOpportunity(id: string) {
  const [row] = await db
    .delete(ostOpportunities)
    .where(eq(ostOpportunities.id, id))
    .returning({ id: ostOpportunities.id });
  if (!row) throw notFound("Opportunity");
}

// ---------------------------------------------------------------- solutions
export async function createSolution(
  actor: Actor,
  opportunityId: string,
  input: CreateSolutionInput,
) {
  return db.transaction(async (tx) => {
    const [opp] = await tx
      .select({ projectId: ostOpportunities.projectId })
      .from(ostOpportunities)
      .where(eq(ostOpportunities.id, opportunityId))
      .limit(1);
    if (!opp) throw notFound("Opportunity");
    await assertOpen(tx, opp.projectId);
    return insertSolution(
      {
        projectId: opp.projectId,
        createdById: actor.id,
        opportunityId,
        title: input.title,
        ownerId: input.ownerId ?? null,
      },
      tx,
    );
  });
}

export async function updateSolution(id: string, patch: UpdateSolutionInput) {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  const [current] = await db
    .select({ projectId: ostSolutions.projectId })
    .from(ostSolutions)
    .where(eq(ostSolutions.id, id))
    .limit(1);
  if (!current) throw notFound("Solution");
  await assertOpen(db, current.projectId);
  const [row] = await db.update(ostSolutions).set(patch).where(eq(ostSolutions.id, id)).returning();
  if (!row) throw notFound("Solution");
  return row;
}

export async function deleteSolution(id: string) {
  const [row] = await db
    .delete(ostSolutions)
    .where(eq(ostSolutions.id, id))
    .returning({ id: ostSolutions.id });
  if (!row) throw notFound("Solution");
}

// ---------------------------------------------------------------- assumptions
export async function createAssumption(
  actor: Actor,
  solutionId: string,
  input: CreateAssumptionInput,
) {
  return db.transaction(async (tx) => {
    const [sol] = await tx
      .select({ projectId: ostSolutions.projectId })
      .from(ostSolutions)
      .where(eq(ostSolutions.id, solutionId))
      .limit(1);
    if (!sol) throw notFound("Solution");
    await assertOpen(tx, sol.projectId);
    const [last] = await tx
      .select({ p: sql<number | null>`max(${ostAssumptions.position})` })
      .from(ostAssumptions)
      .where(eq(ostAssumptions.solutionId, solutionId));
    return insertAssumption(
      {
        projectId: sol.projectId,
        createdById: actor.id,
        solutionId,
        statement: input.statement,
        category: input.category,
        isRiskiest: input.isRiskiest,
        validationTest: input.validationTest ?? undefined,
        position: (last?.p ?? -1) + 1,
      },
      tx,
    );
  });
}

const MEMBER_ASSUMPTION_FIELDS = ["validationStatus", "resultNotes", "validationTest"];

export async function updateAssumption(actor: Actor, id: string, patch: UpdateAssumptionInput) {
  const fields = Object.keys(patch);
  if (fields.length === 0) throw unprocessable("Nothing to change");
  // Team members run the tests and record results; the PM owns the statement and the riskiest flag.
  if (!can(actor, "ost.manage") && !fields.every((f) => MEMBER_ASSUMPTION_FIELDS.includes(f))) {
    throw forbidden("Only a PM can change the statement, category or riskiest flag");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(ostAssumptions)
      .where(eq(ostAssumptions.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Assumption");
    await assertOpen(tx, current.projectId);
    // Lock the parent first so concurrent flag moves on one solution serialize.
    if (patch.isRiskiest) {
      await tx
        .update(ostAssumptions)
        .set({ isRiskiest: false })
        .where(and(eq(ostAssumptions.solutionId, current.solutionId), ne(ostAssumptions.id, id)));
    }
    const [row] = await tx
      .update(ostAssumptions)
      .set(patch)
      .where(eq(ostAssumptions.id, id))
      .returning();
    if (!row) throw notFound("Assumption");
    await recalcSolutionValidation(tx, current.solutionId);
    return row;
  });
}

export async function deleteAssumption(id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(ostAssumptions).where(eq(ostAssumptions.id, id)).returning();
    if (!row) throw notFound("Assumption");
    await recalcSolutionValidation(tx, row.solutionId);
  });
}

// ---------------------------------------------------------------- convert to story
export async function convertSolution(actor: Actor, id: string, input: ConvertSolutionInput) {
  return db.transaction(async (tx) => {
    const [sol] = await tx
      .select()
      .from(ostSolutions)
      .where(eq(ostSolutions.id, id))
      .for("update")
      .limit(1);
    if (!sol) throw notFound("Solution");
    await assertOpen(tx, sol.projectId);
    if (sol.convertedStoryId) throw conflict("This solution has already been converted to a story");
    const [sub] = await tx
      .select({ projectId: subprojects.projectId, archivedAt: subprojects.archivedAt })
      .from(subprojects)
      .where(eq(subprojects.id, input.subprojectId))
      .limit(1);
    if (!sub || sub.projectId !== sol.projectId) throw notFound("Subproject");
    if (sub.archivedAt) throw conflict("That subproject is archived and read-only");

    if (sol.validationStatus !== "validated") {
      if (input.overrideReason) {
        if (!can(actor, "ost.manage"))
          throw forbidden("Only a PM can override the validation gate");
        await recordOverride(tx, {
          gate: "validation",
          entityType: "solution",
          entityId: id,
          reason: input.overrideReason,
          userId: actor.id,
        });
      } else {
        throw new AppError(
          422,
          "validation_incomplete",
          "A solution must be validated before it becomes a story",
          { validationStatus: sol.validationStatus },
        );
      }
    }
    const story = await createStory(
      {
        projectId: sol.projectId,
        createdById: actor.id,
        subprojectId: input.subprojectId,
        story: input.story ?? sol.title,
        position: 0,
      },
      tx,
    );
    await tx
      .update(ostSolutions)
      .set({ convertedStoryId: story.id })
      .where(eq(ostSolutions.id, id));
    return { storyId: story.id, storyCode: story.code };
  });
}
