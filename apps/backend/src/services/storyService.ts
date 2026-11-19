import { and, asc, count, eq, inArray, max, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  storyCompletion,
  type CreateJourneyStepInput,
  type CreatePersonaInput,
  type CreateStoryInput,
  type JourneyStepDto,
  type PersonaDto,
  type StoryDto,
  type StoryMapDto,
  type StoryStatus,
  type ToggleStoryActionStepResult,
  type UpdateJourneyStepInput,
  type UpdatePersonaInput,
  type UpdateStoryInput,
} from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import {
  activities,
  journeySteps,
  personas,
  projects,
  releases,
  sprints,
  users,
  userStories,
} from "../db/schema";
import { AppError, conflict, notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import { createStory as insertStory } from "./moduleService";
import {
  assertResponsibleUsers,
  setStepCompleted,
  stepsByStory,
  syncActionSteps,
} from "./storyActionStepService";
import { assertProjectVisible, scopeCondition, type ProjectScope } from "./visibilityService";

/**
 * User Story Mapping, scoped to projects like RAID, Kano and OST. The map is a backbone (journey steps with no
 * parent) over steps, with stories stacked under a step, most necessary first. Each story has a person
 * responsible, a target date and action steps; a story with steps can only be completed once every step is done.
 */

// ---------------------------------------------------------------- guards
async function assertProjectOpen(tx: DbOrTx, projectId: string) {
  const [p] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) throw notFound("Project");
  if (p.archivedAt) throw conflict("This project is archived and read-only");
}

/** 422 when a story with action steps is set to completed before every step is done. */
function stepsIncomplete(missing: string[]): AppError {
  return new AppError(
    422,
    "story_steps_incomplete",
    "Every action step must be checked before a story is marked completed",
    { missing },
  );
}

// ---------------------------------------------------------------- the map
const responsible = alias(users, "story_responsible");

async function loadStories(where: SQL | undefined): Promise<StoryDto[]> {
  const rows = await db
    .select({
      s: userStories,
      projectCode: projects.code,
      projectName: projects.name,
      personaName: personas.name,
      releaseName: releases.name,
      isMvp: releases.isMvp,
      sprintName: sprints.name,
      responsibleName: responsible.fullName,
    })
    .from(userStories)
    .innerJoin(projects, eq(projects.id, userStories.projectId))
    .leftJoin(personas, eq(personas.id, userStories.personaId))
    .leftJoin(releases, eq(releases.id, userStories.releaseId))
    .leftJoin(sprints, eq(sprints.id, userStories.sprintId))
    .leftJoin(responsible, eq(responsible.id, userStories.responsibleId))
    .where(where)
    .orderBy(asc(projects.code), asc(userStories.position), asc(userStories.seq));
  const ids = rows.map((r) => r.s.id);
  const linked = new Map<string, number>();
  const [steps] = await Promise.all([
    stepsByStory(db, ids),
    ids.length === 0
      ? Promise.resolve()
      : db
          .select({ storyId: activities.userStoryId, n: count() })
          .from(activities)
          .where(inArray(activities.userStoryId, ids))
          .groupBy(activities.userStoryId)
          .then((linkRows) => {
            for (const r of linkRows) if (r.storyId) linked.set(r.storyId, r.n);
          }),
  ]);
  return rows.map((r) => {
    const actionSteps = steps.get(r.s.id) ?? [];
    return {
      id: r.s.id,
      projectId: r.s.projectId,
      projectCode: r.projectCode,
      projectName: r.projectName,
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
      responsibleId: r.s.responsibleId,
      responsibleName: r.responsibleName,
      targetDate: r.s.targetDate,
      actionSteps,
      ...storyCompletion(actionSteps),
      linkedActivities: linked.get(r.s.id) ?? 0,
    };
  });
}

/** One project, or every project in `scope` when projectId is omitted (null scope = unrestricted). */
export async function getStoryMap(opts: {
  projectId?: string;
  scope: ProjectScope;
}): Promise<StoryMapDto> {
  const filter = (col: AnyPgColumn) =>
    opts.projectId ? eq(col, opts.projectId) : scopeCondition(col, opts.scope);

  const [personaRows, stepRows, stories] = await Promise.all([
    db
      .select({
        id: personas.id,
        projectId: personas.projectId,
        name: personas.name,
        description: personas.description,
      })
      .from(personas)
      .where(filter(personas.projectId))
      .orderBy(asc(sql`lower(${personas.name})`)),
    db
      .select({
        id: journeySteps.id,
        projectId: journeySteps.projectId,
        parentStepId: journeySteps.parentStepId,
        name: journeySteps.name,
        position: journeySteps.position,
      })
      .from(journeySteps)
      .where(filter(journeySteps.projectId))
      .orderBy(asc(journeySteps.position), asc(journeySteps.id)),
    loadStories(filter(userStories.projectId)),
  ]);
  const personaDtos: PersonaDto[] = personaRows;
  const steps: JourneyStepDto[] = stepRows;
  return { personas: personaDtos, steps, stories };
}

export async function storyById(id: string): Promise<StoryDto> {
  const [story] = await loadStories(eq(userStories.id, id));
  if (!story) throw notFound("Story");
  return story;
}

// ---------------------------------------------------------------- personas
export async function createPersona(actor: Actor, projectId: string, input: CreatePersonaInput) {
  await assertProjectOpen(db, projectId);
  const [row] = await db
    .insert(personas)
    .values({
      projectId,
      createdById: actor.id,
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
export async function createStep(actor: Actor, projectId: string, input: CreateJourneyStepInput) {
  return db.transaction(async (tx) => {
    await assertProjectOpen(tx, projectId);
    if (input.parentStepId) {
      const [parent] = await tx
        .select({ projectId: journeySteps.projectId, parentStepId: journeySteps.parentStepId })
        .from(journeySteps)
        .where(eq(journeySteps.id, input.parentStepId))
        .limit(1);
      if (!parent || parent.projectId !== projectId) throw notFound("Backbone activity");
      if (parent.parentStepId) throw unprocessable("Steps go under a backbone activity only");
    }
    const [last] = await tx
      .select({ p: max(journeySteps.position) })
      .from(journeySteps)
      .where(
        and(
          eq(journeySteps.projectId, projectId),
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
/** Step, persona, release and sprint links must all point inside the story's project. */
async function assertLinks(
  tx: DbOrTx,
  projectId: string,
  links: {
    journeyStepId?: string | null;
    personaId?: string | null;
    releaseId?: string | null;
    sprintId?: string | null;
  },
) {
  const checks: Array<Promise<void>> = [];
  const inProject = (
    table: typeof journeySteps | typeof personas | typeof releases | typeof sprints,
    linkId: string,
    label: string,
  ) =>
    checks.push(
      tx
        .select({ projectId: table.projectId })
        .from(table)
        .where(eq(table.id, linkId))
        .limit(1)
        .then(([row]) => {
          if (!row) throw notFound(label);
          if (row.projectId !== projectId) {
            throw unprocessable(`${label} belongs to a different project`);
          }
        }),
    );
  if (links.journeyStepId) inProject(journeySteps, links.journeyStepId, "Journey step");
  if (links.personaId) inProject(personas, links.personaId, "Persona");
  if (links.releaseId) inProject(releases, links.releaseId, "Release");
  if (links.sprintId) inProject(sprints, links.sprintId, "Sprint");
  await Promise.all(checks);
}

export async function createStoryFor(actor: Actor, input: CreateStoryInput): Promise<StoryDto> {
  await assertProjectVisible(actor, input.projectId);
  const id = await db.transaction(async (tx) => {
    const { projectId } = input;
    await assertProjectOpen(tx, projectId);
    await assertLinks(tx, projectId, input);
    await assertResponsibleUsers(tx, [input.responsibleId]);
    const [last] = await tx
      .select({ p: max(userStories.position) })
      .from(userStories)
      .where(
        and(
          eq(userStories.projectId, projectId),
          input.journeyStepId
            ? eq(userStories.journeyStepId, input.journeyStepId)
            : sql`${userStories.journeyStepId} IS NULL`,
        ),
      );
    const row = await insertStory(
      {
        projectId,
        createdById: actor.id,
        story: input.story,
        acceptanceCriteria: input.acceptanceCriteria ?? undefined,
        personaId: input.personaId ?? null,
        journeyStepId: input.journeyStepId ?? null,
        workType: input.workType,
        releaseId: input.releaseId ?? null,
        storyPoints: input.storyPoints ?? null,
        responsibleId: input.responsibleId ?? null,
        targetDate: input.targetDate ?? null,
        position: (last?.p ?? -1) + 1,
      },
      tx,
    );
    if (input.actionSteps && input.actionSteps.length > 0) {
      await syncActionSteps(tx, row.id, input.actionSteps);
    }
    return row.id;
  });
  return storyById(id);
}

/**
 * Applies the 100% rule after any change: an explicit move to completed with open steps is refused; a completed
 * story whose steps are no longer all done is reopened to in progress.
 */
async function resolveStatus(
  tx: DbOrTx,
  storyId: string,
  current: StoryStatus,
  requested: StoryStatus | undefined,
): Promise<StoryStatus | undefined> {
  const next = requested ?? current;
  if (next !== "completed") return requested;
  const steps = (await stepsByStory(tx, [storyId])).get(storyId) ?? [];
  const missing = steps.filter((s) => !s.isCompleted).map((s) => s.label);
  if (missing.length === 0) return requested;
  if (requested === "completed") throw stepsIncomplete(missing);
  // Not asked for: the story was already completed and a step was just unticked.
  return current === "completed" ? "in_progress" : requested;
}

export async function updateStory(
  _actor: Actor,
  id: string,
  patch: UpdateStoryInput,
): Promise<StoryDto> {
  const { actionSteps, ...fields } = patch;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(userStories)
      .where(eq(userStories.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Story");
    await assertProjectOpen(tx, current.projectId);
    await assertLinks(tx, current.projectId, fields);
    if (fields.responsibleId !== undefined) {
      await assertResponsibleUsers(tx, [fields.responsibleId], [current.responsibleId]);
    }
    if (actionSteps) await syncActionSteps(tx, id, actionSteps);
    const status = await resolveStatus(tx, id, current.status, fields.status);
    const set = status === undefined ? fields : { ...fields, status };
    if (Object.keys(set).length > 0) {
      await tx.update(userStories).set(set).where(eq(userStories.id, id));
    }
  });
  return storyById(id);
}

/** Ticks or unticks one action step without a full story save. */
export async function toggleActionStep(
  storyId: string,
  stepId: string,
  isCompleted: boolean,
): Promise<ToggleStoryActionStepResult> {
  return db.transaction(async (tx) => {
    const [story] = await tx
      .select({ projectId: userStories.projectId, status: userStories.status })
      .from(userStories)
      .where(eq(userStories.id, storyId))
      .for("update")
      .limit(1);
    if (!story) throw notFound("Story");
    await assertProjectOpen(tx, story.projectId);
    const step = await setStepCompleted(tx, storyId, stepId, isCompleted);
    if (!step) throw notFound("Action step");
    const steps = (await stepsByStory(tx, [storyId])).get(storyId) ?? [];
    const summary = storyCompletion(steps);
    let status = story.status;
    if (status === "completed" && summary.completedCount < summary.totalCount) {
      status = "in_progress";
      await tx.update(userStories).set({ status }).where(eq(userStories.id, storyId));
    }
    return { step, summary, status };
  });
}

export async function deleteStory(id: string) {
  const [row] = await db
    .delete(userStories)
    .where(eq(userStories.id, id))
    .returning({ id: userStories.id });
  if (!row) throw notFound("Story");
}
