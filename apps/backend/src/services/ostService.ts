import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type {
  ConvertSolutionInput,
  CreateOpportunityInput,
  CreateOutcomeInput,
  CreateSolutionInput,
  OpportunityDto,
  OstTreeDto,
  OutcomeDto,
  RequirementSolutionInput,
  SolutionDto,
  UpdateOpportunityInput,
  UpdateOutcomeInput,
  UpdateSolutionInput,
} from "@myapp/shared";
import { sprintFieldsFor } from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import {
  ostOpportunities,
  ostOutcomes,
  ostSolutions,
  projects,
  userStories,
  users,
} from "../db/schema";
import { AppError, conflict, forbidden, notFound, unprocessable } from "../errors";
import { can, type Actor } from "../permissions";
import { recordOverride } from "./governanceService";
import { assertCompletionAllowed } from "./approvalGate";
import { sprintColumns, sprintColumnsOrUndefined } from "./sprintWrite";
import { scopeCondition, type ProjectScope } from "./visibilityService";
import {
  createOpportunity as insertOpportunity,
  createOutcome as insertOutcome,
  createSolution as insertSolution,
  createStory,
} from "./moduleService";

/**
 * Opportunity Solution Tree: outcome > opportunities > solutions (the actions).
 * A solution is marked validated by the PM; it converts to a user story only once validated, or a PM can
 * override with a reason that is logged.
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

// ---------------------------------------------------------------- read
/** One project's tree, or every project's when `projectId` is omitted. */
export async function getTree(projectId?: string, scope: ProjectScope = null): Promise<OstTreeDto> {
  const outcomeRows = await db
    .select({ o: ostOutcomes, projectName: projects.name })
    .from(ostOutcomes)
    .innerJoin(projects, eq(projects.id, ostOutcomes.projectId))
    .where(
      and(
        projectId ? eq(ostOutcomes.projectId, projectId) : undefined,
        scopeCondition(ostOutcomes.projectId, scope),
      ),
    )
    .orderBy(asc(ostOutcomes.createdAt), asc(ostOutcomes.id));
  const outcomeIds = outcomeRows.map((r) => r.o.id);
  if (outcomeIds.length === 0) return { outcomes: [], opportunities: [], solutions: [] };

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
  const outcomes: OutcomeDto[] = outcomeRows.map(({ o, projectName }) => ({
    id: o.id,
    projectId: o.projectId,
    projectName,
    title: o.title,
    description: o.description,
  }));
  const opportunities: OpportunityDto[] = opps.map((o) => ({
    id: o.id,
    outcomeId: o.outcomeId,
    title: o.title,
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
    targetDate: s.targetDate,
    ...sprintFieldsFor(s.sprintKey, s.targetDate),
    pmApproval: s.pmApproval,
    convertedStoryId: s.convertedStoryId,
    convertedStoryCode: storyCode,
  }));
  return { outcomes, opportunities, solutions };
}

// ---------------------------------------------------------------- outcomes
export async function createOutcome(actor: Actor, projectId: string, input: CreateOutcomeInput) {
  const targetProjectId = input.projectId ?? projectId;
  return db.transaction(async (tx) => {
    await assertOpen(tx, targetProjectId);
    return insertOutcome(
      {
        projectId: targetProjectId,
        createdById: actor.id,
        title: input.title,
        description: input.description ?? undefined,
      },
      tx,
    );
  });
}

export async function updateOutcome(id: string, patch: UpdateOutcomeInput) {
  const set: Partial<typeof ostOutcomes.$inferInsert> = { ...patch };
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
/**
 * Makes the stored solutions of one requirement equal to the input: rows missing from the input are deleted,
 * rows with an id are updated, rows without one are inserted. Solutions already converted to a story cannot be
 * removed. `completed` ticks a solution to validated; unticking returns a validated one to planned.
 */
async function syncSolutions(
  tx: NonNullable<Parameters<typeof insertSolution>[1]>,
  actor: Actor,
  opp: { id: string; projectId: string },
  input: RequirementSolutionInput[],
) {
  const existing = await tx
    .select()
    .from(ostSolutions)
    .where(eq(ostSolutions.opportunityId, opp.id));
  const byId = new Map(existing.map((e) => [e.id, e]));
  const keep = new Set<string>();
  for (const s of input) {
    if (!s.id) continue;
    if (!byId.has(s.id)) throw unprocessable("Unknown solution for this requirement");
    if (keep.has(s.id)) throw unprocessable("Duplicate solution id");
    keep.add(s.id);
  }
  const ownerIds = [...new Set(input.map((s) => s.ownerId).filter((x): x is string => !!x))];
  if (ownerIds.length > 0) {
    const found = await tx.select({ id: users.id }).from(users).where(inArray(users.id, ownerIds));
    if (found.length !== ownerIds.length) throw unprocessable("Unknown staff member responsible");
  }
  const removed = existing.filter((e) => !keep.has(e.id));
  if (removed.some((e) => e.convertedStoryId)) {
    throw unprocessable("A solution already converted to a story cannot be removed");
  }
  if (removed.length > 0) {
    await tx.delete(ostSolutions).where(
      inArray(
        ostSolutions.id,
        removed.map((e) => e.id),
      ),
    );
  }
  for (const s of input) {
    const prev = s.id ? byId.get(s.id) : undefined;
    const completed = s.completed ?? false;
    // Validating (ticking) a solution is the PM's call; members add and edit but never change the done state.
    if (actor.role !== "pm" && completed !== (prev?.validationStatus === "validated")) {
      throw forbidden("Only a PM can mark a solution validated");
    }
    assertCompletionAllowed(prev?.pmApproval ?? "PENDING", {
      wasCompleted: prev?.validationStatus === "validated",
      willComplete: completed,
    });
    const status = completed
      ? "validated"
      : prev && prev.validationStatus !== "validated"
        ? prev.validationStatus
        : "planned";
    if (prev) {
      await tx
        .update(ostSolutions)
        .set({
          title: s.title,
          ownerId: s.ownerId ?? null,
          ...sprintColumns(s),
          validationStatus: status,
        })
        .where(eq(ostSolutions.id, prev.id));
    } else {
      await insertSolution(
        {
          projectId: opp.projectId,
          createdById: actor.id,
          opportunityId: opp.id,
          title: s.title,
          ownerId: s.ownerId ?? null,
          ...sprintColumns(s),
          validationStatus: status,
        },
        tx,
      );
    }
  }
}

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
    const row = await insertOpportunity(
      {
        projectId: outcome.projectId,
        createdById: actor.id,
        outcomeId,
        title: input.title,
        isTargeted: input.isTargeted,
      },
      tx,
    );
    await syncSolutions(tx, actor, row, input.solutions ?? []);
    return row;
  });
}

export async function updateOpportunity(actor: Actor, id: string, patch: UpdateOpportunityInput) {
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
    const { solutions, ...fields } = patch;
    const [row] =
      Object.keys(fields).length > 0
        ? await tx
            .update(ostOpportunities)
            .set(fields)
            .where(eq(ostOpportunities.id, id))
            .returning()
        : [current];
    if (!row) throw notFound("Opportunity");
    if (solutions !== undefined) await syncSolutions(tx, actor, row, solutions);
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
        ...sprintColumns(input),
      },
      tx,
    );
  });
}

export async function updateSolution(id: string, patch: UpdateSolutionInput) {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  const [current] = await db
    .select({
      projectId: ostSolutions.projectId,
      pmApproval: ostSolutions.pmApproval,
      validationStatus: ostSolutions.validationStatus,
    })
    .from(ostSolutions)
    .where(eq(ostSolutions.id, id))
    .limit(1);
  if (!current) throw notFound("Solution");
  await assertOpen(db, current.projectId);
  assertCompletionAllowed(current.pmApproval, {
    wasCompleted: current.validationStatus === "validated",
    willComplete: patch.validationStatus === "validated",
  });
  const { sprintKey, ...rest } = patch;
  const sprintCols = sprintColumnsOrUndefined({ sprintKey, targetDate: rest.targetDate });
  const [row] = await db
    .update(ostSolutions)
    .set({ ...rest, ...sprintCols })
    .where(eq(ostSolutions.id, id))
    .returning();
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
        story: input.story ?? sol.title,
        // The solution's owner and date carry over as the story's person responsible and target date.
        responsibleId: sol.ownerId,
        targetDate: sol.targetDate,
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
