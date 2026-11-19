import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CreateKanoInput, KanoDto, PromoteKanoInput, UpdateKanoInput } from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import {
  journeySteps,
  kanoRequests,
  projects,
  releases,
  sprints,
  subprojects,
  userStories,
} from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import { createKanoRequest, createStory } from "./moduleService";

/**
 * Kano Request Tracker. Scores are computed by the database (generated columns) from the WSJF and RICE
 * inputs, so they can never be typed in or drift. Promoting a request creates a user story (Story Map)
 * in the request's subproject and links it back; a request is promoted at most once.
 */

const kanoSprint = alias(sprints, "kano_sprint");
const kanoRelease = alias(releases, "kano_release");

type Row = {
  r: typeof kanoRequests.$inferSelect;
  subprojectCode: string | null;
  sprintName: string | null;
  releaseName: string | null;
  storyCode: string | null;
};

const num = (v: string | null): number | null => (v === null ? null : Number(v));

function toDto(x: Row): KanoDto {
  const r = x.r;
  return {
    id: r.id,
    projectId: r.projectId,
    code: r.code,
    subprojectId: r.subprojectId,
    subprojectCode: x.subprojectCode,
    description: r.description,
    requesterName: r.requesterName,
    requesterRole: r.requesterRole,
    kanoCategory: r.kanoCategory,
    decision: r.decision,
    targetSprintId: r.targetSprintId,
    targetSprintName: x.sprintName,
    targetReleaseId: r.targetReleaseId,
    targetReleaseName: x.releaseName,
    promotedStoryId: r.promotedStoryId,
    promotedStoryCode: x.storyCode,
    wsjfBusinessValue: r.wsjfBusinessValue,
    wsjfTimeCriticality: r.wsjfTimeCriticality,
    wsjfRiskReduction: r.wsjfRiskReduction,
    wsjfJobSize: r.wsjfJobSize,
    wsjfScore: num(r.wsjfScore),
    riceReach: r.riceReach,
    riceImpact: num(r.riceImpact),
    riceConfidence: r.riceConfidence,
    riceEffort: num(r.riceEffort),
    riceScore: num(r.riceScore),
    createdAt: r.createdAt.toISOString(),
  };
}

function baseQuery(tx: DbOrTx) {
  return tx
    .select({
      r: kanoRequests,
      subprojectCode: subprojects.code,
      sprintName: kanoSprint.name,
      releaseName: kanoRelease.name,
      storyCode: userStories.code,
    })
    .from(kanoRequests)
    .leftJoin(subprojects, eq(subprojects.id, kanoRequests.subprojectId))
    .leftJoin(kanoSprint, eq(kanoSprint.id, kanoRequests.targetSprintId))
    .leftJoin(kanoRelease, eq(kanoRelease.id, kanoRequests.targetReleaseId))
    .leftJoin(userStories, eq(userStories.id, kanoRequests.promotedStoryId));
}

async function assertWritable(tx: DbOrTx, projectId: string) {
  const [p] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) throw notFound("Project");
  if (p.archivedAt) throw conflict("This project is archived and read-only");
}

export type KanoFilters = {
  subprojectId?: string;
  kanoCategory?: KanoDto["kanoCategory"];
  decision?: KanoDto["decision"];
  unevaluated?: boolean;
  sort?: "wsjf" | "rice" | "code";
};

export async function listKano(projectId: string, f: KanoFilters = {}): Promise<KanoDto[]> {
  const where: SQL[] = [eq(kanoRequests.projectId, projectId)];
  if (f.subprojectId) where.push(eq(kanoRequests.subprojectId, f.subprojectId));
  if (f.kanoCategory) where.push(eq(kanoRequests.kanoCategory, f.kanoCategory));
  if (f.decision) where.push(eq(kanoRequests.decision, f.decision));
  if (f.unevaluated) where.push(sql`${kanoRequests.kanoCategory} IS NULL`);
  const order =
    f.sort === "rice"
      ? [sql`${kanoRequests.riceScore} DESC NULLS LAST`, asc(kanoRequests.seq)]
      : f.sort === "code"
        ? [asc(kanoRequests.seq)]
        : [sql`${kanoRequests.wsjfScore} DESC NULLS LAST`, asc(kanoRequests.seq)];
  const rows = await baseQuery(db)
    .where(and(...where))
    .orderBy(...order);
  return rows.map(toDto);
}

export async function getKano(id: string, tx: DbOrTx = db): Promise<KanoDto> {
  const [row] = await baseQuery(tx).where(eq(kanoRequests.id, id)).limit(1);
  if (!row) throw notFound("Request");
  return toDto(row);
}

export async function createKano(
  actor: Actor,
  projectId: string,
  input: CreateKanoInput,
): Promise<KanoDto> {
  const id = await db.transaction(async (tx) => {
    await assertWritable(tx, projectId);
    const row = await createKanoRequest(
      {
        projectId,
        createdById: actor.id,
        subprojectId: input.subprojectId ?? null,
        description: input.description,
        requesterName: input.requesterName,
        requesterRole: input.requesterRole ?? undefined,
      },
      tx,
    );
    return row.id;
  });
  return getKano(id);
}

const str = (n: number | null | undefined): string | null | undefined =>
  n === undefined ? undefined : n === null ? null : String(n);

export async function updateKano(id: string, patch: UpdateKanoInput): Promise<KanoDto> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(kanoRequests)
      .where(eq(kanoRequests.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Request");
    await assertWritable(tx, current.projectId);
    const { riceImpact, riceEffort, ...rest } = patch;
    const set: Partial<typeof kanoRequests.$inferInsert> = { ...rest };
    const impact = str(riceImpact);
    const effort = str(riceEffort);
    if (impact !== undefined) set.riceImpact = impact;
    if (effort !== undefined) set.riceEffort = effort;
    for (const k of Object.keys(set) as Array<keyof typeof set>) {
      if (set[k] === undefined) delete set[k];
    }
    if (Object.keys(set).length > 0) {
      await tx.update(kanoRequests).set(set).where(eq(kanoRequests.id, id));
    }
  });
  return getKano(id);
}

export async function deleteKano(id: string): Promise<void> {
  const [row] = await db
    .delete(kanoRequests)
    .where(eq(kanoRequests.id, id))
    .returning({ id: kanoRequests.id });
  if (!row) throw notFound("Request");
}

/** Turns a request into a backlog user story in its subproject and links the two. */
export async function promoteKano(
  actor: Actor,
  id: string,
  input: PromoteKanoInput,
): Promise<{ request: KanoDto; storyId: string }> {
  const storyId = await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(kanoRequests)
      .where(eq(kanoRequests.id, id))
      .for("update")
      .limit(1);
    if (!req) throw notFound("Request");
    await assertWritable(tx, req.projectId);
    if (req.promotedStoryId) throw conflict("This request has already been promoted to a story");
    if (!req.subprojectId) {
      throw unprocessable("Assign a subproject before promoting: stories live in a subproject");
    }
    if (input.journeyStepId) {
      const [step] = await tx
        .select({ subprojectId: journeySteps.subprojectId })
        .from(journeySteps)
        .where(eq(journeySteps.id, input.journeyStepId))
        .limit(1);
      if (!step || step.subprojectId !== req.subprojectId) throw notFound("Journey step");
    }
    const [last] = await tx
      .select({ p: sql<number | null>`max(${userStories.position})` })
      .from(userStories)
      .where(
        and(
          eq(userStories.subprojectId, req.subprojectId),
          input.journeyStepId
            ? eq(userStories.journeyStepId, input.journeyStepId)
            : sql`${userStories.journeyStepId} IS NULL`,
        ),
      );
    const story = await createStory(
      {
        projectId: req.projectId,
        createdById: actor.id,
        subprojectId: req.subprojectId,
        story: input.story ?? req.description,
        journeyStepId: input.journeyStepId ?? null,
        releaseId: req.targetReleaseId,
        position: (last?.p ?? -1) + 1,
      },
      tx,
    );
    await tx.update(kanoRequests).set({ promotedStoryId: story.id }).where(eq(kanoRequests.id, id));
    return story.id;
  });
  return { request: await getKano(id), storyId };
}
