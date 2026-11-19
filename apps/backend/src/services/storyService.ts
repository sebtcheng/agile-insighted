import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import type {
  CreateJourneyStepInput,
  CreatePersonaInput,
  CreateStoryInput,
  JourneyStepDto,
  PersonaDto,
  StoryChecklistItemDto,
  StoryDto,
  StoryMapDto,
  UpdateJourneyStepInput,
  UpdatePersonaInput,
  UpdateStoryInput,
} from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import {
  activities,
  checklistChecks,
  checklistTemplates,
  journeySteps,
  personas,
  projects,
  releases,
  sprints,
  subprojects,
  userStories,
} from "../db/schema";
import { AppError, conflict, forbidden, notFound, unprocessable } from "../errors";
import { can, type Actor } from "../permissions";
import { recordOverride } from "./governanceService";
import { createStory as insertStory } from "./moduleService";

/**
 * User Story Mapping. The map is a backbone (journey steps with no parent) over steps, with stories
 * stacked under a step, most necessary first. Release lines come from stories.release_id.
 * The Definition of Ready gates moving a story into a sprint or into progress; a PM can override
 * with a reason that is written to gate_overrides.
 */

// ---------------------------------------------------------------- guards
async function projectOfSubproject(tx: DbOrTx, subprojectId: string): Promise<string> {
  const [sub] = await tx
    .select({ projectId: subprojects.projectId, archivedAt: subprojects.archivedAt })
    .from(subprojects)
    .where(eq(subprojects.id, subprojectId))
    .limit(1);
  if (!sub) throw notFound("Subproject");
  if (sub.archivedAt) throw conflict("That subproject is archived and read-only");
  await assertProjectOpen(tx, sub.projectId);
  return sub.projectId;
}

async function assertProjectOpen(tx: DbOrTx, projectId: string) {
  const [p] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) throw notFound("Project");
  if (p.archivedAt) throw conflict("This project is archived and read-only");
}

// ---------------------------------------------------------------- the map
export async function getStoryMap(subprojectId: string): Promise<StoryMapDto> {
  const [sub] = await db
    .select({ projectId: subprojects.projectId })
    .from(subprojects)
    .where(eq(subprojects.id, subprojectId))
    .limit(1);
  if (!sub) throw notFound("Subproject");

  const [personaRows, stepRows, storyRows, [tpl]] = await Promise.all([
    db
      .select()
      .from(personas)
      .where(
        and(
          eq(personas.projectId, sub.projectId),
          sql`(${personas.subprojectId} IS NULL OR ${personas.subprojectId} = ${subprojectId})`,
        ),
      )
      .orderBy(asc(sql`lower(${personas.name})`)),
    db
      .select()
      .from(journeySteps)
      .where(eq(journeySteps.subprojectId, subprojectId))
      .orderBy(asc(journeySteps.position), asc(journeySteps.id)),
    db
      .select({
        s: userStories,
        personaName: personas.name,
        releaseName: releases.name,
        isMvp: releases.isMvp,
        sprintName: sprints.name,
      })
      .from(userStories)
      .leftJoin(personas, eq(personas.id, userStories.personaId))
      .leftJoin(releases, eq(releases.id, userStories.releaseId))
      .leftJoin(sprints, eq(sprints.id, userStories.sprintId))
      .where(eq(userStories.subprojectId, subprojectId))
      .orderBy(asc(userStories.position), asc(userStories.seq)),
    db
      .select({ n: count() })
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.projectId, sub.projectId),
          eq(checklistTemplates.kind, "ready"),
          eq(checklistTemplates.isActive, true),
        ),
      ),
  ]);
  const readyTotal = tpl?.n ?? 0;
  const ids = storyRows.map((r) => r.s.id);
  const checked = new Map<string, number>();
  const linked = new Map<string, number>();
  if (ids.length > 0) {
    const checkRows = await db
      .select({ storyId: checklistChecks.storyId, n: count() })
      .from(checklistChecks)
      .innerJoin(checklistTemplates, eq(checklistTemplates.id, checklistChecks.templateId))
      .where(
        and(
          inArray(checklistChecks.storyId, ids),
          eq(checklistTemplates.isActive, true),
          eq(checklistTemplates.kind, "ready"),
        ),
      )
      .groupBy(checklistChecks.storyId);
    for (const r of checkRows) if (r.storyId) checked.set(r.storyId, r.n);
    const linkRows = await db
      .select({ storyId: activities.userStoryId, n: count() })
      .from(activities)
      .where(inArray(activities.userStoryId, ids))
      .groupBy(activities.userStoryId);
    for (const r of linkRows) if (r.storyId) linked.set(r.storyId, r.n);
  }
  const stories: StoryDto[] = storyRows.map((r) => ({
    id: r.s.id,
    projectId: r.s.projectId,
    subprojectId: r.s.subprojectId,
    code: r.s.code,
    story: r.s.story,
    acceptanceCriteria: r.s.acceptanceCriteria,
    personaId: r.s.personaId,
    personaName: r.personaName,
    journeyStepId: r.s.journeyStepId,
    workType: r.s.workType,
    releaseId: r.s.releaseId,
    releaseName: r.releaseName,
    isMvp: r.isMvp ?? false,
    sprintId: r.s.sprintId,
    sprintName: r.sprintName,
    storyPoints: r.s.storyPoints,
    status: r.s.status,
    position: r.s.position,
    readyChecked: checked.get(r.s.id) ?? 0,
    readyTotal,
    linkedActivities: linked.get(r.s.id) ?? 0,
  }));
  const personaDtos: PersonaDto[] = personaRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    subprojectId: p.subprojectId,
  }));
  const steps: JourneyStepDto[] = stepRows.map((s) => ({
    id: s.id,
    subprojectId: s.subprojectId,
    parentStepId: s.parentStepId,
    name: s.name,
    position: s.position,
  }));
  return { personas: personaDtos, steps, stories };
}

// ---------------------------------------------------------------- personas
export async function createPersona(actor: Actor, projectId: string, input: CreatePersonaInput) {
  await assertProjectOpen(db, projectId);
  const [row] = await db
    .insert(personas)
    .values({
      projectId,
      createdById: actor.id,
      subprojectId: input.subprojectId ?? null,
      name: input.name,
      description: input.description ?? null,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function updatePersona(id: string, patch: UpdatePersonaInput) {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  const [row] = await db.update(personas).set(patch).where(eq(personas.id, id)).returning();
  if (!row) throw notFound("Persona");
  return row;
}

export async function deletePersona(id: string) {
  const [row] = await db.delete(personas).where(eq(personas.id, id)).returning({ id: personas.id });
  if (!row) throw notFound("Persona");
}

// ---------------------------------------------------------------- journey steps
export async function createStep(
  actor: Actor,
  subprojectId: string,
  input: CreateJourneyStepInput,
) {
  return db.transaction(async (tx) => {
    const projectId = await projectOfSubproject(tx, subprojectId);
    if (input.parentStepId) {
      const [parent] = await tx
        .select({
          subprojectId: journeySteps.subprojectId,
          parentStepId: journeySteps.parentStepId,
        })
        .from(journeySteps)
        .where(eq(journeySteps.id, input.parentStepId))
        .limit(1);
      if (!parent || parent.subprojectId !== subprojectId) throw notFound("Backbone activity");
      if (parent.parentStepId) throw unprocessable("Steps go under a backbone activity only");
    }
    const [last] = await tx
      .select({ p: max(journeySteps.position) })
      .from(journeySteps)
      .where(
        and(
          eq(journeySteps.subprojectId, subprojectId),
          input.parentStepId
            ? eq(journeySteps.parentStepId, input.parentStepId)
            : sql`${journeySteps.parentStepId} IS NULL`,
        ),
      );
    const [row] = await tx
      .insert(journeySteps)
      .values({
        projectId,
        createdById: actor.id,
        subprojectId,
        parentStepId: input.parentStepId ?? null,
        name: input.name,
        position: input.position ?? (last?.p ?? -1) + 1,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function updateStep(id: string, patch: UpdateJourneyStepInput) {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  const [row] = await db.update(journeySteps).set(patch).where(eq(journeySteps.id, id)).returning();
  if (!row) throw notFound("Journey step");
  return row;
}

export async function deleteStep(id: string) {
  const [row] = await db
    .delete(journeySteps)
    .where(eq(journeySteps.id, id))
    .returning({ id: journeySteps.id });
  if (!row) throw notFound("Journey step");
}

// ---------------------------------------------------------------- stories
async function assertStepAndPersona(
  tx: DbOrTx,
  projectId: string,
  subprojectId: string,
  journeyStepId: string | null | undefined,
  personaId: string | null | undefined,
) {
  if (journeyStepId) {
    const [step] = await tx
      .select({ subprojectId: journeySteps.subprojectId })
      .from(journeySteps)
      .where(eq(journeySteps.id, journeyStepId))
      .limit(1);
    if (!step || step.subprojectId !== subprojectId) throw notFound("Journey step");
  }
  if (personaId) {
    const [p] = await tx
      .select({ projectId: personas.projectId })
      .from(personas)
      .where(eq(personas.id, personaId))
      .limit(1);
    if (!p || p.projectId !== projectId) throw notFound("Persona");
  }
}

export async function createStoryFor(actor: Actor, subprojectId: string, input: CreateStoryInput) {
  const id = await db.transaction(async (tx) => {
    const projectId = await projectOfSubproject(tx, subprojectId);
    await assertStepAndPersona(tx, projectId, subprojectId, input.journeyStepId, input.personaId);
    const [last] = await tx
      .select({ p: max(userStories.position) })
      .from(userStories)
      .where(
        and(
          eq(userStories.subprojectId, subprojectId),
          input.journeyStepId
            ? eq(userStories.journeyStepId, input.journeyStepId)
            : sql`${userStories.journeyStepId} IS NULL`,
        ),
      );
    const row = await insertStory(
      {
        projectId,
        createdById: actor.id,
        subprojectId,
        story: input.story,
        acceptanceCriteria: input.acceptanceCriteria ?? undefined,
        personaId: input.personaId ?? null,
        journeyStepId: input.journeyStepId ?? null,
        workType: input.workType,
        releaseId: input.releaseId ?? null,
        storyPoints: input.storyPoints ?? null,
        position: (last?.p ?? -1) + 1,
      },
      tx,
    );
    return row.id;
  });
  return storyById(id);
}

export async function storyById(id: string): Promise<StoryDto> {
  const [row] = await db
    .select({ subprojectId: userStories.subprojectId })
    .from(userStories)
    .where(eq(userStories.id, id))
    .limit(1);
  if (!row) throw notFound("Story");
  const map = await getStoryMap(row.subprojectId);
  const story = map.stories.find((s) => s.id === id);
  if (!story) throw notFound("Story");
  return story;
}

/** Active Definition of Ready items for a story's project, with a checked flag. */
export async function storyChecklist(
  tx: DbOrTx,
  storyId: string,
): Promise<StoryChecklistItemDto[]> {
  const [story] = await tx
    .select({ projectId: userStories.projectId })
    .from(userStories)
    .where(eq(userStories.id, storyId))
    .limit(1);
  if (!story) throw notFound("Story");
  const rows = await tx
    .select({
      templateId: checklistTemplates.id,
      label: checklistTemplates.label,
      position: checklistTemplates.position,
      checkedAt: checklistChecks.checkedAt,
    })
    .from(checklistTemplates)
    .leftJoin(
      checklistChecks,
      and(
        eq(checklistChecks.templateId, checklistTemplates.id),
        eq(checklistChecks.storyId, storyId),
      ),
    )
    .where(
      and(
        eq(checklistTemplates.projectId, story.projectId),
        eq(checklistTemplates.kind, "ready"),
        eq(checklistTemplates.isActive, true),
      ),
    )
    .orderBy(asc(checklistTemplates.position), asc(checklistTemplates.id));
  return rows.map((r) => ({
    templateId: r.templateId,
    label: r.label,
    position: r.position,
    checked: r.checkedAt !== null,
  }));
}

export const getStoryChecklist = (storyId: string) => storyChecklist(db, storyId);

export async function setStoryCheck(
  actor: Actor,
  storyId: string,
  templateId: string,
  checked: boolean,
) {
  await db.transaction(async (tx) => {
    const [story] = await tx
      .select({ projectId: userStories.projectId })
      .from(userStories)
      .where(eq(userStories.id, storyId))
      .limit(1);
    if (!story) throw notFound("Story");
    await assertProjectOpen(tx, story.projectId);
    const [tpl] = await tx
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.id, templateId))
      .limit(1);
    if (!tpl || tpl.projectId !== story.projectId || tpl.kind !== "ready")
      throw notFound("Checklist item");
    if (!tpl.isActive) throw conflict("That checklist item is no longer active");
    if (checked) {
      await tx
        .insert(checklistChecks)
        .values({ templateId, storyId, checkedById: actor.id })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(checklistChecks)
        .where(
          and(eq(checklistChecks.templateId, templateId), eq(checklistChecks.storyId, storyId)),
        );
    }
  });
  return storyChecklist(db, storyId);
}

/** Returns the override reason to record when a PM overrides, or null when the story is ready. */
async function enforceDor(
  tx: DbOrTx,
  actor: Actor,
  storyId: string,
  overrideReason: string | undefined,
): Promise<string | null> {
  const missing = (await storyChecklist(tx, storyId)).filter((i) => !i.checked).map((i) => i.label);
  if (missing.length === 0) return null;
  if (overrideReason) {
    if (!can(actor, "story.manage"))
      throw forbidden("Only a PM can override the Definition of Ready");
    return overrideReason;
  }
  throw new AppError(
    422,
    "dor_incomplete",
    "Every Definition of Ready item must be checked before a story goes into a sprint or into progress",
    { missing },
  );
}

export async function updateStory(
  actor: Actor,
  id: string,
  patch: UpdateStoryInput,
): Promise<StoryDto> {
  const { overrideReason, ...fields } = patch;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(userStories)
      .where(eq(userStories.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Story");
    await projectOfSubproject(tx, current.subprojectId);
    await assertStepAndPersona(
      tx,
      current.projectId,
      current.subprojectId,
      fields.journeyStepId,
      fields.personaId,
    );

    const intoSprint = fields.sprintId != null && fields.sprintId !== current.sprintId;
    const intoProgress =
      fields.status !== undefined &&
      (fields.status === "in_progress" || fields.status === "completed") &&
      current.status !== fields.status &&
      (current.status === "backlog" || current.status === "planning");
    if (intoSprint || intoProgress) {
      const reason = await enforceDor(tx, actor, id, overrideReason);
      if (reason) {
        await recordOverride(tx, {
          gate: "dor",
          entityType: "story",
          entityId: id,
          reason,
          userId: actor.id,
        });
      }
    }
    if (Object.keys(fields).length > 0) {
      await tx.update(userStories).set(fields).where(eq(userStories.id, id));
    }
  });
  return storyById(id);
}

export async function deleteStory(id: string) {
  const [row] = await db
    .delete(userStories)
    .where(eq(userStories.id, id))
    .returning({ id: userStories.id });
  if (!row) throw notFound("Story");
}
